import { randomBytes, randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { deviceConnections } from "@caretalk/db/schema/devices";
import { workspaces } from "@caretalk/db/schema/health";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { WhoopConfig } from "../whoop/config";
import { FakeWhoop } from "../whoop/testing/fake-whoop";

// The connect round trip against Postgres and a fake WHOOP: state is bound to
// the user who started it, single-use, and the callback stores encrypted
// tokens. Session auth is stubbed — better-auth isn't what's under test.
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const owner = `test-user-${randomUUID()}`;
const stranger = `test-user-${randomUUID()}`;
const workspaceId = `test-ws-${randomUUID()}`;
const fake = new FakeWhoop();
let cfg: WhoopConfig | null = null;
let currentUser = owner;

vi.mock("../lib/auth", () => ({ getRequiredUserId: async () => currentUser }));
vi.mock("../whoop/config", () => ({ whoopConfig: () => cfg }));

const { buildApp } = await import("../app");

describeDb("WHOOP connect flow against Postgres", () => {
  const app = buildApp();

  beforeAll(async () => {
    await fake.start();
    cfg = { clientId: "cid", clientSecret: "secret", key: randomBytes(32), apiBase: fake.baseUrl };
    for (const id of [owner, stranger]) {
      await db.insert(user).values({ id, name: "T", email: `${id}@example.test`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() });
    }
    await db.insert(workspaces).values({ id: workspaceId, ownerUserId: owner, name: "Me" });
  });

  afterAll(async () => {
    await fake.stop();
    await db.delete(user).where(eq(user.id, owner));
    await db.delete(user).where(eq(user.id, stranger));
  });

  async function startConnect() {
    const response = await app.inject({ method: "GET", url: `/api/whoop/connect?workspaceId=${workspaceId}` });
    expect(response.statusCode).toBe(302);
    return new URL(response.headers.location as string).searchParams.get("state")!;
  }

  it("won't start a connect flow for someone else's workspace", async () => {
    currentUser = stranger;
    try {
      const response = await app.inject({ method: "GET", url: `/api/whoop/connect?workspaceId=${workspaceId}` });
      expect(response.statusCode).toBe(404);
    } finally {
      currentUser = owner;
    }
  });

  it("rejects a callback with an unknown state", async () => {
    const response = await app.inject({ method: "GET", url: "/api/whoop/callback?code=good-code&state=forged" });
    expect(response.headers.location).toMatch(/whoop=error$/);
  });

  it("connects, stores encrypted tokens, and reports status", async () => {
    const state = await startConnect();
    const callback = await app.inject({ method: "GET", url: `/api/whoop/callback?code=good-code&state=${state}` });
    expect(callback.headers.location).toMatch(/whoop=connected$/);

    const [row] = await db.select().from(deviceConnections).where(eq(deviceConnections.workspaceId, workspaceId));
    expect(row?.status).toBe("active");
    expect(row?.externalUserId).toBe("42");
    expect(row?.refreshTokenEnc).not.toContain("refresh-");

    const status = await app.inject({ method: "GET", url: `/api/v1/whoop?workspaceId=${workspaceId}` });
    expect(status.json()).toMatchObject({ configured: true, connection: { status: "active" } });
  });

  it("uses a state only once", async () => {
    const state = await startConnect();
    await app.inject({ method: "GET", url: `/api/whoop/callback?code=good-code&state=${state}` });
    const replay = await app.inject({ method: "GET", url: `/api/whoop/callback?code=good-code&state=${state}` });
    expect(replay.headers.location).toMatch(/whoop=error$/);
  });

  it("disconnects: revokes at WHOOP and drops the tokens", async () => {
    const response = await app.inject({ method: "DELETE", url: `/api/v1/whoop?workspaceId=${workspaceId}` });
    expect(response.statusCode).toBe(200);
    const [row] = await db.select().from(deviceConnections).where(eq(deviceConnections.workspaceId, workspaceId));
    expect(row?.status).toBe("revoked");
    expect(row?.refreshTokenEnc).toBeNull();
    expect(fake.revoked).toBe(true);
  });
});
