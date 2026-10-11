import { createFileRoute, redirect } from "@tanstack/react-router";

import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: "/login", throw: true });
    }
  },
});
