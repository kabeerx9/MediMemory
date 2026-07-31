import { createFileRoute, redirect } from "@tanstack/react-router";

import { WorkspacesListPage } from "@/features/health/workspaces-list";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/workspaces/")({
  component: WorkspacesListPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
  },
});
