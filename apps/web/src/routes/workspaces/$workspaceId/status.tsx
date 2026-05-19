import { createFileRoute } from "@tanstack/react-router";

import { StatusPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/status")({
  component: RouteComponent,
});

function RouteComponent() {
  return <StatusPage {...useWorkspaceRouteContext()} />;
}
