import { createFileRoute } from "@tanstack/react-router";

import { TimelinePage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/timeline")({
  component: RouteComponent,
});

function RouteComponent() {
  return <TimelinePage {...useWorkspaceRouteContext()} />;
}
