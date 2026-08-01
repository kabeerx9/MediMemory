import { describe, expect, it } from "vitest";

import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit then refuses", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check("user-1", 0).allowed).toBe(true);
    expect(limiter.check("user-1", 1).allowed).toBe(true);
    expect(limiter.check("user-1", 2).allowed).toBe(true);
    expect(limiter.check("user-1", 3).allowed).toBe(false);
  });

  it("keeps a separate window per key", () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.check("user-1", 0).allowed).toBe(true);
    expect(limiter.check("user-1", 0).allowed).toBe(false);
    expect(limiter.check("user-2", 0).allowed).toBe(true);
  });

  it("reopens once the window rolls over", () => {
    const limiter = new RateLimiter(1, 1_000);
    expect(limiter.check("user-1", 0).allowed).toBe(true);
    expect(limiter.check("user-1", 999).allowed).toBe(false);
    expect(limiter.check("user-1", 1_000).allowed).toBe(true);
  });

  it("reports a retry hint that never rounds down to zero", () => {
    const limiter = new RateLimiter(1, 5_000);
    limiter.check("user-1", 0);
    const denied = limiter.check("user-1", 4_999);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts down remaining", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check("user-1", 0).remaining).toBe(2);
    expect(limiter.check("user-1", 1).remaining).toBe(1);
    expect(limiter.check("user-1", 2).remaining).toBe(0);
  });
});
