import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";

import { healthApi } from "@/lib/api";

/**
 * One query key for the workspace, shared by all three tabs.
 *
 * Tabs render simultaneously under NativeTabs, so without a single cache entry
 * a save in Chat would leave Record and Trends showing stale facts until each
 * was visited. Invalidating this key updates all three at once.
 */
export function useWorkspace() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
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
