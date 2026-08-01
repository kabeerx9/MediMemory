import { describe, expect, it } from "vitest";

import { isValidTimeZone, resolveTimeZone, todayIn } from "./time";

describe("todayIn", () => {
  // The bug this file exists for: the server previously derived "today" from
  // new Date().toISOString(), i.e. UTC. Vercel runs UTC, so every user east of
  // Greenwich got the wrong calendar day during their early morning — and the
  // model stamps happenedOn from whatever date we hand it.
  it("uses the user's calendar day, not UTC's, after midnight local", () => {
    // 19:30 UTC on the 14th is 01:00 on the 15th in Kolkata (+05:30).
    const instant = new Date("2026-03-14T19:30:00Z");

    expect(instant.toISOString().slice(0, 10)).toBe("2026-03-14");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-03-15");
    expect(todayIn("UTC", instant)).toBe("2026-03-14");
  });

  it("handles zones behind UTC, where the local day lags", () => {
    // 02:00 UTC on the 15th is still 21:00 on the 14th in New York.
    const instant = new Date("2026-03-15T02:00:00Z");
    expect(todayIn("America/New_York", instant)).toBe("2026-03-14");
  });

  it("always renders zero-padded YYYY-MM-DD, matching isoDateSchema", () => {
    const instant = new Date("2026-01-05T12:00:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-01-05");
    expect(todayIn("UTC", instant)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("resolveTimeZone", () => {
  it("prefers a valid client zone", () => {
    expect(resolveTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
  });

  // A bad client value must not fail the request: losing a health update is
  // strictly worse than dating it in the fallback zone.
  it("falls back instead of throwing on a bad or missing zone", () => {
    expect(() => resolveTimeZone("Nowhere/Fake")).not.toThrow();
    expect(isValidTimeZone(resolveTimeZone("Nowhere/Fake"))).toBe(true);
    expect(isValidTimeZone(resolveTimeZone(undefined))).toBe(true);
    expect(isValidTimeZone(resolveTimeZone(null))).toBe(true);
  });
});
