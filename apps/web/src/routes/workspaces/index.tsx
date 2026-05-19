import { createFileRoute, redirect } from "@tanstack/react-router";

import { healthApi } from "@/features/health/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/workspaces/")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }

    const response = await healthApi.listWorkspaces();
    const firstWorkspace = response.workspaces[0];
    if (!firstWorkspace) {
      redirect({ to: "/workspaces/new", throw: true });
    }

    redirect({
      to: "/workspaces/$workspaceId",
      params: { workspaceId: firstWorkspace.id },
      throw: true,
    });
  },
});
