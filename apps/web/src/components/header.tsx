import { Link } from "@tanstack/react-router";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "MediMemory" },
  ] as const;

  return (
    <div className="border-b bg-background/95">
      <div className="flex min-h-14 flex-row items-center justify-between px-4">
        <nav className="flex items-center gap-4 text-sm font-medium">
          {links.map(({ to, label }) => (
            <Link key={to} to={to} className="text-muted-foreground hover:text-foreground active:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
