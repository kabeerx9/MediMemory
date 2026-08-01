// Spend guard for the two routes that call a metered model API.
//
// Deliberately in-process: a fixed-window counter in a Map, no Redis, no extra
// dependency. On Vercel each warm instance keeps its own counter, so the real
// ceiling is (limit x live instances) — this stops a runaway client or a
// stuck retry loop from burning credit, and does NOT stop a determined
// attacker. The allowlist in @caretalk/auth is what keeps strangers out; this
// is the second layer for an account that already exists.
//
// Swap the Map for one Postgres row per (key, window) if a shared ceiling ever
// matters more than zero latency.

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window rolls over. */
  retryAfterSeconds: number;
};

type Window = { count: number; resetAt: number };

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    const existing = this.windows.get(key);

    if (!existing || now >= existing.resetAt) {
      const resetAt = now + this.windowMs;
      this.windows.set(key, { count: 1, resetAt });
      this.sweep(now);
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    if (existing.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count, retryAfterSeconds };
  }

  // Expired entries are only dropped when some other key writes, which is
  // enough: the map is keyed by user id and this is a single-digit-user app.
  private sweep(now: number) {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (now >= window.resetAt) this.windows.delete(key);
    }
  }
}
