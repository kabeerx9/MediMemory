import { randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { dailyMetrics } from "@caretalk/db/schema/devices";
import { workspaces } from "@caretalk/db/schema/health";
import { trackerCheckinState } from "@caretalk/db/schema/tracker";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiToken, revokeApiToken } from "./tokens";

// The Hermes tracker API end to end: bearer-token auth bound to one
// workspace, then the check-in / workout / plan contract the Python CLI's
// store relies on. Real Postgres because upserts and state transitions are
// the behaviour under test.
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const owner = `test-user-${randomUUID()}`;
const workspaceId = `test-ws-${randomUUID()}`;
const otherWorkspaceId = `test-ws-${randomUUID()}`;
let token = "";
let otherToken = "";

vi.mock("../lib/auth", () => ({ getRequiredUserId: async () => owner }));
const { buildApp } = await import("../app");

describeDb("tracker API against Postgres", () => {
  const app = buildApp();
  const call = (method: "GET" | "POST" | "PUT", url: string, body?: unknown, bearer = token) =>
    app.inject({ method, url: `/api/tracker/v1${url}`, headers: { authorization: `Bearer ${bearer}` }, ...(body ? { payload: body as object } : {}) });

  const checkin = (over: Record<string, unknown> = {}) => ({
    calories_kcal: 2100,
    exercised: true,
    steps: null,
    weight_tenths_kg: 1185,
    note: null,
    ...over,
  });

  beforeAll(async () => {
    await db.insert(user).values({ id: owner, name: "T", email: `${owner}@example.test`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(workspaces).values([
      { id: workspaceId, ownerUserId: owner, name: "Me" },
      { id: otherWorkspaceId, ownerUserId: owner, name: "Other" },
    ]);
    token = (await createApiToken(owner, workspaceId, "Hermes")).token;
    otherToken = (await createApiToken(owner, otherWorkspaceId, "Other")).token;
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, owner));
  });

  describe("auth", () => {
    it("rejects a missing token", async () => {
      const response = await app.inject({ method: "GET", url: "/api/tracker/v1/checkins/2026-10-01" });
      expect(response.statusCode).toBe(401);
    });

    it("rejects an unknown token", async () => {
      expect((await call("GET", "/checkins/2026-10-01", undefined, "ct_nope")).statusCode).toBe(401);
    });

    it("rejects a revoked token", async () => {
      const temp = await createApiToken(owner, workspaceId, "temp");
      await revokeApiToken(owner, temp.id);
      expect((await call("GET", "/checkins/2026-10-01", undefined, temp.token)).statusCode).toBe(401);
    });
  });

  describe("check-ins", () => {
    it("prompts once, then reports already confirmed after a save", async () => {
      expect((await call("POST", "/checkins/2026-10-02/start", {})).json()).toEqual({ result: "prompt" });
      expect((await call("PUT", "/checkins/2026-10-02", checkin())).json()).toEqual({ result: "created" });
      expect((await call("POST", "/checkins/2026-10-02/start", {})).json()).toEqual({ result: "already_confirmed" });
    });

    it("sends one reminder for a pending check-in and none once confirmed", async () => {
      await call("POST", "/checkins/2026-10-03/start", {});
      expect((await call("POST", "/checkins/2026-10-03/reminder", {})).json()).toEqual({ remind: true });
      expect((await call("POST", "/checkins/2026-10-03/reminder", {})).json()).toEqual({ remind: false });
      expect((await call("POST", "/checkins/2026-10-02/reminder", {})).json()).toEqual({ remind: false });
    });

    it("updates an existing record and marks the day confirmed", async () => {
      expect((await call("PUT", "/checkins/2026-10-02", checkin({ calories_kcal: 1900 }))).json()).toEqual({ result: "updated" });
      expect((await call("GET", "/checkins/2026-10-02")).json()).toMatchObject({ local_date: "2026-10-02", calories_kcal: 1900 });
      const [state] = await db
        .select()
        .from(trackerCheckinState)
        .where(and(eq(trackerCheckinState.workspaceId, workspaceId), eq(trackerCheckinState.localDate, "2026-10-02")));
      expect(state?.status).toBe("confirmed");
    });

    it("projects a confirmed check-in into daily_metrics for the dashboard", async () => {
      const [row] = await db
        .select()
        .from(dailyMetrics)
        .where(and(eq(dailyMetrics.workspaceId, workspaceId), eq(dailyMetrics.date, "2026-10-02"), eq(dailyMetrics.source, "hermes")));
      expect(row).toMatchObject({ caloriesKcal: 1900, weightKg: 118.5, exercised: true, steps: null });
    });

    it("rejects out-of-range values", async () => {
      expect((await call("PUT", "/checkins/2026-10-04", checkin({ calories_kcal: 20000 }))).statusCode).toBe(400);
      expect((await call("PUT", "/checkins/2026-10-04", checkin({ weight_tenths_kg: 50 }))).statusCode).toBe(400);
      expect((await call("PUT", "/checkins/2026-13-40", checkin())).statusCode).toBe(400);
    });

    it("keeps a client-supplied timestamp (migration and test clocks)", async () => {
      await call("PUT", "/checkins/2026-09-21", checkin({ at: "2026-09-21T16:00:00.000Z" }));
      const [state] = await db
        .select()
        .from(trackerCheckinState)
        .where(and(eq(trackerCheckinState.workspaceId, workspaceId), eq(trackerCheckinState.localDate, "2026-09-21")));
      expect(state?.completedAt?.toISOString()).toBe("2026-09-21T16:00:00.000Z");
    });

    it("lists a range in date order and 404s a missing day", async () => {
      const range = (await call("GET", "/checkins?from=2026-09-01&to=2026-10-31")).json();
      expect(range.records.map((r: { local_date: string }) => r.local_date)).toEqual(["2026-09-21", "2026-10-02"]);
      expect((await call("GET", "/checkins/2026-01-01")).statusCode).toBe(404);
    });

    it("never shows one workspace's data to another workspace's token", async () => {
      const range = (await call("GET", "/checkins?from=2026-09-01&to=2026-10-31", undefined, otherToken)).json();
      expect(range.records).toEqual([]);
    });
  });

  describe("workouts and plans", () => {
    const plan = (over: Record<string, unknown> = {}) => ({
      local_date: "2026-10-05",
      horizon_end: "2026-10-11",
      history_fingerprint: "a".repeat(64),
      payload_json: '{"plan_id":"p1","x":1}',
      ...over,
    });

    it("stores and lists workout logs", async () => {
      expect((await call("PUT", "/workouts/2026-10-05", { day_number: 2, note: null, status: "done", details: "Push day", plan_id: null })).json()).toEqual({
        result: "created",
      });
      expect((await call("PUT", "/workouts/2026-10-05", { day_number: 2, note: "felt good", status: "done", details: "Push day", plan_id: null })).json()).toEqual({
        result: "updated",
      });
      const list = (await call("GET", "/workouts?from=2026-10-01&to=2026-10-31")).json();
      expect(list.workouts).toEqual([
        { local_date: "2026-10-05", day_number: 2, note: "felt good", status: "done", details: "Push day", plan_id: null },
      ]);
    });

    it("rejects an invalid workout status", async () => {
      expect((await call("PUT", "/workouts/2026-10-06", { day_number: 1, note: null, status: "maybe", details: null, plan_id: null })).statusCode).toBe(400);
    });

    it("saves a plan idempotently and refuses a conflicting payload", async () => {
      expect((await call("PUT", "/plans/p1", plan())).json()).toEqual({ result: "saved" });
      expect((await call("PUT", "/plans/p1", plan())).json()).toEqual({ result: "already_saved" });
      expect((await call("PUT", "/plans/p1", plan({ payload_json: '{"plan_id":"p1","x":2}' }))).statusCode).toBe(409);
      expect((await call("GET", "/plans/p1")).json()).toMatchObject({ plan_id: "p1", payload_json: '{"plan_id":"p1","x":1}' });
    });

    it("finds the plan in force on a date", async () => {
      expect((await call("GET", "/plans/active?asOf=2026-10-08")).json().plan).toMatchObject({ plan_id: "p1" });
      expect((await call("GET", "/plans/active?asOf=2026-10-20")).json().plan).toBeNull();
    });
  });

  describe("daily metrics for reports", () => {
    it("returns the token workspace's WHOOP rows for a range", async () => {
      await db.insert(dailyMetrics).values({ id: randomUUID(), workspaceId, date: "2026-10-07", source: "whoop", steps: 9120, strain: 11 });
      const body = (await call("GET", "/daily-metrics?from=2026-10-01&to=2026-10-31&source=whoop")).json();
      expect(body.days).toEqual([expect.objectContaining({ date: "2026-10-07", source: "whoop", steps: 9120 })]);
    });
  });

  describe("token management (web, session auth)", () => {
    it("creates a token shown once, lists it without the secret, and revokes it", async () => {
      const created = await app.inject({ method: "POST", url: "/api/v1/api-tokens", payload: { workspaceId, name: "Hermes CLI" } });
      expect(created.statusCode).toBe(200);
      const { id, token: secret } = created.json();
      expect(secret).toMatch(/^ct_/);

      const listed = (await app.inject({ method: "GET", url: "/api/v1/api-tokens" })).json();
      const entry = listed.tokens.find((t: { id: string }) => t.id === id);
      expect(entry).toMatchObject({ name: "Hermes CLI", workspaceId });
      expect(JSON.stringify(listed)).not.toContain(secret);

      expect((await app.inject({ method: "DELETE", url: `/api/v1/api-tokens/${id}` })).statusCode).toBe(200);
      expect((await call("GET", "/checkins?from=2026-09-01&to=2026-10-31", undefined, secret)).statusCode).toBe(401);
    });
  });
});
