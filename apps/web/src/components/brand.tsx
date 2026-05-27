import { cn } from "@caretalk/ui/lib/utils";
import type { ReactNode } from "react";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("type-eyebrow text-muted-foreground", className)}>{children}</p>;
}

export function LimeKeyword({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-xs bg-sentri-lime px-3 py-0 font-display font-bold text-[var(--sentri-ink-deep)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DisplayHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function StarfieldCanvas({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("starfield min-h-0 flex-1 overflow-y-auto", className)}>{children}</div>;
}

export function SquiggleDivider({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn("h-3 w-full text-sentri-lime", className)}
      preserveAspectRatio="none"
      viewBox="0 0 400 12"
    >
      <path
        d="M0 6 Q50 0 100 6 T200 6 T300 6 T400 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}
