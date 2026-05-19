import { createFileRoute } from "@tanstack/react-router";

import { QuestionPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/questions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <QuestionPage {...useWorkspaceRouteContext()} />;
}
