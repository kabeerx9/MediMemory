import { randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { dailyMetrics } from "@caretalk/db/schema/devices";
import { trackerCheckinState, trackerCheckins, workoutLogs, workoutPlans } from "@caretalk/db/schema/tracker";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { getRequiredUserId } from "../lib/auth";
import { HttpError, notFound } from "../lib/http-error";
import { healthRepository } from "../repositories/health-repository";
import { getDailyMetricsForCaller } from "../whoop/tools";
import { authenticateToken, createApiToken, listApiTokens, revokeApiToken } from "./tokens";

// The Hermes health tracker's storage, over HTTP. Mirrors the SQLite store it
// replaces method for method (start/remind/save check-ins, workout logs,
// workout plans); the Python CLI keeps its conversational workflow and
// validation, and this layer re-checks the same ranges so Caretalk never
// stores what Hermes's own schema would have refused.
//
// Every route is bearer-token authenticated and scoped to the token's
// workspace — the path carries no workspace id to tamper with.

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), {
    message: "must be a real calendar date",
  });
const at = z.iso.datetime({ offset: true }).optional();

const checkinBody = z.object({
  calories_kcal: z.number().int().min(0).max(15000),
  exercised: z.boolean(),
  steps: z.number().int().min(0).max(200000).nullable(),
  weight_tenths_kg: z.number().int().min(200).max(4000).nullable(),
  note: z.string().max(500).nullable(),
  at,
});

const workoutBody = z.object({
  day_number: z.number().int().min(1).max(5).nullable(),
  note: z.string().max(300).nullable(),
  status: z.enum(["unknown", "done", "skipped"]),
  details: z.string().max(2000).nullable(),
  plan_id: z.string().min(1).max(128).nullable(),
  at,
});

const planBody = z.object({
  local_date: isoDate,
  horizon_end: isoDate,
  history_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  payload_json: z.string().min(2).max(50_000),
  at,
});

const stamp = (value: string | undefined) => (value ? new Date(value) : new Date());

function checkinOut(row: typeof trackerCheckins.$inferSelect) {
  return {
    local_date: row.localDate,
    calories_kcal: row.caloriesKcal,
    exercised: row.exercised,
    steps: row.steps,
    weight_tenths_kg: row.weightTenthsKg,
    note: row.note,
  };
}

function workoutOut(row: typeof workoutLogs.$inferSelect) {
  return { local_date: row.localDate, day_number: row.dayNumber, note: row.note, status: row.status, details: row.details, plan_id: row.planId };
}

function planOut(row: typeof workoutPlans.$inferSelect) {
  return {
    plan_id: row.planId,
    local_date: row.localDate,
    horizon_end: row.horizonEnd,
    history_fingerprint: row.historyFingerprint,
    payload_json: row.payloadJson,
    created_at_utc: row.createdAtUtc,
  };
}

export const trackerRoutes: FastifyPluginAsync = async (fastify) => {
  // Token management for the signed-in user (web app, session auth).
  fastify.get("/api/v1/api-tokens", async (request) => ({ tokens: await listApiTokens(await getRequiredUserId(request)) }));

  fastify.post("/api/v1/api-tokens", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, name } = z.object({ workspaceId: z.string().min(1).max(200), name: z.string().trim().min(1).max(80) }).parse(request.body);
    return createApiToken(userId, workspaceId, name);
  });

  fastify.delete("/api/v1/api-tokens/:id", async (request) => {
    const userId = await getRequiredUserId(request);
    const { id } = z.object({ id: z.string().min(1).max(200) }).parse(request.params);
    await revokeApiToken(userId, id);
    return { ok: true };
  });

  // Read-only workout history for the dashboard (session auth, owner-checked).
  fastify.get("/api/v1/workouts", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, from, to } = z.object({ workspaceId: z.string().min(1).max(200), from: isoDate, to: isoDate }).parse(request.query);
    await healthRepository.getWorkspace(userId, workspaceId);
    const rows = await db
      .select()
      .from(workoutLogs)
      .where(and(eq(workoutLogs.workspaceId, workspaceId), gte(workoutLogs.localDate, from), lte(workoutLogs.localDate, to)))
      .orderBy(asc(workoutLogs.localDate));
    return { workouts: rows.map(workoutOut) };
  });

  const caller = (request: FastifyRequest) => authenticateToken(request.headers.authorization);
  const dateParam = (request: FastifyRequest) => z.object({ date: isoDate }).parse(request.params).date;

  fastify.post("/api/tracker/v1/checkins/:date/start", async (request) => {
    const { workspaceId } = await caller(request);
    const date = dateParam(request);
    const { at: when } = z.object({ at }).parse(request.body ?? {});
    return db.transaction(async (tx) => {
      const [confirmed] = await tx
        .select({ d: trackerCheckins.localDate })
        .from(trackerCheckins)
        .where(and(eq(trackerCheckins.workspaceId, workspaceId), eq(trackerCheckins.localDate, date)));
      if (confirmed) return { result: "already_confirmed" };
      await tx
        .insert(trackerCheckinState)
        .values({ workspaceId, localDate: date, status: "pending", promptedAt: stamp(when) })
        .onConflictDoNothing();
      return { result: "prompt" };
    });
  });

  fastify.post("/api/tracker/v1/checkins/:date/reminder", async (request) => {
    const { workspaceId } = await caller(request);
    const date = dateParam(request);
    const { at: when } = z.object({ at }).parse(request.body ?? {});
    const rows = await db
      .update(trackerCheckinState)
      .set({ reminderSentAt: stamp(when) })
      .where(
        and(
          eq(trackerCheckinState.workspaceId, workspaceId),
          eq(trackerCheckinState.localDate, date),
          eq(trackerCheckinState.status, "pending"),
          isNull(trackerCheckinState.reminderSentAt),
        ),
      )
      .returning({ d: trackerCheckinState.localDate });
    return { remind: rows.length === 1 };
  });

  fastify.put("/api/tracker/v1/checkins/:date", async (request) => {
    const { workspaceId } = await caller(request);
    const date = dateParam(request);
    const body = checkinBody.parse(request.body);
    const when = stamp(body.at);
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ d: trackerCheckins.localDate })
        .from(trackerCheckins)
        .where(and(eq(trackerCheckins.workspaceId, workspaceId), eq(trackerCheckins.localDate, date)));
      const values = {
        caloriesKcal: body.calories_kcal,
        exercised: body.exercised,
        steps: body.steps,
        weightTenthsKg: body.weight_tenths_kg,
        note: body.note,
        updatedAt: when,
        confirmedAt: when,
      };
      await tx
        .insert(trackerCheckins)
        .values({ workspaceId, localDate: date, createdAt: when, ...values })
        .onConflictDoUpdate({ target: [trackerCheckins.workspaceId, trackerCheckins.localDate], set: values });
      await tx
        .insert(trackerCheckinState)
        .values({ workspaceId, localDate: date, status: "confirmed", promptedAt: when, completedAt: when })
        .onConflictDoUpdate({
          target: [trackerCheckinState.workspaceId, trackerCheckinState.localDate],
          set: { status: "confirmed", completedAt: when },
        });
      // The dashboard / MCP projection of the same day.
      const metrics = {
        caloriesKcal: body.calories_kcal,
        exercised: body.exercised,
        steps: body.steps,
        weightKg: body.weight_tenths_kg === null ? null : body.weight_tenths_kg / 10,
        computedAt: new Date(),
      };
      await tx
        .insert(dailyMetrics)
        .values({ id: randomUUID(), workspaceId, date, source: "hermes", ...metrics })
        .onConflictDoUpdate({ target: [dailyMetrics.workspaceId, dailyMetrics.date, dailyMetrics.source], set: metrics });
      return { result: existing ? "updated" : "created" };
    });
  });

  fastify.get("/api/tracker/v1/checkins/:date", async (request) => {
    const { workspaceId } = await caller(request);
    const date = dateParam(request);
    const [row] = await db
      .select()
      .from(trackerCheckins)
      .where(and(eq(trackerCheckins.workspaceId, workspaceId), eq(trackerCheckins.localDate, date)));
    if (!row) throw notFound("No check-in for that date");
    return checkinOut(row);
  });

  fastify.get("/api/tracker/v1/checkins", async (request) => {
    const { workspaceId } = await caller(request);
    const { from, to } = z.object({ from: isoDate, to: isoDate }).parse(request.query);
    const rows = await db
      .select()
      .from(trackerCheckins)
      .where(and(eq(trackerCheckins.workspaceId, workspaceId), gte(trackerCheckins.localDate, from), lte(trackerCheckins.localDate, to)))
      .orderBy(asc(trackerCheckins.localDate));
    return { records: rows.map(checkinOut) };
  });

  fastify.put("/api/tracker/v1/workouts/:date", async (request) => {
    const { workspaceId } = await caller(request);
    const date = dateParam(request);
    const body = workoutBody.parse(request.body);
    if (body.plan_id) {
      const [plan] = await db
        .select({ id: workoutPlans.planId })
        .from(workoutPlans)
        .where(and(eq(workoutPlans.workspaceId, workspaceId), eq(workoutPlans.planId, body.plan_id)));
      if (!plan) throw new HttpError(400, "plan_id must reference a stored workout plan", "VALIDATION_ERROR");
    }
    const values = { dayNumber: body.day_number, note: body.note, status: body.status, details: body.details, planId: body.plan_id };
    const [row] = await db
      .insert(workoutLogs)
      .values({ workspaceId, localDate: date, createdAt: stamp(body.at), ...values })
      .onConflictDoUpdate({ target: [workoutLogs.workspaceId, workoutLogs.localDate], set: values })
      // xmax = 0 only for a freshly inserted row: created vs updated in one round trip.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    return { result: row?.inserted ? "created" : "updated" };
  });

  fastify.get("/api/tracker/v1/workouts", async (request) => {
    const { workspaceId } = await caller(request);
    const query = z
      .object({
        from: isoDate.optional(),
        to: isoDate.optional(),
        status: z.enum(["unknown", "done", "skipped"]).optional(),
        order: z.enum(["asc", "desc"]).default("asc"),
        limit: z.coerce.number().int().min(1).max(1000).default(1000),
      })
      .parse(request.query);
    const rows = await db
      .select()
      .from(workoutLogs)
      .where(
        and(
          eq(workoutLogs.workspaceId, workspaceId),
          query.from ? gte(workoutLogs.localDate, query.from) : undefined,
          query.to ? lte(workoutLogs.localDate, query.to) : undefined,
          query.status ? eq(workoutLogs.status, query.status) : undefined,
        ),
      )
      .orderBy(query.order === "asc" ? asc(workoutLogs.localDate) : desc(workoutLogs.localDate))
      .limit(query.limit);
    return { workouts: rows.map(workoutOut) };
  });

  // Read-only daily metrics (e.g. WHOOP steps for Hermes's weekly report).
  // Same function as the get_daily_metrics MCP tool, scoped by the token.
  fastify.get("/api/tracker/v1/daily-metrics", async (request) => {
    const { userId, workspaceId } = await caller(request);
    const { from, to, source } = z.object({ from: isoDate, to: isoDate, source: z.string().max(40).optional() }).parse(request.query);
    const result = await getDailyMetricsForCaller(userId, workspaceId, { from, to });
    return { ...result, days: source ? result.days.filter((d) => d.source === source) : result.days };
  });

  fastify.get("/api/tracker/v1/plans/active", async (request) => {
    const { workspaceId } = await caller(request);
    const { asOf } = z.object({ asOf: isoDate }).parse(request.query);
    const [row] = await db
      .select()
      .from(workoutPlans)
      .where(and(eq(workoutPlans.workspaceId, workspaceId), lte(workoutPlans.localDate, asOf), gte(workoutPlans.horizonEnd, asOf)))
      .orderBy(desc(workoutPlans.localDate), desc(workoutPlans.createdAtUtc))
      .limit(1);
    return { plan: row ? planOut(row) : null };
  });

  fastify.get("/api/tracker/v1/plans/:id", async (request) => {
    const { workspaceId } = await caller(request);
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(request.params);
    const [row] = await db
      .select()
      .from(workoutPlans)
      .where(and(eq(workoutPlans.workspaceId, workspaceId), eq(workoutPlans.planId, id)));
    if (!row) throw notFound("No workout plan with that id");
    return planOut(row);
  });

  fastify.put("/api/tracker/v1/plans/:id", async (request) => {
    const { workspaceId } = await caller(request);
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(request.params);
    const body = planBody.parse(request.body);
    // Insert-if-absent first, then compare: two simultaneous saves can't both
    // pass a check-then-insert and collide on the primary key.
    const inserted = await db
      .insert(workoutPlans)
      .values({
        workspaceId,
        planId: id,
        localDate: body.local_date,
        horizonEnd: body.horizon_end,
        historyFingerprint: body.history_fingerprint,
        payloadJson: body.payload_json,
        createdAtUtc: body.at ?? new Date().toISOString(),
      })
      .onConflictDoNothing()
      .returning({ id: workoutPlans.planId });
    if (inserted.length === 1) return { result: "saved" };
    const [existing] = await db
      .select({ payloadJson: workoutPlans.payloadJson })
      .from(workoutPlans)
      .where(and(eq(workoutPlans.workspaceId, workspaceId), eq(workoutPlans.planId, id)));
    if (existing?.payloadJson === body.payload_json) return { result: "already_saved" };
    throw new HttpError(409, "plan_id already exists with different payload", "CONFLICT");
  });
};
