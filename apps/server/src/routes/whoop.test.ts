import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/auth", () => ({ getRequiredUserId: async () => "user-1" }));
vi.mock("../whoop/config", () => ({ whoopConfig: () => null }));

const { buildApp } = await import("../app");

// Without WHOOP credentials the feature must say so plainly — never a
// Connect button that leads to a broken OAuth round trip.
describe("WHOOP routes when the integration isn't configured", () => {
  const app = buildApp();

  it("reports configured: false", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/whoop?workspaceId=ws-1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ configured: false, connection: null });
  });

  it("refuses to start a connect flow", async () => {
    const response = await app.inject({ method: "GET", url: "/api/whoop/connect?workspaceId=ws-1" });
    expect(response.statusCode).toBe(503);
  });

  it("sends a callback back to the app with an error flag", async () => {
    const response = await app.inject({ method: "GET", url: "/api/whoop/callback?code=x&state=y" });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toMatch(/\/connections\?whoop=error$/);
  });
});
