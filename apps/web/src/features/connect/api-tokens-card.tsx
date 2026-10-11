import { Button } from "@caretalk/ui/components/button";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";

import { hermesConfigCommand } from "./hermes-token";
import { pickWhoopWorkspace } from "./whoop-state";

// Personal API tokens: how the Hermes CLI on the VPS reads and writes the
// daily tracker without OAuth. A new token is shown exactly once, as a
// command to paste into your own terminal.

type Token = Awaited<ReturnType<typeof healthApi.listApiTokens>>["tokens"][number];

export function ApiTokensCard() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () =>
    healthApi
      .listApiTokens()
      .then(({ tokens }) => setTokens(tokens))
      .catch(() => setTokens([]));

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    try {
      const { workspaces } = await healthApi.listWorkspaces();
      const workspace = pickWhoopWorkspace(workspaces);
      if (!workspace) throw new Error("Create a workspace first");
      const { token } = await healthApi.createApiToken(workspace.id, "Hermes");
      setCreated(token);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create a token");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await healthApi.revokeApiToken(id);
      toast.success("Token revoked — anything using it stops working now");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke");
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(hermesConfigCommand(created));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select the command and copy it manually.");
    }
  }

  return (
    <div className="space-y-3">
      {created ? (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">Run this in your own terminal — it's shown only once.</p>
          <pre className="overflow-x-auto rounded-lg bg-[var(--surface-code)] p-3 font-mono text-xs leading-relaxed text-foreground select-all">
            {hermesConfigCommand(created)}
          </pre>
          <div className="flex items-center gap-2">
            <Button onClick={() => void copy()} size="sm">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy command"}
            </Button>
            <Button onClick={() => setCreated(null)} size="sm" variant="ghost">
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {tokens === null ? (
        <div className="h-16 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">
          {tokens.map((token) => (
            <li className="flex flex-wrap items-center gap-3 px-4 py-3" key={token.id}>
              <KeyRound className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(token.createdAt).toLocaleDateString()} ·{" "}
                  {token.lastUsedAt ? `last used ${new Date(token.lastUsedAt).toLocaleString()}` : "never used"}
                </p>
              </div>
              <Button onClick={() => void revoke(token.id)} size="sm" variant="outline">
                Revoke
              </Button>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-muted-foreground">Lets Hermes save your daily check-ins and workouts here.</p>
            <Button disabled={busy} onClick={() => void create()} size="sm">
              {busy ? <Loader2 className="animate-spin" /> : <KeyRound className="size-3.5" />}
              New Hermes token
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}
