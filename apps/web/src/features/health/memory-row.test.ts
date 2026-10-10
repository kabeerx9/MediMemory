import { describe, expect, test } from "vitest";

import { provenanceLabel } from "./memory-row";

const base = { workspaceId: "w", contentHash: null, createdAt: "2026-10-10T00:00:00.000Z" };

describe("provenanceLabel", () => {
  test("names the AI app for facts saved over MCP", () => {
    expect(provenanceLabel({ ...base, id: "s1", type: "mcp", title: "Claude", clientName: "Claude" })).toBe("via Claude");
  });

  test("names the report, and the app it was shared with", () => {
    expect(
      provenanceLabel({ ...base, id: "s2", type: "report", title: "KFT — 8 Oct", clientName: "ChatGPT" }),
    ).toBe("from KFT — 8 Oct · ChatGPT");
  });

  test("names imports by title", () => {
    expect(provenanceLabel({ ...base, id: "s3", type: "import", title: "Discharge summary", clientName: null })).toBe(
      "from Discharge summary",
    );
  });

  test("stays quiet for in-app chat facts and unknown sources", () => {
    expect(provenanceLabel(undefined)).toBeNull();
    expect(provenanceLabel({ ...base, id: "s4", type: "chat_session", title: null, clientName: null })).toBeNull();
  });
});
