import { randomUUID } from "node:crypto";

import {
  memoryKindSchema,
  saveMemoryToolInputSchema,
  updateProfileToolInputSchema,
  type SaveMemoryToolOutput,
} from "@caretalk/contracts/health";
import { db } from "@caretalk/db";
import { memories, profileVersions, workspaces } from "@caretalk/db/schema/health";
import { tool, type ToolSet } from "ai";
import { and, eq, isNull } from "drizzle-orm";

// The model's write path. Both tools are scoped to one workspace at build time —
// the model never chooses the workspace, so a confused tool call can't write
// across tenants.
//
// Supersession policy (enforced here, not just prompted): a memory is never
// edited or deleted by the model. save_memory with supersedesId closes the old
// row (supersededById + supersededAt) inside the same transaction that inserts
// the new one, so history can't half-update.
// Explicit ToolSet return type: the inferred structural type embeds AI SDK
// internals that aren't publicly nameable, which breaks declaration emit
// (TS2883) under composite builds.
// Exported so the eval harness exercises the exact text shipped to the model.
// A policy regression is almost always a wording change in one of these two
// strings or in the system prompt, and an eval that paraphrases them tests
// nothing.
export const SAVE_MEMORY_DESCRIPTION =
  "Save one atomic health fact to permanent memory. Use for durable facts only: " +
  "measurements (with value+unit+date), medication changes, symptoms, events, " +
  "appointments, questions for the doctor. Never save speculation, anxiety, your own " +
  "explanations, or the user's questions to you. Measurements always accumulate — " +
  "never pass supersedesId for a new reading. Use supersedesId only when a fact " +
  "replaces a prior state (dose changed, symptom resolved, appointment moved). " +
  "For any numeric reading also fill metric/value/unit (and valueSecondary for " +
  "blood pressure) so the series can be charted.";

export const UPDATE_PROFILE_DESCRIPTION =
  "Rewrite the workspace profile — the short always-visible summary of current state: " +
  "diagnosis, current treatment, current status, next appointment. Full replacement, " +
  "markdown, under ~30 lines. Update it when current state meaningfully changes, " +
  "not for individual data points (those go to save_memory).";

export function buildMemoryTools(workspaceId: string, options?: { sourceId?: string }): ToolSet {
  const sourceId = options?.sourceId ?? null;
  return {
    save_memory: tool({
      description: SAVE_MEMORY_DESCRIPTION,
      inputSchema: saveMemoryToolInputSchema,
      execute: async ({
        content,
        kind,
        happenedOn,
        supersedesId,
        metric,
        value,
        valueSecondary,
        unit,
      }): Promise<SaveMemoryToolOutput> => {
        // Soft taxonomy: unknown kinds degrade to "note" instead of failing the turn.
        const parsedKind = memoryKindSchema.safeParse(kind);
        const safeKind = parsedKind.success ? parsedKind.data : "note";

        return db.transaction(async (tx) => {
          let supersededContent: string | null = null;

          if (supersedesId) {
            const [target] = await tx
              .select()
              .from(memories)
              .where(
                and(
                  eq(memories.id, supersedesId),
                  eq(memories.workspaceId, workspaceId),
                  isNull(memories.supersededById),
                ),
              );
            // Wrong/stale ID → save as a plain ADD rather than failing the chat
            // turn. The fact still lands; only the linkage is lost.
            supersededContent = target?.content ?? null;
          }

          const id = randomUUID();
          const [row] = await tx
            .insert(memories)
            .values({
              id,
              workspaceId,
              content,
              kind: safeKind,
              happenedOn: happenedOn ?? null,
              metric: normalizeMetric(metric),
              value: value ?? null,
              valueSecondary: valueSecondary ?? null,
              unit: unit?.trim() || null,
              sourceId,
            })
            .returning();

          if (supersedesId && supersededContent !== null) {
            await tx
              .update(memories)
              .set({ supersededById: id, supersededAt: new Date() })
              .where(and(eq(memories.id, supersedesId), eq(memories.workspaceId, workspaceId)));
          }

          if (!row) throw new Error("memory insert returned no row");
          return {
            id: row.id,
            content: row.content,
            kind: safeKind,
            happenedOn: row.happenedOn,
            metric: row.metric,
            value: row.value,
            valueSecondary: row.valueSecondary,
            unit: row.unit,
            supersededId: supersededContent !== null ? supersedesId : null,
            supersededContent,
          };
        });
      },
    }),

    update_profile: tool({
      description: UPDATE_PROFILE_DESCRIPTION,
      inputSchema: updateProfileToolInputSchema,
      execute: async ({ profile }) => {
        await writeProfile(workspaceId, profile, "model");
        return { ok: true as const, profile };
      },
    }),
  };
}

// Metrics are grouped by exact string match, so a slug that drifts with the
// model's phrasing ("Hemoglobin" vs "hemoglobin" vs "hemoglobin level") splits
// one series into three. Normalizing here means the taxonomy survives model
// swaps and prompt edits.
export function normalizeMetric(metric: string | null | undefined): string | null {
  if (!metric) return null;
  const slug = metric
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug.slice(0, 60) : null;
}

/**
 * The single write path for `workspaces.profile`, used by the tool, the manual
 * rail edit, and restore. Appends the OUTGOING text to profile_versions in the
 * same transaction as the overwrite, so the app's one destructive write becomes
 * recoverable and history can't half-commit.
 */
export async function writeProfile(
  workspaceId: string,
  profile: string | null,
  changedBy: "model" | "user" | "restore",
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ profile: workspaces.profile })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    // No-op edits don't earn a version — otherwise every save from the rail,
    // including one where nothing was typed, pushes a duplicate onto the stack.
    if (current && current.profile !== profile) {
      await tx.insert(profileVersions).values({
        id: randomUUID(),
        workspaceId,
        profile: current.profile,
        changedBy,
      });
    }

    const [row] = await tx
      .update(workspaces)
      .set({ profile })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    return row;
  });
}

export type MemoryTools = ReturnType<typeof buildMemoryTools>;
