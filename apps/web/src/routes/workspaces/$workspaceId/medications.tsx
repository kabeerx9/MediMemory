import { createFileRoute } from "@tanstack/react-router";

import { MedicationPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/medications")({
  component: RouteComponent,
});

function RouteComponent() {
  return <MedicationPage {...useWorkspaceRouteContext()} />;
}
