import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  MessageSquare,
  Sparkles,
} from "lucide-react";

export const workspaceSections = [
  { to: "/workspaces/$workspaceId", label: "Memory", icon: BookOpenText },
  { to: "/workspaces/$workspaceId/add", label: "Add to Memory", icon: Sparkles },
  { to: "/workspaces/$workspaceId/ask", label: "Ask", icon: MessageSquare },
] as const satisfies ReadonlyArray<{
  to: string;
  label: string;
  icon: LucideIcon;
}>;

export function isWorkspaceChatRoute(pathname: string, workspaceId: string) {
  return pathname === `/workspaces/${workspaceId}/ask`;
}

export function isWorkspaceSectionActive(pathname: string, workspaceId: string, sectionTo: string) {
  const base = `/workspaces/${workspaceId}`;
  if (sectionTo === "/workspaces/$workspaceId") {
    return pathname === base;
  }
  const segment = sectionTo.split("/").pop();
  return segment ? pathname.startsWith(`${base}/${segment}`) : false;
}
