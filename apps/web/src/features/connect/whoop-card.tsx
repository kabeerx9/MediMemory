import type { WhoopStatus } from "@caretalk/contracts/health";
import { Button, buttonVariants } from "@caretalk/ui/components/button";
import { AlertTriangle, Activity, Loader2, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";

import { pickWhoopWorkspace, whoopStatusLine } from "./whoop-state";

// Devices section of the Connections page. The page only manages the link —
// reading the data happens through Claude/ChatGPT/Hermes over MCP.

export function WhoopCard() {
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function load(workspaceId: string) {
    try {
      setStatus(await healthApi.getWhoop(workspaceId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load WHOOP status");
    }
  }

  useEffect(() => {
    // Back from WHOOP's consent page: say how it went, then drop the flag
    // from the URL so a refresh doesn't repeat the toast.
    const outcome = new URLSearchParams(window.location.search).get("whoop");
    if (outcome) {
      if (outcome === "connected") toast.success("WHOOP connected — pulling your history now");
      else toast.error("Couldn't connect WHOOP. Try again.");
      const url = new URL(window.location.href);
      url.searchParams.delete("whoop");
      window.history.replaceState(null, "", url);
    }

    healthApi
      .listWorkspaces()
      .then(({ workspaces }) => {
        const picked = pickWhoopWorkspace(workspaces);
        setWorkspace(picked);
        if (picked) void load(picked.id);
      })
      .catch(() => setWorkspace(null));
  }, []);

  async function sync() {
    if (!workspace) return;
    setBusy("sync");
    try {
      const result = await healthApi.syncWhoop(workspace.id);
      if (result.status === "ok") toast.success(`Synced — ${result.datesRecomputed} day${result.datesRecomputed === 1 ? "" : "s"} updated`);
      else toast.message(result.message ?? "Sync didn't complete");
      await load(workspace.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!workspace) return;
    setBusy("disconnect");
    try {
      await healthApi.disconnectWhoop(workspace.id);
      toast.success("WHOOP disconnected — your data so far is kept");
      setConfirming(false);
      await load(workspace.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  }

  if (workspace === undefined || (workspace && status === null)) {
    return <div className="h-20 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />;
  }
  if (workspace === null) {
    return <p className="text-sm text-muted-foreground">Create a workspace first, then connect a device to it.</p>;
  }
  if (!status?.configured) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        WHOOP isn't set up on this server yet.
      </p>
    );
  }

  const connection = status.connection;
  const connectHref = healthApi.whoopConnectUrl(workspace.id);
  const live = connection?.status === "active";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
        <Activity className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">WHOOP</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {connection?.status === "needs_reconnect" ? (
            <>
              <AlertTriangle className="size-3.5 text-amber-600" /> Needs reconnecting
            </>
          ) : live ? (
            `${whoopStatusLine(connection)} · into ${workspace.name}`
          ) : (
            `Recovery, sleep, strain and workouts, synced into ${workspace.name}`
          )}
        </p>
      </div>
      {live ? (
        confirming ? (
          <div className="flex items-center gap-1.5">
            <Button disabled={busy !== null} onClick={() => setConfirming(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button disabled={busy !== null} onClick={() => void disconnect()} size="sm" variant="destructive">
              {busy === "disconnect" ? <Loader2 className="animate-spin" /> : <Unplug className="size-3.5" />}
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button disabled={busy !== null} onClick={() => void sync()} size="sm" variant="outline">
              {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw className="size-3.5" />}
              Sync now
            </Button>
            <Button onClick={() => setConfirming(true)} size="sm" variant="ghost">
              Disconnect
            </Button>
          </div>
        )
      ) : (
        <a className={buttonVariants({ size: "sm" })} href={connectHref}>
          {connection ? "Reconnect" : "Connect WHOOP"}
        </a>
      )}
    </div>
  );
}
