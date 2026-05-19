import { createFileRoute } from "@tanstack/react-router";

import { AddToMemoryPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/add")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AddToMemoryPage {...useWorkspaceRouteContext()} />;
}
