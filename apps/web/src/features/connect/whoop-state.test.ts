import { describe, expect, test } from "vitest";

import { pickWhoopWorkspace, whoopStatusLine } from "./whoop-state";

const ws = (id: string, name: string) => ({ id, name });

describe("pickWhoopWorkspace", () => {
  test("prefers the workspace named Me", () => {
    expect(pickWhoopWorkspace([ws("1", "Papa"), ws("2", "Me"), ws("3", "Me · Daily tracking")])?.id).toBe("2");
  });

  test("falls back to the first workspace", () => {
    expect(pickWhoopWorkspace([ws("1", "Papa"), ws("2", "Mummy")])?.id).toBe("1");
  });

  test("is null with no workspaces", () => {
    expect(pickWhoopWorkspace([])).toBeNull();
  });
});

describe("whoopStatusLine", () => {
  const now = new Date("2026-10-11T12:00:00Z");

  test("says when it last synced", () => {
    expect(whoopStatusLine({ status: "active", lastSyncedAt: "2026-10-11T11:15:00Z", lastError: null }, now)).toBe("Synced 45 min ago");
  });

  test("says it's still syncing before the first sync lands", () => {
    expect(whoopStatusLine({ status: "active", lastSyncedAt: null, lastError: null }, now)).toBe("First sync in progress");
  });

  test("surfaces a sync error", () => {
    expect(whoopStatusLine({ status: "active", lastSyncedAt: "2026-10-10T12:00:00Z", lastError: "WHOOP 503" }, now)).toBe(
      "Last sync failed — retrying automatically",
    );
  });
});
