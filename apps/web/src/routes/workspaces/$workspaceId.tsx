import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

// Layout route: with children under $workspaceId/ (index = chat, import), this
// file must render an Outlet — rendering a screen here would shadow every
// child route. Screen lives in $workspaceId/index.tsx.
export const Route = createFileRoute("/workspaces/$workspaceId")({
  component: Outlet,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
    return { session };
  },
});
