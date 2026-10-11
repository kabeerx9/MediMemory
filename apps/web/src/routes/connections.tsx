import { createFileRoute, redirect } from "@tanstack/react-router";

import { ConnectionsPage } from "@/features/connect/connections-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/connections")({
  component: ConnectionsPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
  },
});
