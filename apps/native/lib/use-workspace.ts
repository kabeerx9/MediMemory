import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalSearchParams } from "expo-router";

import { healthApi } from "@/lib/api";

/**
 * One query key for the workspace, shared by all three tabs.
 *
 * Tabs render simultaneously under NativeTabs, so without a single cache entry
 * a save in Chat would leave Record and Trends showing stale facts until each
 * was visited. Invalidating this key updates all three at once.
 *
 * GLOBAL search params, not local. `[workspaceId]` is a segment of the parent
 * stack, and `useLocalSearchParams` only resolves segments owned by the focused
 * route — so a screen nested inside the tabs navigator reads it on first render
 * and then gets `undefined` once navigation state settles, silently producing
 * request URLs like `/workspaces/undefined/...`.
 */
export function useWorkspace() {
  const { workspaceId } = useGlobalSearchParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => healthApi.getWorkspace(workspaceId),
    enabled: !!workspaceId,
  });

  return {
    workspaceId,
    detail: query.data,
    workspace: query.data?.workspace,
    memories: query.data?.memories ?? [],
    sessions: query.data?.chatSessions ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  };
}
