import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { env } from "@caretalk/env/web";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  // Carries the signed OAuth request through sign-in and consent when an AI
  // app (Claude, ChatGPT) sends the user here to connect, so the server can
  // resume that authorization instead of dropping it.
  plugins: [oauthProviderClient()],
});

/** True while this page is part of an AI app's OAuth sign-in/consent flow. */
export function isOAuthFlow(search: string = typeof window === "undefined" ? "" : window.location.search) {
  return new URLSearchParams(search).has("sig");
}
