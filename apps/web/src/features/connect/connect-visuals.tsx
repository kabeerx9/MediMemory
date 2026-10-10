import { cn } from "@caretalk/ui/lib/utils";
import { Activity, ArrowLeftRight } from "lucide-react";
import { useState } from "react";

export function CaretalkMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--sentri-accent-violet-deep)] shadow-sm",
        className,
      )}
    >
      <Activity className="size-5 text-sentri-lime" />
    </span>
  );
}

/** An external app's logo, falling back to its initial when there's none (or it fails to load). */
export function AppAvatar({ name, icon, className }: { name: string; icon: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card text-lg font-semibold text-foreground shadow-sm",
        className,
      )}
    >
      {icon && !broken ? (
        <img alt="" className="size-full object-cover" onError={() => setBroken(true)} src={icon} />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </span>
  );
}

/** "App ⇄ Caretalk" — the visual anchor of every connect screen. */
export function ConnectPair({ name, icon }: { name: string; icon: string | null }) {
  return (
    <div aria-hidden className="flex items-center justify-center gap-3">
      <AppAvatar icon={icon} name={name} />
      <span className="flex size-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
        <ArrowLeftRight className="size-3.5" />
      </span>
      <CaretalkMark />
    </div>
  );
}

/** Full-height centered frame shared by the login, consent, and upload screens. */
export function CenteredScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center overflow-y-auto bg-background px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
