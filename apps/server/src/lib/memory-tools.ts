import { randomUUID } from "node:crypto";

import {
  memoryKindSchema,
  saveMemoryToolInputSchema,
  updateProfileToolInputSchema,
  type SaveMemoryToolOutput,
} from "@caretalk/contracts/health";
import { db } from "@caretalk/db";
import { memories, workspaces } from "@caretalk/db/schema/health";
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
export function buildMemoryTools(workspaceId: string, options?: { sourceId?: string }): ToolSet {
  const sourceId = options?.sourceId ?? null;
  return {
    save_memory: tool({
      description:
        "Save one atomic health fact to permanent memory. Use for durable facts only: " +
        "measurements (with value+unit+date), medication changes, symptoms, events, " +
        "appointments, questions for the doctor. Never save speculation, anxiety, your own " +
        "explanations, or the user's questions to you. Measurements always accumulate — " +
        "never pass supersedesId for a new reading. Use supersedesId only when a fact " +
        "replaces a prior state (dose changed, symptom resolved, appointment moved).",
      inputSchema: saveMemoryToolInputSchema,
      execute: async ({ content, kind, happenedOn, supersedesId }): Promise<SaveMemoryToolOutput> => {
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
            .values({ id, workspaceId, content, kind: safeKind, happenedOn: happenedOn ?? null, sourceId })
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
            supersededId: supersededContent !== null ? supersedesId : null,
            supersededContent,
          };
        });
      },
    }),

    update_profile: tool({
      description:
        "Rewrite the workspace profile — the short always-visible summary of current state: " +
        "diagnosis, current treatment, current status, next appointment. Full replacement, " +
        "markdown, under ~30 lines. Update it when current state meaningfully changes, " +
        "not for individual data points (those go to save_memory).",
      inputSchema: updateProfileToolInputSchema,
      execute: async ({ profile }) => {
        await db.update(workspaces).set({ profile }).where(eq(workspaces.id, workspaceId));
        return { ok: true as const, profile };
      },
    }),
  };
}

export type MemoryTools = ReturnType<typeof buildMemoryTools>;
