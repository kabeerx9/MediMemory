import { randomUUID } from "node:crypto";

import type { SaveMemoryToolInput, SaveMemoryToolOutput } from "@caretalk/contracts/health";
import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { memories, profileVersions, workspaces } from "@caretalk/db/schema/health";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildMemoryTools, normalizeMetric, writeProfile } from "./memory-tools";

// Hits a real Postgres because the behaviour under test IS the transaction:
// supersession closes the old row and inserts the new one atomically, and a
// mock would assert nothing about that. Opt-in so a plain `pnpm test` stays
// hermetic; run with RUN_DB_TESTS=1 against a dev database.
//
//   RUN_DB_TESTS=1 pnpm -F server test
const enabled = process.env.RUN_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;

const userId = `test-user-${randomUUID()}`;
const workspaceId = `test-ws-${randomUUID()}`;

// buildMemoryTools returns the AI SDK's `ToolSet`, whose execute is typed for
// the SDK's own dispatch rather than for direct calls. Narrowing it once here
// keeps every test below reading like an ordinary tool call.
type SaveExecute = (
  input: SaveMemoryToolInput,
  options: unknown,
) => Promise<SaveMemoryToolOutput>;

async function save(input: Partial<SaveMemoryToolInput> & { content: string }) {
  const execute = buildMemoryTools(workspaceId).save_memory?.execute as SaveExecute | undefined;
  if (!execute) throw new Error("save_memory has no execute");

  return execute(
    {
      kind: "note",
      happenedOn: null,
      supersedesId: null,
      metric: null,
      value: null,
      valueSecondary: null,
      unit: null,
      ...input,
    },
    { toolCallId: randomUUID(), messages: [] },
  );
}

describeDb("memory tools against Postgres", () => {
  beforeAll(async () => {
    await db.insert(user).values({
      id: userId,
      name: "Test",
      email: `${userId}@example.test`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(workspaces).values({ id: workspaceId, ownerUserId: userId, name: "Test" });
  });

  afterAll(async () => {
    // Workspaces cascade from the user, memories from the workspace.
    await db.delete(user).where(eq(user.id, userId));
  });

  it("supersedes the prior state and keeps both rows", async () => {
    const first = await save({ content: "Lisinopril 10mg daily", kind: "medication" });
    const second = await save({
      content: "Lisinopril 20mg daily",
      kind: "medication",
      supersedesId: first.id,
    });

    expect(second.supersededId).toBe(first.id);
    expect(second.supersededContent).toBe("Lisinopril 10mg daily");

    const [old] = await db.select().from(memories).where(eq(memories.id, first.id));
    expect(old?.supersededById).toBe(second.id);
    expect(old?.supersededAt).toBeInstanceOf(Date);

    // History is never lost — the superseded row is still there, just inactive.
    const active = await db
      .select()
      .from(memories)
      .where(and(eq(memories.workspaceId, workspaceId), isNull(memories.supersededById)));
    expect(active.map((row) => row.id)).toContain(second.id);
    expect(active.map((row) => row.id)).not.toContain(first.id);
  });

  // The rule that silently destroys data when it goes wrong.
  it("leaves earlier readings active when a measurement accumulates", async () => {
    const first = await save({
      content: "Hemoglobin 11.2 g/dL",
      kind: "measurement",
      metric: "hemoglobin",
      value: 11.2,
      unit: "g/dL",
    });
    const second = await save({
      content: "Hemoglobin 11.6 g/dL",
      kind: "measurement",
      metric: "hemoglobin",
      value: 11.6,
      unit: "g/dL",
    });

    const [older] = await db.select().from(memories).where(eq(memories.id, first.id));
    expect(older?.supersededById).toBeNull();
    expect(second.value).toBe(11.6);
    expect(second.metric).toBe("hemoglobin");
  });

  // A stale ID must not cost the user the fact they just reported.
  it("still saves the fact when supersedesId is unknown, dropping only the link", async () => {
    const result = await save({ content: "Blood pressure 138/86", supersedesId: randomUUID() });
    expect(result.supersededId).toBeNull();

    const [row] = await db.select().from(memories).where(eq(memories.id, result.id));
    expect(row?.content).toBe("Blood pressure 138/86");
  });

  it("refuses to supersede a row in another workspace", async () => {
    const otherWorkspaceId = `test-ws-${randomUUID()}`;
    await db.insert(workspaces).values({
      id: otherWorkspaceId,
      ownerUserId: userId,
      name: "Other",
    });
    const foreignId = randomUUID();
    await db
      .insert(memories)
      .values({ id: foreignId, workspaceId: otherWorkspaceId, content: "Not yours" });

    const result = await save({ content: "Mine", supersedesId: foreignId });
    expect(result.supersededId).toBeNull();

    const [foreign] = await db.select().from(memories).where(eq(memories.id, foreignId));
    expect(foreign?.supersededById).toBeNull();
  });

  it("normalizes metric slugs so a series doesn't fragment", async () => {
    const result = await save({
      content: "HbA1c 6.4%",
      kind: "measurement",
      metric: " HbA1c Level ",
      value: 6.4,
    });
    expect(result.metric).toBe("hba1c_level");
    expect(normalizeMetric("Systolic BP")).toBe("systolic_bp");
    expect(normalizeMetric("  ")).toBeNull();
    expect(normalizeMetric(null)).toBeNull();
  });

  it("snapshots the outgoing profile before overwriting it", async () => {
    await writeProfile(workspaceId, "First profile", "model");
    await writeProfile(workspaceId, "Second profile", "user");

    const versions = await db
      .select()
      .from(profileVersions)
      .where(eq(profileVersions.workspaceId, workspaceId));

    // The snapshot holds what was REPLACED, so the first change records the
    // pre-existing null and the second records "First profile".
    expect(versions.map((row) => row.profile)).toContain("First profile");

    const [current] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(current?.profile).toBe("Second profile");
  });

  it("does not version a no-op profile save", async () => {
    await writeProfile(workspaceId, "Stable text", "user");
    const before = await db
      .select()
      .from(profileVersions)
      .where(eq(profileVersions.workspaceId, workspaceId));

    await writeProfile(workspaceId, "Stable text", "user");
    const after = await db
      .select()
      .from(profileVersions)
      .where(eq(profileVersions.workspaceId, workspaceId));

    expect(after.length).toBe(before.length);
  });
});
