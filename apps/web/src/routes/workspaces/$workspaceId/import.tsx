import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/$workspaceId/import")({
  beforeLoad: ({ params }) => {
    redirect({ to: "/workspaces/$workspaceId/add", params, throw: true });
  },
});
