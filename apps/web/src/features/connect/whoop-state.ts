import type { WhoopStatus } from "@caretalk/contracts/health";

type Connection = NonNullable<WhoopStatus["connection"]>;

/** WHOOP data belongs to the user's own workspace: "Me" if it exists, else the first. */
export function pickWhoopWorkspace<T extends { id: string; name: string }>(workspaces: T[]): T | null {
  return workspaces.find((w) => w.name.trim().toLowerCase() === "me") ?? workspaces[0] ?? null;
}

export function whoopStatusLine(connection: Connection, now: Date = new Date()): string {
  if (connection.lastError) return "Last sync failed — retrying automatically";
  if (!connection.lastSyncedAt) return "First sync in progress";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(connection.lastSyncedAt)) / 60_000));
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours} h ago`;
  return `Synced ${Math.round(hours / 24)} d ago`;
}
