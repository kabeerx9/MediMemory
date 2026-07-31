import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

const seedEmail = process.env.SEED_USER_EMAIL;
const forceSeed = process.env.FORCE_SEED === "true";

if (!seedEmail) throw new Error("SEED_USER_EMAIL is required");

const [{ db }, { user }, healthSchema] = await Promise.all([
  import("./index"),
  import("./schema/auth"),
  import("./schema/health"),
]);

const { chatMessages, chatSessions, memories, sources, workspaces } = healthSchema;

const [owner] = await db.select().from(user).where(eq(user.email, seedEmail)).limit(1);
if (!owner) throw new Error("No Better Auth user found for SEED_USER_EMAIL=" + seedEmail);

const workspaceName = "Dad — kidney health";

const [existingWorkspace] = await db
  .select()
  .from(workspaces)
  .where(and(eq(workspaces.ownerUserId, owner.id), eq(workspaces.name, workspaceName)))
  .limit(1);

if (existingWorkspace && !forceSeed) {
  console.log("Seed workspace already exists:", workspaceName, "for", seedEmail, "- set FORCE_SEED=true to reseed.");
  process.exit(0);
}

const profile = [
  "## Current status",
  "Stage 3 chronic kidney disease (CKD), diagnosed November 2025. Managed with medication and dietary changes; monitored via quarterly labs.",
  "",
  "## Current medications",
  "- Lisinopril 10mg once daily (blood pressure / kidney protection)",
  "",
  "## Next appointment",
  "Nephrology follow-up — 2026-08-15",
  "",
  "## Open questions",
  "- Whether to start a potassium binder given the recent lab trend",
].join("\n");

const workspaceId = existingWorkspace?.id ?? randomUUID();
const description = "Tracking Dad's kidney health journey.";

if (existingWorkspace) {
  // Reseeding: wipe this workspace's downstream rows first so FORCE_SEED
  // produces a clean demo state instead of duplicating everything below.
  await db.update(workspaces).set({ description, profile }).where(eq(workspaces.id, workspaceId));
  await db.delete(chatMessages).where(eq(chatMessages.workspaceId, workspaceId));
  await db.delete(chatSessions).where(eq(chatSessions.workspaceId, workspaceId));
  await db.delete(memories).where(eq(memories.workspaceId, workspaceId));
  await db.delete(sources).where(eq(sources.workspaceId, workspaceId));
} else {
  await db.insert(workspaces).values({ id: workspaceId, ownerUserId: owner.id, name: workspaceName, description, profile });
}

const sourceId = randomUUID();
await db.insert(sources).values({ id: sourceId, workspaceId, type: "seed", title: "Seed data", content: null });

const oldDoseId = randomUUID();
const newDoseId = randomUUID();

await db.insert(memories).values([
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "event",
    content: "Diagnosed with Stage 3 CKD after routine bloodwork showed elevated creatinine.",
    happenedOn: "2025-11-03",
  },
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "measurement",
    content: "Creatinine 1.8 mg/dL, eGFR 42.",
    happenedOn: "2025-11-03",
  },
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "measurement",
    content: "Creatinine 1.9 mg/dL, eGFR 40.",
    happenedOn: "2026-02-10",
  },
  {
    id: oldDoseId,
    workspaceId,
    sourceId,
    kind: "medication",
    content: "Started Lisinopril 5mg once daily for blood pressure and kidney protection.",
    happenedOn: "2025-11-10",
    supersededById: newDoseId,
    supersededAt: new Date("2026-01-15"),
  },
  {
    id: newDoseId,
    workspaceId,
    sourceId,
    kind: "medication",
    content: "Lisinopril increased to 10mg once daily after a follow-up blood pressure check.",
    happenedOn: "2026-01-15",
  },
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "symptom",
    content: "Mild ankle swelling in the evenings.",
    happenedOn: "2026-01-05",
  },
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "appointment",
    content: "Nephrology follow-up scheduled.",
    happenedOn: "2026-08-15",
  },
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "question",
    content: "Ask the nephrologist whether a potassium binder is needed given the rising potassium trend.",
    happenedOn: null,
  },
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "note",
    content: "Cut back on added salt at home; the family switched to low-sodium recipes.",
    happenedOn: null,
  },
  {
    id: randomUUID(),
    workspaceId,
    sourceId,
    kind: "measurement",
    content: "Blood pressure 138/86 on the home cuff.",
    happenedOn: "2026-03-02",
  },
]);

const sessionId = randomUUID();
await db.insert(chatSessions).values({ id: sessionId, workspaceId, title: "First check-in" });

await db.insert(chatMessages).values([
  {
    id: randomUUID(),
    workspaceId,
    sessionId,
    role: "user",
    parts: [
      {
        type: "text",
        text: "Dad's follow-up labs came back — creatinine is 1.9, up slightly from 1.8. Should we be worried?",
      },
    ],
  },
  {
    id: randomUUID(),
    workspaceId,
    sessionId,
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "A rise from 1.8 to 1.9 mg/dL is small and within the usual week-to-week variation for these labs, so it isn't necessarily a sign of worsening — but it's worth keeping an eye on. I've saved this reading to memory so we can track the trend over time.",
      },
    ],
  },
]);

console.log("Seeded workspace", workspaceName, "for", seedEmail);
