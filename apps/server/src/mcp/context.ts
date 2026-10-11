import type { Memory, Workspace } from "@caretalk/contracts/health";

import { buildMemoryBlock, buildProfileBlock, MEMORY_RULES } from "../lib/system-prompt";

// What an external app (Claude, ChatGPT…) reads when it loads a workspace.
// Same rules, profile block, and memory list as the in-app chat's system
// prompt — imported, not paraphrased — so the save/supersede behaviour the
// evals pin down is the behaviour every client is told to follow. Only the
// framing differs: here the model is a guest in someone else's memory, and
// the tools take an explicit workspaceId.

export function buildMcpContext(input: {
  workspace: Workspace;
  activeMemories: Memory[];
  today: string;
  timeZone: string;
  reportsMissingOriginals: Array<{ id: string; title: string | null }>;
  // Wearable trend block (WHOOP); null/absent when the workspace has no device.
  dailySummary?: string[] | null;
}) {
  const { workspace, activeMemories, today, timeZone, reportsMissingOriginals, dailySummary } = input;

  const header = [
    `# Caretalk memory — ${workspace.name} (workspaceId: ${workspace.id})`,
    "This is the user's permanent, structured health memory for one person. It is the source of truth: ground answers in it, and say so when it has no answer instead of guessing.",
    "You are not a doctor: no diagnosis, no treatment decisions. If something sounds urgent, say clearly that they should contact a medical professional.",
    `Today's date: ${today} (the user's local calendar day, time zone ${timeZone}). Resolve every relative date against this, never against UTC.`,
    `Pass workspaceId "${workspace.id}" to save_memory, update_profile, search_memories, and register_report.`,
  ];

  const reportRules = [
    "## Reports and documents",
    "When the user shares a medical document (lab report, scan, prescription, discharge summary) as a photo or PDF: call register_report once for it FIRST, pass the returned reportId to every save_memory for facts read from it, then give the user the upload link so the original gets attached — you cannot upload files yourself.",
    "After saving, tell the user in one short line what you saved, so they can catch a wrong value.",
  ];

  const pending =
    reportsMissingOriginals.length > 0
      ? [
          "## Reports still missing their original file",
          ...reportsMissingOriginals.map((report) => `- ${report.title ?? "Untitled report"} (reportId: ${report.id})`),
          "If the user asks, call register_report again only for NEW documents; for these, the user can attach the original from the Reports tab in Caretalk.",
        ]
      : [];

  return [
    ...header,
    "",
    ...MEMORY_RULES,
    "",
    ...reportRules,
    "",
    ...buildProfileBlock(workspace),
    ...(dailySummary ? ["", ...dailySummary] : []),
    "",
    ...buildMemoryBlock(activeMemories),
    ...(pending.length > 0 ? ["", ...pending] : []),
  ].join("\n");
}
