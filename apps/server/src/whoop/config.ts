import { env } from "@caretalk/env/server";

export type WhoopConfig = {
  clientId: string;
  clientSecret: string;
  key: Buffer;
  apiBase: string;
};

type WhoopEnv = {
  WHOOP_CLIENT_ID?: string;
  WHOOP_CLIENT_SECRET?: string;
  WHOOP_TOKEN_KEY?: string;
  WHOOP_API_BASE: string;
};

/**
 * The integration is all-or-nothing: without every credential it's off, and
 * callers report "not configured" rather than half-working. A malformed key
 * is a deployment mistake, so that one throws at startup instead.
 */
export function whoopConfigFrom(source: WhoopEnv): WhoopConfig | null {
  const { WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_TOKEN_KEY } = source;
  if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET || !WHOOP_TOKEN_KEY) return null;
  const key = Buffer.from(WHOOP_TOKEN_KEY, "base64");
  if (key.length !== 32) throw new Error("WHOOP_TOKEN_KEY must be base64 of 32 bytes");
  return {
    clientId: WHOOP_CLIENT_ID,
    clientSecret: WHOOP_CLIENT_SECRET,
    key,
    apiBase: source.WHOOP_API_BASE.replace(/\/$/, ""),
  };
}

let cached: WhoopConfig | null | undefined;

export function whoopConfig(): WhoopConfig | null {
  if (cached === undefined) cached = whoopConfigFrom(env);
  return cached;
}
