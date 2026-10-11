import { describe, expect, it } from "vitest";

import { buildMcpContext } from "./context";

const workspace = {
  id: "ws-1",
  ownerUserId: "u-1",
  name: "Me",
  description: null,
  profile: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const base = { workspace, activeMemories: [], today: "2026-10-11", timeZone: "Asia/Kolkata", reportsMissingOriginals: [] };

describe("buildMcpContext daily tracking block", () => {
  it("includes the daily summary when one is given", () => {
    const text = buildMcpContext({ ...base, dailySummary: ["## Daily tracking — last 7 days", "- Recovery 70%"] });
    expect(text).toContain("## Daily tracking — last 7 days\n- Recovery 70%");
  });

  it("leaves the block out when there's no WHOOP connection", () => {
    expect(buildMcpContext({ ...base, dailySummary: null })).not.toContain("Daily tracking");
  });
});
