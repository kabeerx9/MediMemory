import type { Workspace } from "@caretalk/contracts/health";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { router, Stack } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { healthApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { type AppTheme, radius, space, type } from "@/lib/theme";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  PressableCard,
  Screen,
  useTheme,
} from "@/components/ui";

export default function Workspaces() {
  const theme = useTheme();
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await healthApi.listWorkspaces()).workspaces,
  });

  useFocusEffect(
    useCallback(() => {
      void workspacesQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  // Account-wide export = full backup of every workspace. The per-workspace
  // export (the one you paste into an external chat) lives on the workspace
  // screen, where the scope is unambiguous.
  async function exportAll() {
    if (exporting) return;
    setExporting(true);
    try {
      const markdown = await healthApi.exportAccountMarkdown();
      const target = new File(Paths.cache, "caretalk-all-memories.md");
      target.write(markdown);
      await Sharing.shareAsync(target.uri, {
        mimeType: "text/markdown",
        dialogTitle: "Export all workspaces",
        UTI: "net.daringfireball.markdown",
      });
    } catch (err) {
      Alert.alert("Export failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen edges={["bottom"]} scroll>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                disabled={exporting}
                onPress={() => void exportAll()}
                style={styles.headerAction}
                accessibilityRole="button"
                accessibilityLabel="Back up all workspaces"
              >
                {exporting ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <>
                    <Ionicons color={theme.primary} name="cloud-upload-outline" size={16} />
                    <Text style={[type.label as object, { color: theme.primary }]}>Back up all</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => void signOut()}
                style={styles.headerAction}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <Text style={[type.label as object, { color: theme.textMuted }]}>Sign out</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      <View style={styles.header}>
        <Text style={[type.display as object, { color: theme.text }]}>Workspaces</Text>
        <Text style={[type.callout as object, { color: theme.textMuted }]}>
          One workspace per person or health journey you're keeping track of.
        </Text>
      </View>

      {workspacesQuery.isLoading ? (
        <ActivityIndicator color={theme.primary} style={styles.spinner} />
      ) : workspacesQuery.isError ? (
        <ErrorNote
          message={
            workspacesQuery.error instanceof Error
              ? workspacesQuery.error.message
              : "Could not load workspaces."
          }
        />
      ) : workspacesQuery.data && workspacesQuery.data.length === 0 ? (
        !creating ? (
          <EmptyState
            icon="people-outline"
            title="No workspaces yet"
            body="One workspace per person or health journey you're keeping track of. Create one to start."
            action={
              <Button
                icon="add"
                label="Create workspace"
                onPress={() => setCreating(true)}
                variant="primary"
              />
            }
          />
        ) : null
      ) : (
        <View style={styles.list}>
          {workspacesQuery.data?.map((workspace) => (
            <WorkspaceCard key={workspace.id} theme={theme} workspace={workspace} />
          ))}
        </View>
      )}

      {creating ? (
        <CreateWorkspaceForm onCancel={() => setCreating(false)} />
      ) : workspacesQuery.data && workspacesQuery.data.length > 0 ? (
        <Button
          icon="add"
          label="New workspace"
          onPress={() => setCreating(true)}
          variant="secondary"
          full
        />
      ) : null}
    </Screen>
  );
}

// Relative, human-readable timestamps read calmer than a raw date — "Updated
// 3 days ago" instead of "Updated 7/28/2026". Falls back to a short date once
// it's far enough back that "N weeks ago" stops being useful.
function relativeTime(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);

  if (dayDiff <= 0) return "Updated today";
  if (dayDiff === 1) return "Updated yesterday";
  if (dayDiff < 7) return `Updated ${dayDiff} days ago`;
  if (dayDiff < 30) {
    const weeks = Math.round(dayDiff / 7);
    return `Updated ${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  return `Updated ${then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function WorkspaceCard({ workspace, theme }: { workspace: Workspace; theme: AppTheme }) {
  const initial = workspace.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <PressableCard
      onPress={() =>
        router.push({ pathname: "/workspace/[workspaceId]", params: { workspaceId: workspace.id } })
      }
      style={styles.card}
    >
      <View style={styles.cardRow}>
        <View style={[styles.monogram, { backgroundColor: theme.primarySoft }]}>
          <Text style={[type.heading as object, { color: theme.primary }]}>{initial}</Text>
        </View>

        <View style={styles.cardBody}>
          <Text style={[type.title as object, { color: theme.text }]}>{workspace.name}</Text>
          <Text
            style={[type.callout as object, { color: theme.textMuted }]}
            numberOfLines={2}
          >
            {workspace.description || "No description yet."}
          </Text>
          <Text style={[type.caption as object, { color: theme.textFaint }]}>
            {relativeTime(workspace.updatedAt)}
          </Text>
        </View>

        <Ionicons color={theme.textFaint} name="chevron-forward" size={18} />
      </View>
    </PressableCard>
  );
}

function CreateWorkspaceForm({ onCancel }: { onCancel: () => void }) {
  const theme = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      healthApi.createWorkspace({
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: (workspace) => {
      queryClient.setQueryData<Workspace[]>(["workspaces"], (prev) =>
        prev ? [workspace, ...prev] : [workspace],
      );
      setName("");
      setDescription("");
      router.push({ pathname: "/workspace/[workspaceId]", params: { workspaceId: workspace.id } });
    },
  });

  return (
    <Card style={styles.form}>
      <Field
        autoFocus
        label="Name"
        onChangeText={setName}
        placeholder="Dad, Mom's knee, my pregnancy…"
        value={name}
      />
      <Field
        label="Description"
        multiline
        numberOfLines={2}
        onChangeText={setDescription}
        placeholder="A sentence of context, if it's useful later."
        value={description}
      />
      {createMutation.isError ? (
        <ErrorNote
          message={
            createMutation.error instanceof Error
              ? createMutation.error.message
              : "Could not create workspace."
          }
        />
      ) : null}
      <View style={styles.formActions}>
        <Button
          label="Cancel"
          onPress={onCancel}
          disabled={createMutation.isPending}
          variant="ghost"
        />
        <Button
          label="Create workspace"
          loading={createMutation.isPending}
          disabled={!name.trim()}
          onPress={() => createMutation.mutate()}
          variant="primary"
          style={styles.formSubmit}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.xs,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
  },
  headerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  spinner: {
    marginTop: space.xxl,
  },
  list: {
    gap: space.md,
  },
  card: {
    padding: space.md,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  monogram: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    gap: space.xs,
  },
  form: {
    gap: space.md,
  },
  formActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  formSubmit: {
    flex: 1,
  },
});
