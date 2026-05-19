import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/$workspaceId/medications")({
  beforeLoad: ({ params }) => {
    redirect({ to: "/workspaces/$workspaceId", params, throw: true });
  },
});
