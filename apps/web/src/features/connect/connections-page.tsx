import type { Connection, ConnectionsResponse } from "@caretalk/contracts/health";
import { Button } from "@caretalk/ui/components/button";
import { cn } from "@caretalk/ui/lib/utils";
import { AlertTriangle, Check, Copy, Loader2, Plug, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { healthApi } from "@/features/health/api";

import { ApiTokensCard } from "./api-tokens-card";
import { AppAvatar } from "./connect-visuals";
import { WhoopCard } from "./whoop-card";

type Guide = "claude" | "chatgpt" | "other";

const guides: Record<Guide, { label: string; steps: React.ReactNode[]; note?: string }> = {
  claude: {
    label: "Claude",
    steps: [
      <>
        On <strong>claude.ai</strong> in a browser, open <strong>Settings → Connectors</strong> and choose{" "}
        <strong>Add custom connector</strong>.
      </>,
      <>
        Name it <strong>Caretalk</strong>, paste the URL above, and add it.
      </>,
      <>
        Press <strong>Connect</strong>, sign in to Caretalk, and choose <strong>Allow</strong>.
      </>,
      <>
        That's it — the Claude phone app picks it up automatically. If a chat doesn't use it, turn Caretalk on from
        the chat's tools menu.
      </>,
    ],
  },
  chatgpt: {
    label: "ChatGPT",
    steps: [
      <>
        On <strong>chatgpt.com</strong>, open <strong>Settings → Apps &amp; Connectors</strong> and turn on{" "}
        <strong>Developer mode</strong> (under Advanced).
      </>,
      <>
        Create a connector named <strong>Caretalk</strong> with the URL above and <strong>OAuth</strong> authentication.
      </>,
      <>
        Sign in to Caretalk when asked and choose <strong>Allow</strong>.
      </>,
    ],
    note: "Developer mode availability depends on your ChatGPT plan, and saving from the ChatGPT phone app may not be supported yet — reading works.",
  },
  other: {
    label: "Other apps",
    steps: [
      <>
        Any app that supports <strong>remote MCP servers with OAuth</strong> (Hermes, Cursor, Claude Desktop…) can
        connect with the same URL.
      </>,
      <>Add it as a remote / HTTP MCP server; the app will open Caretalk for you to sign in and allow access.</>,
    ],
  },
};

function isLocalOnly(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local");
  } catch {
    return false;
  }
}

export function ConnectionsPage() {
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [guide, setGuide] = useState<Guide>("claude");

  function load() {
    return healthApi
      .getConnections()
      .then(setData)
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not load connections"));
  }

  useEffect(() => {
    void load();
  }, []);

  // Outer frame takes the app shell's last-child clip; the inner element scrolls.
  return (
    <div className="flex min-h-0 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
        <header className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Plug className="size-3.5" /> Connected apps
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">
            Use your memory from Claude and ChatGPT
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
            Connect an AI app once. Every new chat — on your phone or computer — can read the whole health history
            before answering and save what's new, so nothing depends on one long conversation again.
          </p>
        </header>

        <section className="space-y-3" aria-labelledby="connector-url">
          <h2 className="text-sm font-semibold text-foreground" id="connector-url">
            Your connector URL
          </h2>
          {data ? <ConnectorUrl url={data.mcpUrl} /> : <div className="h-12 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />}
          {data && isLocalOnly(data.mcpUrl) ? (
            <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This address only works on this computer. Claude and ChatGPT connect from the internet, so they need
                Caretalk running on a public HTTPS address first.
              </span>
            </p>
          ) : null}
        </section>

        <section className="space-y-4" aria-labelledby="setup">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground" id="setup">
              Set it up
            </h2>
            <div className="inline-flex rounded-lg border border-border bg-[var(--surface-subtle)] p-0.5" role="tablist">
              {(Object.keys(guides) as Guide[]).map((key) => (
                <button
                  aria-selected={guide === key}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                    guide === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                  key={key}
                  onClick={() => setGuide(key)}
                  role="tab"
                  type="button"
                >
                  {guides[key].label}
                </button>
              ))}
            </div>
          </div>
          <ol className="space-y-3" role="tabpanel">
            {guides[guide].steps.map((step, index) => (
              <li className="flex gap-3" key={`${guide}-${index}`}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-xs font-semibold text-foreground tabular-nums">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
                  {step}
                </p>
              </li>
            ))}
          </ol>
          {guides[guide].note ? <p className="text-xs leading-relaxed text-muted-foreground">{guides[guide].note}</p> : null}
        </section>

        <section className="space-y-3" aria-labelledby="connected">
          <h2 className="text-sm font-semibold text-foreground" id="connected">
            Connected
          </h2>
          {data === null ? (
            <div className="h-20 animate-pulse rounded-xl bg-[var(--surface-subtle)]" />
          ) : data.connections.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No apps connected yet. Follow the steps above — it shows up here once you choose Allow.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/70">
              {data.connections.map((connection) => (
                <ConnectionRow connection={connection} key={connection.clientId} onDisconnected={() => void load()} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="devices">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground" id="devices">
              Devices
            </h2>
            <p className="text-sm text-muted-foreground">
              Wearable data lands next to the medical record, so any connected app can relate the two.
            </p>
          </div>
          <WhoopCard />
        </section>

        <section className="space-y-3" aria-labelledby="tokens">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground" id="tokens">
              Personal tokens
            </h2>
            <p className="text-sm text-muted-foreground">For tools that can't sign in with a browser, like the Hermes CLI.</p>
          </div>
          <ApiTokensCard />
        </section>
      </div>
    </div>
    </div>
  );
}

function ConnectorUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select the URL and copy it manually.");
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-code)] p-1.5 pl-4">
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground select-all">{url}</code>
      <Button aria-label="Copy connector URL" onClick={() => void copy()} size="sm" variant={copied ? "secondary" : "default"}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function ConnectionRow({ connection, onDisconnected }: { connection: Connection; onDisconnected: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await healthApi.disconnect(connection.clientId);
      toast.success(`${connection.name} disconnected`);
      onDisconnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect");
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3.5">
      <AppAvatar className="size-10 rounded-lg text-base" icon={connection.icon} name={connection.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{connection.name}</p>
        <p className="text-xs text-muted-foreground">
          Connected{" "}
          {new Date(connection.connectedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          {" · "}can read and save
        </p>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <Button disabled={busy} onClick={() => setConfirming(false)} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void disconnect()} size="sm" variant="destructive">
            {busy ? <Loader2 className="animate-spin" /> : <Unplug className="size-3.5" />}
            Disconnect
          </Button>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)} size="sm" variant="outline">
          Disconnect
        </Button>
      )}
    </li>
  );
}
