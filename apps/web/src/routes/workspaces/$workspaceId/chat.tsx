import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/workspaces/$workspaceId/chat")({
  beforeLoad: ({ params }) => {
    redirect({ to: "/workspaces/$workspaceId/ask", params, throw: true });
  },
});
