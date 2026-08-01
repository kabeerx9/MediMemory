import { randomUUID } from "node:crypto";

import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { chatMessages, chatSessions, workspaces } from "@caretalk/db/schema/health";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { healthRepository } from "./health-repository";

// Message ids come from the client (useChat generates them), so the chat
// persistence path has to be safe against an id it has seen before — replayed
// requests, a restored tab, or a hand-crafted one. Opt-in like the other DB
// suite: RUN_DB_TESTS=1.
const enabled = process.env.RUN_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;

const userId = `test-user-${randomUUID()}`;
const workspaceId = `test-ws-${randomUUID()}`;
const sessionA = `test-session-${randomUUID()}`;
const sessionB = `test-session-${randomUUID()}`;

describeDb("saveChatMessages", () => {
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
    await db.insert(chatSessions).values([
      { id: sessionA, workspaceId, title: "A" },
      { id: sessionB, workspaceId, title: "B" },
    ]);
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userId));
  });

  // useChat re-sends the whole message list every turn, so the same id arrives
  // repeatedly within one session and must update in place.
  it("upserts a repeated id within the same session", async () => {
    const id = randomUUID();
    await healthRepository.saveChatMessages(workspaceId, sessionA, [
      { id, role: "user", parts: [{ type: "text", text: "first" }] },
    ]);
    await healthRepository.saveChatMessages(workspaceId, sessionA, [
      { id, role: "user", parts: [{ type: "text", text: "second" }] },
    ]);

    const rows = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.parts).toEqual([{ type: "text", text: "second" }]);
  });

  it("never rewrites a message belonging to another session", async () => {
    const id = randomUUID();
    await healthRepository.saveChatMessages(workspaceId, sessionA, [
      { id, role: "user", parts: [{ type: "text", text: "session A message" }] },
    ]);

    await healthRepository.saveChatMessages(workspaceId, sessionB, [
      { id, role: "user", parts: [{ type: "text", text: "session B message" }] },
    ]);

    const [original] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    expect(original?.sessionId).toBe(sessionA);
    expect(original?.parts).toEqual([{ type: "text", text: "session A message" }]);
  });

  // Refusing to corrupt is only half the job — the message still has to land.
  it("stores the colliding message under a fresh id instead of dropping it", async () => {
    const id = randomUUID();
    await healthRepository.saveChatMessages(workspaceId, sessionA, [
      { id, role: "user", parts: [{ type: "text", text: "session A message" }] },
    ]);

    const saved = await healthRepository.saveChatMessages(workspaceId, sessionB, [
      { id, role: "user", parts: [{ type: "text", text: "session B message" }] },
    ]);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).not.toBe(id);
    expect(saved[0]?.sessionId).toBe(sessionB);

    const inSessionB = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionB));
    expect(inSessionB.map((row) => row.parts)).toContainEqual([
      { type: "text", text: "session B message" },
    ]);
  });
});
