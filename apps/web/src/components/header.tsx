import { Link } from "@tanstack/react-router";
import { Activity, Plug } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[var(--surface-nav)] backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        <Link className="flex items-center gap-2.5" to="/workspaces">
          <span className="flex size-8 items-center justify-center rounded-md bg-[var(--sentri-accent-violet-deep)]">
            <Activity className="size-4 text-sentri-lime" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight">Caretalk</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            aria-label="Connected apps"
            activeProps={{ className: "bg-[var(--surface-hover)] text-foreground" }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
            to="/connections"
          >
            <Plug className="size-4" />
            <span className="hidden sm:inline">Connected apps</span>
          </Link>
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
