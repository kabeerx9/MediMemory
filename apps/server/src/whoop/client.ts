import type { WhoopConfig } from "./config";

// Thin WHOOP API client. No state: tokens come in, results go out, and the
// caller (sync.ts) owns persistence — in particular saving a rotated refresh
// token before using the access token that came with it.

export const WHOOP_SCOPES = [
  "offline",
  "read:recovery",
  "read:sleep",
  "read:cycles",
  "read:workout",
  "read:body_measurement",
  "read:profile",
];

const PAGE_LIMIT = 25;
const MAX_ATTEMPTS = 3;

export type TokenSet = { accessToken: string; refreshToken: string; expiresAt: Date; scope: string };

/** The refresh token or authorization code was rejected: the user must reconnect. */
export class WhoopAuthError extends Error {}
/** A data call was rejected with 401: the access token is stale or revoked. */
export class WhoopUnauthorizedError extends Error {}
/** Any other non-OK response after retries. */
export class WhoopApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function authorizeUrl(cfg: WhoopConfig, state: string, redirectUri: string): string {
  const url = new URL(`${cfg.apiBase}/oauth/oauth2/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", WHOOP_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(cfg: WhoopConfig, params: Record<string, string>): Promise<TokenSet> {
  const response = await fetch(`${cfg.apiBase}/oauth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret }),
  });
  if (response.status === 400 || response.status === 401) {
    throw new WhoopAuthError(`WHOOP rejected the ${params.grant_type} grant (${response.status})`);
  }
  if (!response.ok) throw new WhoopApiError(response.status, `WHOOP token endpoint returned ${response.status}`);
  const body = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number; scope?: string };
  if (!body.refresh_token) throw new WhoopAuthError("WHOOP returned no refresh token (offline scope missing?)");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scope: body.scope ?? "",
  };
}

export function exchangeCode(cfg: WhoopConfig, code: string, redirectUri: string) {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshTokens(cfg: WhoopConfig, refreshToken: string) {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken, scope: "offline" });
}

type RetryOptions = { retryDelayMs?: number };

async function request(cfg: WhoopConfig, accessToken: string, path: string, init: RequestInit = {}, opts: RetryOptions = {}) {
  const base = opts.retryDelayMs ?? 1000;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${cfg.apiBase}/developer${path}`, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, ...init.headers },
    });
    if (response.status === 401) throw new WhoopUnauthorizedError(`WHOOP rejected the access token for ${path}`);
    const retryable = response.status === 429 || response.status >= 500;
    if (response.ok || !retryable || attempt >= MAX_ATTEMPTS) {
      if (!response.ok) throw new WhoopApiError(response.status, `WHOOP ${path} returned ${response.status}`);
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, base * 2 ** (attempt - 1)));
  }
}

export async function getJson(cfg: WhoopConfig, accessToken: string, path: string, opts?: RetryOptions): Promise<any> {
  return (await request(cfg, accessToken, path, {}, opts)).json();
}

/** Every record of a collection in the window, following next_token. */
export async function listAll(
  cfg: WhoopConfig,
  accessToken: string,
  path: string,
  params: { start?: string; end?: string },
  opts?: RetryOptions,
): Promise<any[]> {
  const records: any[] = [];
  let nextToken: string | undefined;
  do {
    const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (params.start) query.set("start", params.start);
    if (params.end) query.set("end", params.end);
    if (nextToken) query.set("nextToken", nextToken);
    const page = (await getJson(cfg, accessToken, `${path}?${query}`, opts)) as { records?: any[]; next_token?: string };
    records.push(...(page.records ?? []));
    nextToken = page.next_token || undefined;
  } while (nextToken);
  return records;
}

export async function revokeAccess(cfg: WhoopConfig, accessToken: string): Promise<void> {
  await request(cfg, accessToken, "/v2/user/access", { method: "DELETE" });
}
