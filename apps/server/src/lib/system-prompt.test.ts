import type { Memory, Workspace } from "@caretalk/contracts/health";
import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "./system-prompt";

const workspace: Workspace = {
  id: "ws-1",
  ownerUserId: "user-1",
  name: "Dad",
  description: "Hypertension follow-up",
  profile: "## Current\n- Lisinopril 20mg daily",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function memory(overrides: Partial<Memory> & Pick<Memory, "id" | "content">): Memory {
  return {
    workspaceId: "ws-1",
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

const base = { workspace, today: "2026-03-15", timeZone: "Asia/Kolkata", mode: "chat" as const };

describe("buildSystemPrompt", () => {
  // Supersession is only possible because the model can see row IDs. If the
  // IDs ever stop being rendered, the model silently degrades to append-only
  // and stale doses accumulate as active facts.
  it("renders every active memory with its id, so supersedesId is targetable", () => {
    const prompt = buildSystemPrompt({
      ...base,
      activeMemories: [
        memory({ id: "mem-a", content: "Lisinopril 20mg daily", kind: "medication" }),
        memory({ id: "mem-b", content: "Hb 11.6 g/dL", happenedOn: "2026-03-14" }),
      ],
    });

    expect(prompt).toContain("mem-a | undated | medication | Lisinopril 20mg daily");
    expect(prompt).toContain("mem-b | 2026-03-14 | note | Hb 11.6 g/dL");
  });

  it("tags a memory with its metric so the model reuses the slug", () => {
    const prompt = buildSystemPrompt({
      ...base,
      activeMemories: [
        memory({
          id: "mem-c",
          content: "Hemoglobin 11.6 g/dL",
          kind: "measurement",
          happenedOn: "2026-03-14",
          metric: "hemoglobin",
          value: 11.6,
          unit: "g/dL",
        }),
      ],
    });

    expect(prompt).toContain("[hemoglobin]");
  });

  it("states the user's date and zone, not the server's", () => {
    const prompt = buildSystemPrompt({ ...base, activeMemories: [] });
    expect(prompt).toContain("2026-03-15");
    expect(prompt).toContain("Asia/Kolkata");
  });

  it("carries the accumulate-vs-supersede rule in every mode", () => {
    for (const mode of ["chat", "import"] as const) {
      const prompt = buildSystemPrompt({ ...base, mode, activeMemories: [] });
      expect(prompt).toContain("SUPERSEDE vs ACCUMULATE");
      expect(prompt).toContain("ALWAYS accumulate");
    }
  });

  it("only adds import instructions in import mode", () => {
    expect(buildSystemPrompt({ ...base, activeMemories: [] })).not.toContain("## Import mode");
    expect(buildSystemPrompt({ ...base, mode: "import", activeMemories: [] })).toContain(
      "## Import mode",
    );
  });

  it("prompts for a profile when the workspace has none", () => {
    const prompt = buildSystemPrompt({
      ...base,
      workspace: { ...workspace, profile: null },
      activeMemories: [],
    });
    expect(prompt).toContain("no profile yet");
  });

  it("says so explicitly on an empty workspace rather than rendering a blank list", () => {
    expect(buildSystemPrompt({ ...base, activeMemories: [] })).toContain("(none yet)");
  });

  // Prompt caching depends on this ordering: stable text first, volatile last.
  it("keeps volatile blocks after stable ones", () => {
    const prompt = buildSystemPrompt({
      ...base,
      activeMemories: [memory({ id: "mem-d", content: "A fact" })],
    });
    expect(prompt.indexOf("## Memory rules")).toBeLessThan(prompt.indexOf("## Workspace profile"));
    expect(prompt.indexOf("## Workspace profile")).toBeLessThan(prompt.indexOf("## Active memories"));
  });
});
