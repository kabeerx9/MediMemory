import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[var(--surface-nav)] backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        <Link className="flex items-center gap-2.5" to="/">
          <span className="flex size-9 items-center justify-center rounded-md bg-[var(--sentri-accent-violet-deep)]">
            <Activity className="size-5 text-sentri-lime" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">Caretalk</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
            to="/workspaces/new"
          >
            New workspace
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
