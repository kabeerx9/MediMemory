import { db } from "@caretalk/db";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@caretalk/db/schema/auth";
import { and, desc, eq } from "drizzle-orm";

// "Connected apps" = OAuth consents this user granted to MCP clients.
//
// Why this exists instead of better-auth's /oauth2/delete-consent: that
// endpoint removes the consent row only. The app's refresh token survives, so
// a "disconnected" Claude could keep minting access tokens for up to 30 days.
// Disconnect here removes consent and every token for the pair in one
// transaction, and the MCP route refuses any token whose consent is gone — so
// revocation is immediate, not "when the current JWT expires".

export const connectionsRepository = {
  async listConnections(userId: string) {
    const rows = await db
      .select({
        clientId: oauthConsent.clientId,
        scopes: oauthConsent.scopes,
        connectedAt: oauthConsent.createdAt,
        name: oauthClient.name,
        icon: oauthClient.icon,
        uri: oauthClient.uri,
      })
      .from(oauthConsent)
      .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(eq(oauthConsent.userId, userId))
      .orderBy(desc(oauthConsent.createdAt));

    // One app can hold several consent rows (re-authorizations); the user
    // thinks in apps, so collapse to the newest per client.
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (!row.clientId || seen.has(row.clientId)) return [];
      seen.add(row.clientId);
      return [
        {
          clientId: row.clientId,
          name: row.name?.trim() || "External app",
          icon: row.icon,
          uri: row.uri,
          scopes: row.scopes,
          connectedAt: row.connectedAt.toISOString(),
        },
      ];
    });
  },

  async isConnected(userId: string, clientId: string) {
    const [row] = await db
      .select({ id: oauthConsent.id })
      .from(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
      .limit(1);
    return Boolean(row);
  },

  /** Returns false when there was nothing to disconnect. */
  async disconnect(userId: string, clientId: string) {
    return db.transaction(async (tx) => {
      const removed = await tx
        .delete(oauthConsent)
        .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
        .returning({ id: oauthConsent.id });
      // Access tokens reference refresh tokens, so they go first.
      await tx
        .delete(oauthAccessToken)
        .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)));
      await tx
        .delete(oauthRefreshToken)
        .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)));
      return removed.length > 0;
    });
  },
};
