import { createFileRoute, redirect } from "@tanstack/react-router";

import { NewWorkspacePage } from "@/features/health/workspace-ui";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/workspaces/new")({
  component: NewWorkspacePage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
    return { session };
  },
});
