import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/$workspaceId/proposals/$proposalId")({
  beforeLoad: ({ params }) => {
    redirect({ to: "/workspaces/$workspaceId/review/$proposalId", params, throw: true });
  },
});
