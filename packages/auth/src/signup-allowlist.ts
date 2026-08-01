// Sign-up gate. Kept as a pure function separate from the better-auth config so
// the policy can be unit-tested without booting an auth instance or a database.
//
// Why this exists: emailAndPassword registration on a public deployment is an
// open door to an account that can call a metered model API. For a single-user
// app the correct access model is an allowlist, not open registration.

/** Parses the ALLOWED_SIGNUP_EMAILS env value into a normalized set. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * An empty allowlist means "unconfigured", which stays open so a fresh clone
 * can sign up and get going. Once any address is listed, everything else is
 * refused — there is deliberately no wildcard.
 */
export function isSignupAllowed(email: string, allowlist: Set<string>): boolean {
  if (allowlist.size === 0) return true;
  return allowlist.has(email.trim().toLowerCase());
}
