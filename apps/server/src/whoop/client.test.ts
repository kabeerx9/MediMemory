import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authorizeUrl, exchangeCode, listAll, refreshTokens, WhoopAuthError, WhoopUnauthorizedError } from "./client";
import type { WhoopConfig } from "./config";
import { FakeWhoop } from "./testing/fake-whoop";

let fake: FakeWhoop;
let cfg: WhoopConfig;

beforeEach(async () => {
  fake = await new FakeWhoop().start();
  cfg = { clientId: "cid", clientSecret: "csecret", key: Buffer.alloc(32), apiBase: fake.baseUrl };
});

afterEach(async () => {
  await fake.stop();
});

describe("authorizeUrl", () => {
  it("asks for every data scope plus offline", () => {
    const url = new URL(authorizeUrl(cfg, "state-123", "https://app.test/api/whoop/callback"));
    expect(url.pathname).toBe("/oauth/oauth2/auth");
    expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(
      ["offline", "read:body_measurement", "read:cycles", "read:profile", "read:recovery", "read:sleep", "read:workout"].sort(),
    );
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("token calls", () => {
  it("exchanges a code for a token set", async () => {
    const tokens = await exchangeCode(cfg, "good-code", "https://app.test/cb");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refreshes with the offline scope and returns the rotated token", async () => {
    const tokens = await refreshTokens(cfg, "refresh-0");
    expect(tokens.refreshToken).toBe("refresh-1");
    const sent = fake.requests.at(-1)!.body;
    expect(sent.get("scope")).toBe("offline");
    expect(sent.get("client_secret")).toBe("csecret");
  });

  it("throws WhoopAuthError when the refresh token is rejected", async () => {
    await expect(refreshTokens(cfg, "stale")).rejects.toBeInstanceOf(WhoopAuthError);
  });
});

describe("listAll", () => {
  it("follows next_token across pages", async () => {
    fake.pageSize = 2;
    fake.collections.set("/developer/v2/cycle", [{ id: 1 }, { id: 2 }, { id: 3 }]);
    const records = await listAll(cfg, fake.validAccessToken, "/v2/cycle", { start: "2026-10-01T00:00:00.000Z" });
    expect(records.map((r: any) => r.id)).toEqual([1, 2, 3]);
    expect(fake.requests.at(0)!.query.get("limit")).toBe("25");
    expect(fake.requests.at(0)!.query.get("start")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("retries a rate-limited page", async () => {
    fake.collections.set("/developer/v2/cycle", [{ id: 1 }]);
    fake.failures.set("/developer/v2/cycle", [429, 503]);
    const records = await listAll(cfg, fake.validAccessToken, "/v2/cycle", {}, { retryDelayMs: 1 });
    expect(records).toHaveLength(1);
  });

  it("gives up after three failed attempts", async () => {
    fake.collections.set("/developer/v2/cycle", [{ id: 1 }]);
    fake.failures.set("/developer/v2/cycle", [500, 500, 500]);
    await expect(listAll(cfg, fake.validAccessToken, "/v2/cycle", {}, { retryDelayMs: 1 })).rejects.toThrow(/500/);
  });

  it("throws WhoopUnauthorizedError on a 401", async () => {
    fake.collections.set("/developer/v2/cycle", []);
    await expect(listAll(cfg, "wrong-token", "/v2/cycle", {})).rejects.toBeInstanceOf(WhoopUnauthorizedError);
  });
});
