import { createFileRoute } from "@tanstack/react-router";

import { ProposalPage } from "@/features/health/workspace-ui";

export const Route = createFileRoute("/workspaces/$workspaceId/review/$proposalId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId, proposalId } = Route.useParams();
  return <ProposalPage proposalId={proposalId} workspaceId={workspaceId} />;
}
