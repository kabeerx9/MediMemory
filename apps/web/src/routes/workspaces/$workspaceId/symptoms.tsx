import { createFileRoute } from "@tanstack/react-router";

import { SymptomPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/symptoms")({
  component: RouteComponent,
});

function RouteComponent() {
  return <SymptomPage {...useWorkspaceRouteContext()} />;
}
