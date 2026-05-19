import { createFileRoute } from "@tanstack/react-router";

import { ChatPage, useWorkspaceRouteContext } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/ask")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ChatPage {...useWorkspaceRouteContext()} />;
}
