import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// A local stand-in for api.prod.whoop.com, for tests only. It enforces the
// behaviour the sync must survive: rotating refresh tokens (each refresh
// invalidates the previous one), bearer auth on data routes, pagination via
// nextToken, and injectable failures.

export type FakeRequest = { method: string; path: string; query: URLSearchParams; body: URLSearchParams; auth: string | null };

export class FakeWhoop {
  readonly requests: FakeRequest[] = [];
  /** Records served per collection path, e.g. "/developer/v2/cycle". */
  readonly collections = new Map<string, unknown[]>();
  body: unknown = { height_meter: 1.8, weight_kilogram: 80, max_heart_rate: 190 };
  profile: unknown = { user_id: 42, email: "test@example.test", first_name: "T", last_name: "U" };
  pageSize = 25;
  /** Status codes to return, in order, before serving normally. Keyed by path. */
  readonly failures = new Map<string, number[]>();
  validRefreshToken = "refresh-0";
  validAccessToken = "access-0";
  revoked = false;
  /** Awaited before each request is served — lets a test act mid-sync. */
  beforeServe: ((path: string) => Promise<void>) | null = null;
  private tokenGeneration = 0;
  private server: Server | null = null;

  get baseUrl() {
    const address = this.server?.address() as AddressInfo | null;
    if (!address) throw new Error("FakeWhoop not started");
    return `http://127.0.0.1:${address.port}`;
  }

  async start() {
    this.server = createServer((req, res) => {
      void this.handle(req).then(({ status, json }) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(json === undefined ? "" : JSON.stringify(json));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    return this;
  }

  async stop() {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private issueTokens() {
    this.tokenGeneration += 1;
    this.validRefreshToken = `refresh-${this.tokenGeneration}`;
    this.validAccessToken = `access-${this.tokenGeneration}`;
    return {
      access_token: this.validAccessToken,
      refresh_token: this.validRefreshToken,
      expires_in: 3600,
      scope: "offline read:recovery",
      token_type: "bearer",
    };
  }

  private async handle(req: IncomingMessage): Promise<{ status: number; json?: unknown }> {
    const url = new URL(req.url ?? "/", "http://fake");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request: FakeRequest = {
      method: req.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
      body: new URLSearchParams(Buffer.concat(chunks).toString("utf8")),
      auth: req.headers.authorization ?? null,
    };
    this.requests.push(request);
    if (this.beforeServe) await this.beforeServe(url.pathname);

    const queued = this.failures.get(url.pathname);
    if (queued && queued.length > 0) return { status: queued.shift()!, json: { error: "injected" } };

    if (url.pathname === "/oauth/oauth2/token") {
      const grant = request.body.get("grant_type");
      if (grant === "authorization_code" && request.body.get("code") === "good-code") return { status: 200, json: this.issueTokens() };
      if (grant === "refresh_token" && request.body.get("refresh_token") === this.validRefreshToken) {
        return { status: 200, json: this.issueTokens() };
      }
      return { status: 400, json: { error: "invalid_grant" } };
    }

    if (request.auth !== `Bearer ${this.validAccessToken}` || this.revoked) return { status: 401, json: { error: "unauthorized" } };

    if (url.pathname === "/developer/v2/user/access" && request.method === "DELETE") {
      this.revoked = true;
      return { status: 204 };
    }
    if (url.pathname === "/developer/v2/user/profile/basic") return { status: 200, json: this.profile };
    if (url.pathname === "/developer/v2/user/measurement/body") return { status: 200, json: this.body };

    const records = this.collections.get(url.pathname);
    if (!records) return { status: 404, json: { error: "not found" } };
    const offset = Number(url.searchParams.get("nextToken") ?? 0);
    const page = records.slice(offset, offset + this.pageSize);
    const next = offset + this.pageSize < records.length ? String(offset + this.pageSize) : undefined;
    return { status: 200, json: { records: page, next_token: next } };
  }
}
