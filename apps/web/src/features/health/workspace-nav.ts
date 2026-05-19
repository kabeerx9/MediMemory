import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Calendar,
  FileText,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  Pill,
  Thermometer,
  Upload,
} from "lucide-react";

export const workspaceSections = [
  { to: "/workspaces/$workspaceId", label: "Overview", icon: LayoutDashboard },
  { to: "/workspaces/$workspaceId/status", label: "Current Status", icon: Activity },
  { to: "/workspaces/$workspaceId/timeline", label: "Timeline", icon: Calendar },
  { to: "/workspaces/$workspaceId/medications", label: "Medications", icon: Pill },
  { to: "/workspaces/$workspaceId/symptoms", label: "Symptoms", icon: Thermometer },
  { to: "/workspaces/$workspaceId/reports", label: "Reports", icon: FileText },
  { to: "/workspaces/$workspaceId/questions", label: "Doctor Questions", icon: HelpCircle },
  { to: "/workspaces/$workspaceId/chat", label: "Chat", icon: MessageSquare },
  { to: "/workspaces/$workspaceId/import", label: "Import", icon: Upload },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  icon: LucideIcon;
}>;

export function isWorkspaceChatRoute(pathname: string, workspaceId: string) {
  return pathname === `/workspaces/${workspaceId}/chat`;
}

export function isWorkspaceSectionActive(pathname: string, workspaceId: string, sectionTo: string) {
  const base = `/workspaces/${workspaceId}`;
  if (sectionTo === "/workspaces/$workspaceId") {
    return pathname === base;
  }
  const segment = sectionTo.split("/").pop();
  return segment ? pathname.startsWith(`${base}/${segment}`) : false;
}
