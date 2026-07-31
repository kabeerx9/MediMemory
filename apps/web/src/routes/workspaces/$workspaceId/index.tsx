import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceShell } from "@/features/health/workspace-shell";

type WorkspaceSearch = { session?: string };

export const Route = createFileRoute("/workspaces/$workspaceId/")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => ({
    session: typeof search.session === "string" ? search.session : undefined,
  }),
});

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const { session: sessionParam } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <WorkspaceShell
      onSessionChange={(sessionId) => {
        void navigate({ search: { session: sessionId }, replace: true });
      }}
      sessionParam={sessionParam}
      workspaceId={workspaceId}
    />
  );
}
