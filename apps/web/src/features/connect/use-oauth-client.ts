import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

export type OAuthClientInfo = {
  clientId: string;
  name: string;
  icon: string | null;
  uri: string | null;
};

type PublicClient = { client_id: string; client_name?: string | null; logo_uri?: string | null; client_uri?: string | null };

/**
 * The app asking for access, from the in-flight OAuth request in the URL.
 * Before sign-in this goes through the prelogin endpoint, which only answers
 * for a request carrying a valid server signature.
 */
export function useOAuthClient(signedIn: boolean) {
  const [client, setClient] = useState<OAuthClientInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    const request = signedIn
      ? authClient.$fetch<PublicClient>("/oauth2/public-client", { method: "GET", query: { client_id: clientId } })
      : authClient.$fetch<PublicClient>("/oauth2/public-client-prelogin", { method: "POST", body: { client_id: clientId } });

    void request.then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      setClient({
        clientId,
        name: data.client_name?.trim() || "An app",
        icon: data.logo_uri ?? null,
        uri: data.client_uri ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return { client, failed };
}

/** A recognisable host for "where will this send you" — never the raw URI. */
export function displayHost(uri: string | null) {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

/**
 * What the consent screen can actually vouch for. Name, logo and client_uri
 * are whatever the app registered — an impostor can call itself "Claude". Two
 * things it can't fake: the redirect host (part of the server-signed request
 * in this page's URL), and, for apps identified by a Client ID Metadata
 * Document, the https domain that IS the client_id.
 */
export function describeTrust(client: OAuthClientInfo | null, search: string) {
  const redirectHost = displayHost(new URLSearchParams(search).get("redirect_uri"));
  const cimdHost = client?.clientId.startsWith("https://") ? displayHost(client.clientId) : null;
  const claimedHost = displayHost(client?.uri ?? null);
  const sameSite = (a: string | null, b: string | null) =>
    Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));

  const verified = Boolean(cimdHost && redirectHost && sameSite(cimdHost, redirectHost));
  const mismatch = Boolean(claimedHost && redirectHost && !sameSite(claimedHost, redirectHost));
  return { redirectHost, verified, mismatch, claimedHost };
}
