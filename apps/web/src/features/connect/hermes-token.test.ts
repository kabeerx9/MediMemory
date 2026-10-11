import { describe, expect, test } from "vitest";

import { hermesConfigCommand } from "./hermes-token";

describe("hermesConfigCommand", () => {
  test("writes an owner-only config pointing Hermes at the local Caretalk", () => {
    const command = hermesConfigCommand("ct_abc-DEF_123");
    expect(command).toContain("umask 077");
    // umask only applies to a new file; an existing one keeps its old mode.
    expect(command).toContain("chmod 600 ~/.hermes/data/health/caretalk.json");
    expect(command).toContain("~/.hermes/data/health/caretalk.json");
    expect(command).toContain('"base_url": "http://127.0.0.1:3000"');
    expect(command).toContain('"token": "ct_abc-DEF_123"');
  });

  test("refuses anything that isn't a Caretalk token, so nothing odd lands in a shell", () => {
    expect(() => hermesConfigCommand("ct_x'; rm -rf ~ #")).toThrow();
  });
});
