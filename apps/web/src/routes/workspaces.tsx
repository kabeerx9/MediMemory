import { createFileRoute, redirect } from "@tanstack/react-router";

import { healthApi } from "@/features/health/api";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/workspaces")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }

    const response = await healthApi.listWorkspaces();
    const firstWorkspace = response.workspaces[0];
    redirect({
      to: firstWorkspace ? "/workspaces/$workspaceId" : "/workspaces/new",
      params: firstWorkspace ? { workspaceId: firstWorkspace.id } : undefined,
      throw: true,
    });
  },
});
