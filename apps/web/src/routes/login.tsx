import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { authClient, isOAuthFlow } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  beforeLoad: async ({ location }) => {
    // An AI app's sign-in (signed query present) must reach the form even
    // with a live session — the provider sent the user here on purpose, e.g.
    // for a fresh login. Bouncing to /workspaces would strand the connect.
    if (isOAuthFlow(location.searchStr)) return;
    const session = await authClient.getSession();
    if (session.data) {
      redirect({ to: "/workspaces", throw: true });
    }
  },
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(true);

  return showSignIn ? (
    <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}
