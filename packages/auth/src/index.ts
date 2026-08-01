import { expo } from "@better-auth/expo";
import { createDb } from "@caretalk/db";
import * as schema from "@caretalk/db/schema/auth";
import { env } from "@caretalk/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

import { isSignupAllowed, parseAllowlist } from "./signup-allowlist";

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
    plugins: [expo()],
  });
}

export const auth = createAuth();
