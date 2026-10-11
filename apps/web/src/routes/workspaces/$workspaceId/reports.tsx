import { createFileRoute } from "@tanstack/react-router";

import { ReportsPage } from "@/features/health/reports-page";

// Auth is enforced by the $workspaceId layout route.
export const Route = createFileRoute("/workspaces/$workspaceId/reports")({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  return <ReportsPage workspaceId={workspaceId} />;
}
