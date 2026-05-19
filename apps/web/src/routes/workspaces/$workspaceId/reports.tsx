import { createFileRoute } from "@tanstack/react-router";

import { ReportPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/reports")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ReportPage {...useWorkspaceRouteContext()} />;
}
