import { createFileRoute, redirect } from "@tanstack/react-router";

import { ConsentPage } from "@/features/connect/consent-page";
import { authClient } from "@/lib/auth-client";

// Where the OAuth provider sends the browser after sign-in when an AI app asks
// for access. The signed request lives in the query string, so a detour
// through /login must carry it along untouched.
export const Route = createFileRoute("/oauth/consent")({
  component: ConsentPage,
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ href: `/login${location.searchStr}`, throw: true });
    }
  },
});
