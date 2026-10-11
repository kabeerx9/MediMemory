import { randomBytes, randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { dailyMetrics, deviceConnections, whoopRecords } from "@caretalk/db/schema/devices";
import { workspaces } from "@caretalk/db/schema/health";
import { and, count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { WhoopConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import { lockKey, syncConnection } from "./sync";
import { FakeWhoop } from "./testing/fake-whoop";

// Real Postgres: the behaviour under test is persistence ordering (rotated
// refresh token saved before use), upsert idempotency, and the advisory lock
// — none of which a mock can show. RUN_DB_TESTS=1 pnpm -F server test
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const userId = `test-user-${randomUUID()}`;
const workspaceId = `test-ws-${randomUUID()}`;
const key = randomBytes(32);
let fake: FakeWhoop;
let cfg: WhoopConfig;
let connectionId: string;

const NOW = new Date("2026-10-11T12:00:00Z");

function seedWhoopData(fake: FakeWhoop) {
  fake.collections.set("/developer/v2/activity/sleep", [
    {
      id: "sleep-1",
      cycle_id: 101,
      start: "2026-10-10T17:30:00Z",
      end: "2026-10-11T01:30:00Z",
      created_at: "2026-10-11T01:35:00Z",
      nap: false,
      score_state: "SCORED",
      score: {
        stage_summary: {
          total_in_bed_time_milli: 28_800_000,
          total_light_sleep_time_milli: 12_000_000,
          total_slow_wave_sleep_time_milli: 6_000_000,
          total_rem_sleep_time_milli: 6_000_000,
        },
        sleep_performance_percentage: 90,
      },
    },
  ]);
  fake.collections.set("/developer/v2/recovery", [
    {
      sleep_id: "sleep-1",
      cycle_id: 101,
      created_at: "2026-10-11T01:40:00Z",
      score_state: "SCORED",
      score: { recovery_score: 71, hrv_rmssd_milli: 60, resting_heart_rate: 55 },
    },
  ]);
  fake.collections.set("/developer/v2/cycle", [
    { id: 101, start: "2026-10-10T17:30:00Z", score_state: "SCORED", step_count: 7000, score: { strain: 11.2, kilojoule: 8000 } },
  ]);
  fake.collections.set("/developer/v2/activity/workout", [
    { id: "w-1", start: "2026-10-11T03:00:00Z", end: "2026-10-11T04:00:00Z", score_state: "SCORED", score: { strain: 9.5 } },
  ]);
}

async function connection() {
  const [row] = await db.select().from(deviceConnections).where(eq(deviceConnections.id, connectionId));
  return row!;
}

async function rowCount(table: typeof whoopRecords | typeof dailyMetrics) {
  const where = table === whoopRecords ? eq(whoopRecords.connectionId, connectionId) : eq(dailyMetrics.workspaceId, workspaceId);
  const [row] = await db.select({ n: count() }).from(table).where(where);
  return row!.n;
}

describeDb("WHOOP sync against Postgres", () => {
  beforeAll(async () => {
    await db.insert(user).values({
      id: userId,
      name: "Test",
      email: `${userId}@example.test`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(workspaces).values({ id: workspaceId, ownerUserId: userId, name: "Me" });
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  beforeEach(async () => {
    fake = await new FakeWhoop().start();
    seedWhoopData(fake);
    cfg = { clientId: "cid", clientSecret: "secret", key, apiBase: fake.baseUrl };
    connectionId = randomUUID();
    await db.delete(deviceConnections).where(eq(deviceConnections.workspaceId, workspaceId));
    await db.delete(dailyMetrics).where(eq(dailyMetrics.workspaceId, workspaceId));
    await db.insert(deviceConnections).values({
      id: connectionId,
      workspaceId,
      provider: "whoop",
      refreshTokenEnc: encryptToken(fake.validRefreshToken, key),
      status: "active",
    });
  });

  afterEach(async () => {
    await fake.stop();
  });

  it("backfills records and derives daily metrics", async () => {
    const result = await syncConnection(connectionId, { cfg, now: NOW });

    expect(result.status).toBe("ok");
    expect(await rowCount(whoopRecords)).toBe(5); // sleep, recovery, cycle, workout, body
    const [day] = await db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.workspaceId, workspaceId), eq(dailyMetrics.date, "2026-10-11")));
    expect(day).toMatchObject({ source: "whoop", recoveryScore: 71, hrvMs: 60, sleepMinutes: 400, strain: 11.2, steps: 7000, workoutCount: 1 });
    expect((await connection()).lastSyncedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("is idempotent across reruns", async () => {
    await syncConnection(connectionId, { cfg, now: NOW });
    await syncConnection(connectionId, { cfg, now: new Date(NOW.getTime() + 60_000) });

    expect(await rowCount(whoopRecords)).toBe(5);
    expect(await rowCount(dailyMetrics)).toBe(1);
  });

  it("persists the rotated refresh token before using it", async () => {
    await syncConnection(connectionId, { cfg, now: NOW });
    const after = await connection();

    // The fake has already invalidated refresh-0; only the stored token works.
    expect(decryptToken(after.refreshTokenEnc!, key)).toBe(fake.validRefreshToken);
    expect(fake.validRefreshToken).not.toBe("refresh-0");

    // Expire the cached access token: the next run must refresh with what we stored.
    await db.update(deviceConnections).set({ accessExpiresAt: new Date(0) }).where(eq(deviceConnections.id, connectionId));
    expect((await syncConnection(connectionId, { cfg, now: NOW })).status).toBe("ok");
  });

  it("marks the connection for reconnect when the refresh token is rejected", async () => {
    await db
      .update(deviceConnections)
      .set({ refreshTokenEnc: encryptToken("stale-token", key) })
      .where(eq(deviceConnections.id, connectionId));

    const result = await syncConnection(connectionId, { cfg, now: NOW });

    expect(result.status).toBe("needs_reconnect");
    expect((await connection()).status).toBe("needs_reconnect");
  });

  it("refuses to run while another sync holds the lock", async () => {
    const holder = await db.$client.connect();
    try {
      await holder.query("select pg_advisory_lock($1)", [lockKey(connectionId)]);
      const result = await syncConnection(connectionId, { cfg, now: NOW });
      expect(result.status).toBe("busy");
      expect(fake.requests).toHaveLength(0);
    } finally {
      await holder.query("select pg_advisory_unlock($1)", [lockKey(connectionId)]);
      holder.release();
    }
  });

  it("re-fetches from 48 hours before the last sync", async () => {
    const lastSynced = new Date("2026-10-11T06:00:00Z");
    await db.update(deviceConnections).set({ lastSyncedAt: lastSynced }).where(eq(deviceConnections.id, connectionId));

    await syncConnection(connectionId, { cfg, now: NOW });

    const cycleRequest = fake.requests.find((r) => r.path === "/developer/v2/cycle");
    expect(cycleRequest?.query.get("start")).toBe("2026-10-09T06:00:00.000Z");
  });

  it("recovers from a 401 mid-sync by refreshing once", async () => {
    // A cached access token the fake doesn't accept.
    await db
      .update(deviceConnections)
      .set({ accessTokenEnc: encryptToken("revoked-elsewhere", key), accessExpiresAt: new Date(NOW.getTime() + 3_600_000) })
      .where(eq(deviceConnections.id, connectionId));

    expect((await syncConnection(connectionId, { cfg, now: NOW })).status).toBe("ok");
  });
});
