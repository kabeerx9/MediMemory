import { env } from "@caretalk/env/server";

// "Today" is a per-user fact, not a server fact.
//
// The model resolves every relative date the user speaks ("yesterday", "last
// Tuesday") against the date we hand it. Serverless runtimes run in UTC, so a
// user at +05:30 who reports a reading at 01:00 local gets it stamped with the
// previous calendar day — and "yesterday" lands two days back. Late-night
// braindumps are exactly the intended use, so the UTC clock is wrong in the
// common case, not the edge case.
//
// Resolution order: the client's own IANA zone (sent per request) → APP_TIMEZONE
// → UTC.

/** Formats the current calendar date in `timeZone` as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD, so no part reassembly is needed.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True when Intl accepts `timeZone` as an IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks the zone to date facts in. A bad or missing client value degrades to
 * the configured default rather than failing the request — a slightly wrong
 * date beats a dropped health update.
 */
export function resolveTimeZone(candidate?: string | null): string {
  if (candidate && isValidTimeZone(candidate)) return candidate;
  if (isValidTimeZone(env.APP_TIMEZONE)) return env.APP_TIMEZONE;
  return "UTC";
}
