import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { expo } from "@better-auth/expo";
import { mcp } from "@better-auth/mcp";
import { createDb } from "@caretalk/db";
import * as schema from "@caretalk/db/schema/auth";
import { env } from "@caretalk/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins";

import { isSignupAllowed, parseAllowlist } from "./signup-allowlist";

/**
 * The canonical MCP protected-resource identifier. Access tokens issued to
 * Claude/ChatGPT are audience-bound to exactly this string, so it must match
 * the URL clients are configured with, byte for byte. BETTER_AUTH_URL is the
 * origin the outside world sees (the web domain in prod, whose /api/* proxies
 * to this server), so the MCP route hangs off the same origin.
 */
export const mcpResourceUrl = new URL("/api/mcp", env.BETTER_AUTH_URL).toString();

export function createAuth() {
  const db = createDb();
  const allowlist = parseAllowlist(env.ALLOWED_SIGNUP_EMAILS);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [
      env.CORS_ORIGIN,
      "caretalk://",
      ...(env.NODE_ENV === "development"
        ? ["exp://", "exp://**", "exp://192.168.*.*:*/**", "http://localhost:8081"]
        : []),
    ],
    emailAndPassword: {
      enabled: true,
    },
    // Gate registration at the user-insert boundary rather than on the sign-up
    // endpoint: every path that could ever create a user (email/password today,
    // a social provider later) funnels through here, so the allowlist can't be
    // routed around by adding an auth method.
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isSignupAllowed(user.email, allowlist)) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-ups are closed on this instance.",
              });
            }
            return { data: user };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 20,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    // The jwt plugin's own /token endpoint mints a session JWT for first-party
    // clients; nothing here uses it, and leaving it on is one more way to turn
    // a cookie into a bearer token.
    disabledPaths: ["/token"],
    plugins: [
      expo(),
      // Signs the MCP access tokens and serves /jwks for their verification.
      jwt(),
      // OAuth 2.1 authorization server for external AI apps (Claude, ChatGPT).
      // They discover it from the MCP route's 401, register themselves, send
      // the user through our login + consent screens, and get a token bound
      // to mcpResourceUrl. Every MCP tool call then runs as that user.
      mcp({
        loginPage: new URL("/login", env.CORS_ORIGIN).toString(),
        consentPage: new URL("/oauth/consent", env.CORS_ORIGIN).toString(),
        resource: mcpResourceUrl,
        // Dynamic Client Registration stays on for clients that predate
        // Client ID Metadata Documents (CIMD, below). Registering grants
        // nothing by itself: a token still needs this user's login AND an
        // explicit consent click.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // Only user-delegated grants. client_credentials would mint a token
        // with no user behind it — useless here, and one more thing an
        // anonymously registered client could ask for.
        grantTypes: ["authorization_code", "refresh_token"],
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
  });
}

export const auth = createAuth();
