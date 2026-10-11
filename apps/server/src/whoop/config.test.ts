import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { whoopConfigFrom } from "./config";

const key = randomBytes(32).toString("base64");
const base = { WHOOP_API_BASE: "https://api.prod.whoop.com" };

describe("whoopConfigFrom", () => {
  it("is null when the integration isn't configured", () => {
    expect(whoopConfigFrom({ ...base })).toBeNull();
  });

  it("is null when only some of the credentials are set", () => {
    expect(whoopConfigFrom({ ...base, WHOOP_CLIENT_ID: "id", WHOOP_TOKEN_KEY: key })).toBeNull();
  });

  it("decodes the token key", () => {
    const config = whoopConfigFrom({ ...base, WHOOP_CLIENT_ID: "id", WHOOP_CLIENT_SECRET: "secret", WHOOP_TOKEN_KEY: key });
    expect(config?.key.length).toBe(32);
    expect(config?.apiBase).toBe("https://api.prod.whoop.com");
  });

  it("refuses a token key that isn't 32 bytes", () => {
    expect(() =>
      whoopConfigFrom({ ...base, WHOOP_CLIENT_ID: "id", WHOOP_CLIENT_SECRET: "secret", WHOOP_TOKEN_KEY: "c2hvcnQ=" }),
    ).toThrow(/32 bytes/);
  });
});
