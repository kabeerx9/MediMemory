import { env } from "@caretalk/env/server";

import { whoopConfig } from "./config";
import { whoopRepository } from "./repository";
import { syncConnection } from "./sync";

// In-process timer: Caretalk runs as one instance, and the tokens, schema and
// sync code already live here — a separate cron would only add a second
// deploy unit. The next round is scheduled when the previous one finishes, so
// a slow round can't overlap itself; the advisory lock in sync.ts covers the
// other callers ("Sync now", the MCP tool).

type SchedulerDeps = {
  intervalMs: number;
  listConnectionIds: () => Promise<string[]>;
  sync: (connectionId: string) => Promise<unknown>;
};

export function startWhoopScheduler(deps: SchedulerDeps): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const round = async () => {
    try {
      for (const id of await deps.listConnectionIds()) {
        if (stopped) return;
        await deps.sync(id).catch((error) => console.error("WHOOP scheduled sync failed", { connectionId: id, error }));
      }
    } catch (error) {
      console.error("WHOOP scheduler round failed", error);
    } finally {
      if (!stopped) timer = setTimeout(round, deps.intervalMs);
    }
  };

  void round();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Starts the production scheduler, or does nothing when WHOOP isn't configured. */
export function startDefaultWhoopScheduler(): () => void {
  if (!whoopConfig()) return () => {};
  return startWhoopScheduler({
    intervalMs: env.WHOOP_SYNC_INTERVAL_MS,
    listConnectionIds: async () => (await whoopRepository.listActiveConnections()).map((c) => c.id),
    sync: (id) => syncConnection(id),
  });
}
