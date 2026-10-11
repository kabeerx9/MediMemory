import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "./crypto";

const key = randomBytes(32);

describe("token encryption", () => {
  it("round-trips a token", () => {
    expect(decryptToken(encryptToken("refresh-abc", key), key)).toBe("refresh-abc");
  });

  it("uses a fresh IV per encryption", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("rejects a tampered ciphertext", () => {
    const blob = encryptToken("refresh-abc", key);
    const [version, iv, tag, data] = blob.split(".");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptToken([version, iv, tag, flipped.toString("base64")].join("."), key)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decryptToken(encryptToken("refresh-abc", key), randomBytes(32))).toThrow();
  });
});
