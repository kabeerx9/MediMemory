import { createFileRoute, redirect } from "@tanstack/react-router";

import { WorkspaceShell } from "@/features/health/workspace-ui";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
    return { session };
  },
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const { session } = Route.useRouteContext();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceShell userEmail={session.data?.user.email} workspaceId={workspaceId} />
    </div>
  );
}
