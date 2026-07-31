import type { ExportResponse } from "@caretalk/contracts/health";

// LLM-context render of an account export: profile + active facts per
// workspace. Superseded memories are omitted on purpose — this format exists
// to be pasted into an external chat as cheaply as possible, and a superseded
// fact is by definition no longer true. Use the JSON export for full fidelity.
export function buildExportMarkdown(data: ExportResponse): string {
  const lines: string[] = [
    `# Health memory export — ${data.exportedAt.slice(0, 10)}`,
    "",
    "One section per person/journey. Facts are `date | kind | fact`; outdated facts (superseded doses, resolved symptoms) are already filtered out.",
  ];

  for (const { workspace, memories } of data.workspaces) {
    const active = memories.filter((memory) => memory.supersededById === null);

    lines.push("", `## ${workspace.name}`);
    if (workspace.description) lines.push("", workspace.description);

    if (workspace.profile) {
      lines.push("", "### Profile", "", workspace.profile);
    }

    lines.push("", "### Facts (date | kind | fact)", "");
    if (active.length === 0) {
      lines.push("(none yet)");
    } else {
      for (const memory of active) {
        lines.push(`- ${memory.happenedOn ?? "undated"} | ${memory.kind} | ${memory.content}`);
      }
    }
  }

  if (data.workspaces.length === 0) {
    lines.push("", "(no workspaces)");
  }

  return lines.join("\n") + "\n";
}
