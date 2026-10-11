import { Button } from "@caretalk/ui/components/button";
import { Card, CardContent } from "@caretalk/ui/components/card";
import { AlertTriangle, BadgeCheck, BookOpenText, History, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import { CenteredScreen, ConnectPair } from "./connect-visuals";
import { describeTrust, useOAuthClient } from "./use-oauth-client";

type ConsentResponse = { url?: string; redirect_uri?: string };

const capabilities = [
  {
    icon: BookOpenText,
    title: "Read your health memory",
    detail: "Profiles, history, lab values and medications in every workspace — so it answers from what's actually recorded.",
  },
  {
    icon: PenLine,
    title: "Save what's new",
    detail: "New readings, dose changes, symptoms and reports you share with it, each tagged as coming from this app.",
  },
  {
    icon: History,
    title: "Nothing it does is permanent",
    detail: "It has no delete. Replaced facts and profile edits stay in history, and you can undo any of them here.",
  },
] as const;

export function ConsentPage() {
  const { data: session } = authClient.useSession();
  const { client, failed } = useOAuthClient(true);
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "allow" : "deny");
    setError(null);
    // The client plugin attaches the signed oauth_query from this page's URL.
    const { data, error: requestError } = await authClient.$fetch<ConsentResponse>("/oauth2/consent", {
      method: "POST",
      body: { accept },
    });
    const target = data?.url ?? data?.redirect_uri;
    if (requestError || !target) {
      setPending(null);
      setError(
        requestError?.status === 400 || requestError?.status === 401
          ? "This request expired. Start connecting again from the app."
          : "Something went wrong. Try again.",
      );
      return;
    }
    // Hands control back to the app (Claude, ChatGPT…) with the result.
    window.location.assign(target);
  }

  if (failed) {
    return (
      <CenteredScreen>
        <Card variant="light">
          <CardContent className="space-y-2 pt-8 text-center">
            <h1 className="font-display text-xl font-semibold">This link isn't valid anymore</h1>
            <p className="text-sm text-muted-foreground">
              Go back to the app you were connecting and start again.
            </p>
          </CardContent>
        </Card>
      </CenteredScreen>
    );
  }

  const name = client?.name ?? "This app";
  const trust = describeTrust(client, window.location.search);

  return (
    <CenteredScreen>
      <Card variant="light">
        <CardContent className="space-y-7 pt-8">
          <div className="space-y-4 text-center">
            <ConnectPair icon={client?.icon ?? null} name={name} />
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">
                {client ? `Connect ${name} to Caretalk?` : "Connect to Caretalk?"}
              </h1>
              <p className="text-sm text-muted-foreground">
                signed in as <span className="font-medium text-foreground">{session?.user.email ?? "…"}</span>
              </p>
            </div>
          </div>

          <div
            className={
              trust.mismatch
                ? "space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
                : "space-y-1 rounded-lg border border-border bg-[var(--surface-subtle)] px-3 py-2.5 text-sm"
            }
          >
            <p className="flex items-center gap-1.5 text-foreground">
              {trust.verified ? (
                <BadgeCheck className="size-4 shrink-0 text-[var(--sentri-accent-violet-deep)] dark:text-sentri-lime" />
              ) : (
                <AlertTriangle className={trust.mismatch ? "size-4 shrink-0 text-destructive" : "size-4 shrink-0 text-muted-foreground"} />
              )}
              <span>
                Access will be sent to <span className="font-semibold">{trust.redirectHost ?? "an unknown address"}</span>
              </span>
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {trust.mismatch
                ? `This app calls itself “${name}” at ${trust.claimedHost}, but is sending access somewhere else. Don't allow unless you trust ${trust.redirectHost}.`
                : trust.verified
                  ? `Verified: this app is identified by ${trust.redirectHost}.`
                  : `The name and logo above were chosen by the app itself. Only allow if you just started connecting from ${trust.redirectHost ?? "an app you trust"}.`}
            </p>
          </div>

          <ul className="space-y-4">
            {capabilities.map(({ icon: Icon, title, detail }) => (
              <li className="flex gap-3" key={title}>
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--sentri-accent-violet-deep)] dark:text-sentri-lime">
                  <Icon className="size-4" />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
                </div>
              </li>
            ))}
          </ul>

          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={pending !== null} onClick={() => void decide(false)} variant="outline">
                {pending === "deny" ? <Loader2 className="animate-spin" /> : null}
                Don't allow
              </Button>
              <Button disabled={pending !== null || !client} onClick={() => void decide(true)}>
                {pending === "allow" ? <Loader2 className="animate-spin" /> : null}
                Allow
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Disconnect anytime from Connected apps in Caretalk.
            </p>
          </div>
        </CardContent>
      </Card>
    </CenteredScreen>
  );
}
