import type { Memory, Workspace } from "@caretalk/contracts/health";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { MemoryRail, groupMemoriesByDate, groupMemoriesByKind } from "@/features/health/memory-rail";

function memory(overrides: Partial<Memory> & Pick<Memory, "id" | "kind" | "content">): Memory {
  const { id, kind, content, ...rest } = overrides;
  return {
    id,
    workspaceId: "workspace-1",
    content,
    kind,
    happenedOn: null,
    metric: null,
    value: null,
    valueSecondary: null,
    unit: null,
    sourceId: null,
    excerpt: null,
    supersededById: null,
    supersededAt: null,
    createdAt: "2026-08-04T09:00:00.000Z",
    updatedAt: "2026-08-04T09:00:00.000Z",
    ...rest,
  };
}

const memories: Memory[] = [
  memory({ id: "old-med", kind: "medication", content: "Old dose", happenedOn: "2025-12-10", supersededById: "new-med", supersededAt: "2026-01-03T09:00:00.000Z" }),
  memory({ id: "new-med", kind: "medication", content: "Current dose", happenedOn: "2026-01-03" }),
  memory({ id: "symptom", kind: "symptom", content: "Abdominal pain", happenedOn: "2026-08-04" }),
  memory({ id: "note", kind: "note", content: "Thyroid medicine unknown" }),
];

const workspace: Workspace = {
  id: "workspace-1",
  ownerUserId: "user-1",
  name: "Papa",
  description: null,
  profile: "# Current treatment\n- Galvus Met 50/1000 in the morning\n**Born:** 31 December 1968",
  createdAt: "2025-12-01T09:00:00.000Z",
  updatedAt: "2026-08-04T09:00:00.000Z",
};

describe("groupMemoriesByDate", () => {
  test("orders dated groups newest first and leaves undated memories last", () => {
    expect(groupMemoriesByDate(memories, false).map((group) => group.date)).toEqual([
      "2026-08-04",
      "2026-01-03",
      null,
    ]);
  });

  test("excludes superseded memories until history is requested", () => {
    expect(groupMemoriesByDate(memories, false).flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "symptom",
      "new-med",
      "note",
    ]);
    expect(groupMemoriesByDate(memories, true).flatMap((group) => group.items.map((item) => item.id))).toContain("old-med");
  });
});

describe("groupMemoriesByKind", () => {
  test("groups active memories by the clinical kind order", () => {
    expect(groupMemoriesByKind(memories, false).map((group) => group.kind)).toEqual([
      "medication",
      "symptom",
      "note",
    ]);
  });

  test("includes superseded memories in their kind when history is requested", () => {
    const medication = groupMemoriesByKind(memories, true).find((group) => group.kind === "medication");
    expect(medication?.items.map((item) => item.id)).toEqual(["new-med", "old-med"]);
  });
});

describe("MemoryRail", () => {
  test("starts as a patient-context navigation with only Overview selected", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRail, {
        workspace,
        memories,
        onWorkspaceUpdated: () => undefined,
        onMemoriesChanged: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Patient context"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">Overview<");
    expect(html).toContain(">Timeline<");
    expect(html).toContain(">Trends<");
    expect(html).toContain(">Memories<");
    expect(html).toContain('data-context-panel="overview"');
    expect(html).not.toContain('data-context-panel="timeline"');
    expect(html).toContain(">Born:</strong>");
    expect(html).not.toContain("**Born:**");
  });
});
