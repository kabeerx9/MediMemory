import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/$workspaceId/questions")({
  beforeLoad: ({ params }) => {
    redirect({ to: "/workspaces/$workspaceId", params, throw: true });
  },
});
