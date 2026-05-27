import { Button } from "@caretalk/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@caretalk/ui/components/sidebar";
import type { HealthWorkspace } from "@caretalk/contracts/health";
import { Link, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect } from "react";

import { isWorkspaceSectionActive, workspaceSections } from "@/features/health/workspace-nav";

export function WorkspaceSidebar({
  workspaces,
  workspaceId,
}: {
  workspaces: HealthWorkspace[];
  workspaceId: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        <p className="truncate px-2 font-display text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          Caretalk
        </p>
        <p className="type-eyebrow px-2 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          Workspaces
        </p>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Your cases</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaces.map((workspace) => {
                const active = workspace.id === workspaceId;
                return (
                  <SidebarMenuItem key={workspace.id}>
                    <SidebarMenuButton
                      isActive={active}
                      className="rounded-lg data-active:bg-[var(--sentri-accent-violet-deep)] data-active:text-primary-foreground"
                      render={
                        <Link
                          params={{ workspaceId: workspace.id }}
                          to="/workspaces/$workspaceId"
                        />
                      }
                      tooltip={workspace.name}
                    >
                      <span
                        className={
                          "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold " +
                          (active
                            ? "bg-sentri-lime text-[var(--sentri-ink-deep)]"
                            : "bg-sidebar-accent text-sidebar-foreground")
                        }
                      >
                        {workspace.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate font-medium">{workspace.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Memory</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceSections.map((section) => {
                const Icon = section.icon;
                const active = isWorkspaceSectionActive(pathname, workspaceId, section.to);
                return (
                  <SidebarMenuItem key={section.to}>
                    <SidebarMenuButton
                      isActive={active}
                      className="rounded-lg data-active:bg-[var(--sentri-accent-violet-deep)] data-active:text-primary-foreground"
                      render={<Link params={{ workspaceId }} to={section.to} />}
                      tooltip={section.label}
                    >
                      <Icon />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <Link className="block" to="/workspaces/new">
          <Button className="w-full gap-2" size="sm" variant="outline">
            <Plus className="size-4 shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">New workspace</span>
          </Button>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
