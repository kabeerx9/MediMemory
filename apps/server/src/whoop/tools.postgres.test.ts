import { randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { dailyMetrics, deviceConnections } from "@caretalk/db/schema/devices";
import { workspaces } from "@caretalk/db/schema/health";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dailySummaryForWorkspace, getDailyMetricsForCaller } from "./tools";

// Real Postgres: the property under test is that a caller only ever reads
// their own workspace's rows, whatever id the model passes.
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const owner = `test-user-${randomUUID()}`;
const stranger = `test-user-${randomUUID()}`;
const workspaceId = `test-ws-${randomUUID()}`;
const emptyWorkspaceId = `test-ws-${randomUUID()}`;

describeDb("daily metrics tools against Postgres", () => {
  beforeAll(async () => {
    for (const id of [owner, stranger]) {
      await db.insert(user).values({ id, name: "T", email: `${id}@example.test`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() });
    }
    await db.insert(workspaces).values([
      { id: workspaceId, ownerUserId: owner, name: "Me" },
      { id: emptyWorkspaceId, ownerUserId: owner, name: "Other" },
    ]);
    await db.insert(deviceConnections).values({ id: randomUUID(), workspaceId, provider: "whoop", status: "active" });
    await db.insert(dailyMetrics).values(
      ["2026-10-12", "2026-10-10", "2026-10-11"].map((date, i) => ({
        id: randomUUID(),
        workspaceId,
        date,
        source: "whoop",
        recoveryScore: 60 + i,
        hrvMs: 50,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, owner));
    await db.delete(user).where(eq(user.id, stranger));
  });

  it("returns the caller's rows in date order", async () => {
    const result = await getDailyMetricsForCaller(owner, workspaceId, { from: "2026-10-01", to: "2026-10-31" });
    expect(result.days.map((d) => d.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
  });

  it("returns only the requested metrics", async () => {
    const result = await getDailyMetricsForCaller(owner, workspaceId, { from: "2026-10-10", to: "2026-10-10", metrics: ["hrvMs"] });
    expect(result.days[0]).toEqual({ date: "2026-10-10", source: "whoop", hrvMs: 50 });
  });

  it("rejects a workspace the caller doesn't own", async () => {
    await expect(getDailyMetricsForCaller(stranger, workspaceId, { from: "2026-10-01", to: "2026-10-31" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("caps the range at 366 days", async () => {
    await expect(getDailyMetricsForCaller(owner, workspaceId, { from: "2025-01-01", to: "2026-10-31" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects a reversed range", async () => {
    await expect(getDailyMetricsForCaller(owner, workspaceId, { from: "2026-10-31", to: "2026-10-01" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("builds the summary only for a workspace with a WHOOP connection", async () => {
    expect((await dailySummaryForWorkspace(workspaceId, "2026-10-12"))?.join("\n")).toContain("Recovery 61%");
    expect(await dailySummaryForWorkspace(emptyWorkspaceId, "2026-10-12")).toBeNull();
  });
});
