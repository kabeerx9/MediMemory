import type { ProfileVersion } from "@caretalk/contracts/health";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Button, Divider, Eyebrow, Field, useTheme } from "@/components/ui";
import { healthApi } from "@/lib/api";
import { relativeTime } from "@/lib/record";
import { useWorkspace } from "@/lib/use-workspace";
import { radius, space, type } from "@/theme/tokens";

// The profile is the snapshot injected into every prompt — the highest-leverage
// text in the product and the most damaging to lose. It's also the one
// destructive write in an append-only system, so every change snapshots the
// text it replaced. This sheet is where you read that history and roll back.

const changedByLabel: Record<ProfileVersion["changedBy"], string> = {
  model: "Caretalk",
  user: "you",
  restore: "a restore",
};

export default function ProfileSheet() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const { workspace, refresh } = useWorkspace();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

  const versions = useQuery({
    queryKey: ["profile-versions", workspaceId],
    queryFn: () => healthApi.listProfileVersions(workspaceId),
    enabled: !!workspaceId,
  });

  function invalidate() {
    void refresh();
    void queryClient.invalidateQueries({ queryKey: ["profile-versions", workspaceId] });
  }

  const save = useMutation({
    mutationFn: (profile: string) =>
      healthApi.updateWorkspace(workspaceId, { profile: profile || null }),
    onSuccess: () => {
      setDraft(null);
      invalidate();
    },
    onError: (error) =>
      Alert.alert("Could not save", error instanceof Error ? error.message : "Try again."),
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => healthApi.restoreProfileVersion(workspaceId, versionId),
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert("Could not restore", error instanceof Error ? error.message : "Try again."),
  });

  const editing = draft !== null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
    >
      {editing ? (
        <>
          <Field
            label="Profile"
            multiline
            autoFocus
            value={draft}
            onChangeText={setDraft}
            placeholder="Diagnosis, current treatment, latest status, next appointment…"
          />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="Cancel" variant="ghost" onPress={() => setDraft(null)} style={{ flex: 1 }} />
            <Button
              title="Save"
              loading={save.isPending}
              onPress={() => save.mutate(draft ?? "")}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Eyebrow>Current</Eyebrow>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setDraft(workspace?.profile ?? "")}
            >
              <Text style={[type.caption, { color: theme.accent }]}>Edit</Text>
            </Pressable>
          </View>

          <Text selectable style={[type.body, { color: workspace?.profile ? theme.text : theme.textFaint }]}>
            {workspace?.profile ??
              "No profile yet. Caretalk drafts one as it learns the basics, or you can write it yourself."}
          </Text>
        </>
      )}

      <Divider />

      <Eyebrow>History</Eyebrow>
      <Text style={[type.caption, { color: theme.textFaint }]}>
        Each entry is the profile as it stood before that change. Restoring is itself recorded, so
        you can always roll forward again.
      </Text>

      {versions.data?.versions.length ? (
        versions.data.versions.map((version) => (
          <View
            key={version.id}
            style={{
              gap: space.sm,
              padding: space.md,
              borderRadius: radius.md,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.raised,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[type.caption, { color: theme.textFaint, flex: 1 }]}>
                {relativeTime(version.createdAt)} · replaced by {changedByLabel[version.changedBy]}
              </Text>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                disabled={restore.isPending}
                onPress={() =>
                  Alert.alert("Restore this version?", "The current profile is kept in history.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Restore", onPress: () => restore.mutate(version.id) },
                  ])
                }
              >
                <Text style={[type.caption, { color: theme.accent }]}>Restore</Text>
              </Pressable>
            </View>
            <Text numberOfLines={4} style={[type.caption, { color: theme.textMuted }]}>
              {version.profile ?? "(empty)"}
            </Text>
          </View>
        ))
      ) : (
        <Text style={[type.caption, { color: theme.textFaint }]}>
          No earlier versions — the profile hasn't changed since it was written.
        </Text>
      )}

      <Button title="Done" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}
