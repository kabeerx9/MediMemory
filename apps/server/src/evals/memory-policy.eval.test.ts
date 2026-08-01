import type { Memory, Workspace } from "@caretalk/contracts/health";
import {
  saveMemoryToolInputSchema,
  updateProfileToolInputSchema,
} from "@caretalk/contracts/health";
import { generateText, isStepCount, tool, type ToolSet } from "ai";
import { describe, expect, it } from "vitest";

import {
  SAVE_MEMORY_DESCRIPTION,
  UPDATE_PROFILE_DESCRIPTION,
} from "../lib/memory-tools";
import { buildModel, modelIdFor } from "../lib/model";
import { buildSystemPrompt } from "../lib/system-prompt";

// The memory policy — what to save, and above all accumulate vs supersede — is
// enforced by prompt text alone. Nothing in the type system or the database
// stops the model from superseding a lab result and quietly erasing a series.
// This is the regression harness for that: real model, real prompt, real tool
// descriptions, assertions on the tool CALLS rather than on prose.
//
// Opt-in because it costs money and needs a network:
//
//   RUN_EVALS=1 pnpm -F server eval
//
// Treat a failure as "the prompt changed behaviour", not "the test is flaky" —
// then decide whether the new behaviour is the one you want.
const enabled = process.env.RUN_EVALS === "1" && Boolean(process.env.OPENROUTER_API_KEY);
const describeEval = enabled ? describe : describe.skip;

const TODAY = "2026-03-15";
const TIME_ZONE = "Asia/Kolkata";

const workspace: Workspace = {
  id: "eval-ws",
  ownerUserId: "eval-user",
  name: "Dad",
  description: "Hypertension and anaemia follow-up",
  profile: "## Current\n- Lisinopril 10mg daily\n- Watching hemoglobin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function memory(overrides: Partial<Memory> & Pick<Memory, "id" | "content">): Memory {
  return {
    workspaceId: workspace.id,
    kind: "note",
    happenedOn: null,
    metric: null,
    value: null,
    valueSecondary: null,
    unit: null,
    sourceId: null,
    excerpt: null,
    supersededById: null,
    supersededAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const DOSE_MEMORY = memory({
  id: "mem-dose",
  content: "Lisinopril 10mg daily",
  kind: "medication",
  happenedOn: "2026-02-01",
});

const HB_MEMORY = memory({
  id: "mem-hb",
  content: "Hemoglobin 11.2 g/dL",
  kind: "measurement",
  happenedOn: "2026-02-20",
  metric: "hemoglobin",
  value: 11.2,
  unit: "g/dL",
});

type SaveCall = {
  content: string;
  happenedOn: string | null;
  supersedesId: string | null;
  metric: string | null;
  value: number | null;
  valueSecondary: number | null;
};

/**
 * Runs one utterance through the real prompt with capture-only tools, so the
 * model's decisions are observable without touching the database.
 */
async function run(utterance: string, activeMemories: Memory[]) {
  const saves: SaveCall[] = [];
  let profileUpdates = 0;

  const tools: ToolSet = {
    save_memory: tool({
      description: SAVE_MEMORY_DESCRIPTION,
      inputSchema: saveMemoryToolInputSchema,
      execute: async (input) => {
        saves.push({
          content: input.content,
          happenedOn: input.happenedOn,
          supersedesId: input.supersedesId,
          metric: input.metric,
          value: input.value,
          valueSecondary: input.valueSecondary,
        });
        return { id: `eval-${saves.length}`, ok: true };
      },
    }),
    update_profile: tool({
      description: UPDATE_PROFILE_DESCRIPTION,
      inputSchema: updateProfileToolInputSchema,
      execute: async () => {
        profileUpdates += 1;
        return { ok: true };
      },
    }),
  };

  await generateText({
    model: buildModel("chat"),
    system: buildSystemPrompt({
      workspace,
      activeMemories,
      today: TODAY,
      timeZone: TIME_ZONE,
      mode: "chat",
    }),
    messages: [{ role: "user", content: utterance }],
    tools,
    stopWhen: isStepCount(8),
  });

  return { saves, profileUpdates };
}

describeEval(`memory policy eval (${modelIdFor("chat")})`, () => {
  it(
    "saves a new measurement without superseding the earlier reading",
    { timeout: 90_000 },
    async () => {
      const { saves } = await run("hb came back 11.6 today", [DOSE_MEMORY, HB_MEMORY]);

      expect(saves.length).toBeGreaterThanOrEqual(1);
      // THE rule. Superseding here destroys the series that is the whole point
      // of the app, and nothing downstream would notice.
      for (const save of saves) {
        expect(save.supersedesId).toBeNull();
      }
      expect(saves.some((save) => save.value === 11.6)).toBe(true);
      expect(saves.some((save) => save.metric?.includes("hemoglobin") || save.metric === "hb")).toBe(
        true,
      );
    },
  );

  it("supersedes the old dose on a genuine state change", { timeout: 90_000 }, async () => {
    const { saves } = await run("they bumped the lisinopril to 20mg", [DOSE_MEMORY, HB_MEMORY]);

    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves.some((save) => save.supersedesId === DOSE_MEMORY.id)).toBe(true);
  });

  it("splits a blood pressure reading into value and valueSecondary", { timeout: 90_000 }, async () => {
    const { saves } = await run("his bp this morning was 138/86", [DOSE_MEMORY]);

    const bp = saves.find((save) => save.value !== null);
    expect(bp).toBeDefined();
    expect(bp?.value).toBe(138);
    expect(bp?.valueSecondary).toBe(86);
  });

  // Deliberately carries no number. An earlier version of this case asked
  // "what does a hemoglobin of 11.6 actually mean?" and failed intermittently —
  // correctly, as it turns out: 11.6 differs from the stored 11.2, so reading it
  // as a newly reported reading is a defensible interpretation, and the case was
  // testing the model's coin-flip rather than the policy. A flaky eval is worse
  // than no eval, because it teaches you to ignore red.
  it("answers a pure knowledge question without writing to memory", { timeout: 90_000 }, async () => {
    const { saves } = await run("what does hemoglobin actually measure, in general?", [
      DOSE_MEMORY,
      HB_MEMORY,
    ]);

    expect(saves).toHaveLength(0);
  });

  it("saves the fact but not the question when a message carries both", { timeout: 90_000 }, async () => {
    const { saves } = await run("his hemoglobin is 11.6 today, is that bad?", [HB_MEMORY]);

    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves.every((save) => !save.content.trim().endsWith("?"))).toBe(true);
    for (const save of saves) {
      expect(save.supersedesId).toBeNull();
    }
  });

  it("resolves a relative date against the user's day, not UTC", { timeout: 90_000 }, async () => {
    const { saves } = await run("he had a fever yesterday evening", [DOSE_MEMORY]);

    expect(saves.length).toBeGreaterThanOrEqual(1);
    // TODAY is 2026-03-15 in the user's zone, so "yesterday" is the 14th.
    // Before the timezone fix a late-evening UTC clock made this the 13th.
    expect(saves.some((save) => save.happenedOn === "2026-03-14")).toBe(true);
  });
});
