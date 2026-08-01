import { isSignupAllowed, parseAllowlist } from "@caretalk/auth/signup-allowlist";
import { describe, expect, it } from "vitest";

// This is the control that keeps a public deployment from handing strangers an
// account that can spend OpenRouter credit. Worth testing precisely because a
// silent "allow everything" regression looks exactly like a working app.
describe("signup allowlist", () => {
  it("stays open when unconfigured, so a fresh clone can register", () => {
    for (const raw of [undefined, "", "  ", ","]) {
      expect(isSignupAllowed("anyone@example.com", parseAllowlist(raw))).toBe(true);
    }
  });

  it("refuses everything not listed once any address is configured", () => {
    const allowlist = parseAllowlist("me@example.com");
    expect(isSignupAllowed("me@example.com", allowlist)).toBe(true);
    expect(isSignupAllowed("someone@example.com", allowlist)).toBe(false);
  });

  it("matches case-insensitively and ignores padding on both sides", () => {
    const allowlist = parseAllowlist(" Me@Example.com , other@example.com ");
    expect(isSignupAllowed("me@example.com", allowlist)).toBe(true);
    expect(isSignupAllowed("  OTHER@EXAMPLE.COM ", allowlist)).toBe(true);
  });

  it("has no wildcard escape hatch", () => {
    const allowlist = parseAllowlist("*");
    expect(isSignupAllowed("anyone@example.com", allowlist)).toBe(false);
    expect(isSignupAllowed("*", allowlist)).toBe(true);
  });

  it("does not treat a listed domain as covering its addresses", () => {
    const allowlist = parseAllowlist("example.com");
    expect(isSignupAllowed("me@example.com", allowlist)).toBe(false);
  });
});
