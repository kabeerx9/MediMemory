import { createFileRoute } from "@tanstack/react-router";

import { ImportPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/import")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ImportPage {...useWorkspaceRouteContext()} />;
}
