import { createFileRoute, redirect } from "@tanstack/react-router";

import { ImportPage } from "@/features/health/import-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/workspaces/$workspaceId/import")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
  },
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  return <ImportPage workspaceId={workspaceId} />;
}
