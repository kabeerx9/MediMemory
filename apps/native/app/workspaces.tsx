import type { Workspace } from "@caretalk/contracts/health";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import { Link, router, Stack } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { Glyph } from "@/components/kind-icon";
import { Button, EmptyState, ErrorNote, Eyebrow, Field, tap, useTheme } from "@/components/ui";
import { healthApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { relativeTime } from "@/lib/record";
import { radius, space, thread, type, type AppTheme } from "@/theme/tokens";

// One entry per person you're tracking. Each row is a stub of that person's
// thread — the same line the record is drawn on, so the two screens read as
// one continuous idea rather than a list that happens to open a detail view.

export default function Workspaces() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => (await healthApi.listWorkspaces()).workspaces,
  });

  useFocusEffect(
    useCallback(() => {
      void workspaces.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Account-wide export = a full backup. The per-workspace export, scoped to
  // one person, lives inside the workspace where the scope is unambiguous.
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.paper }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
              <Pressable
                accessibilityLabel="Export everything"
                accessibilityRole="button"
                hitSlop={10}
                disabled={exporting}
                onPress={() => {
                  tap();
                  void exportAll();
                }}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={theme.textMuted as string} />
                ) : (
                  <Glyph sf="square.and.arrow.up" md="export-variant" color={theme.text} size={19} />
                )}
              </Pressable>
              <Pressable
                accessibilityLabel="Sign out"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  tap();
                  void authClient.signOut().then(() => router.replace("/login"));
                }}
              >
                <Glyph
                  sf="rectangle.portrait.and.arrow.right"
                  md="logout"
                  color={theme.text}
                  size={19}
                />
              </Pressable>
            </View>
          ),
        }}
      />

      {workspaces.isLoading ? (
        <ActivityIndicator color={theme.textFaint as string} style={{ paddingTop: space.xxl }} />
      ) : workspaces.error ? (
        <ErrorNote
          message={
            workspaces.error instanceof Error ? workspaces.error.message : "Could not load workspaces"
          }
        />
      ) : workspaces.data?.length === 0 && !creating ? (
        <EmptyState
          title="Start a record"
          body="One workspace per person you're tracking — a parent, a pregnancy, your own condition."
          action={<Button title="New workspace" onPress={() => setCreating(true)} icon={{ sf: "plus", md: "plus" }} />}
        />
      ) : (
        <View>
          {workspaces.data?.map((workspace, index) => (
            <Animated.View
              key={workspace.id}
              entering={reduced ? undefined : FadeInDown.delay(index * 40).duration(280)}
            >
              <WorkspaceRow workspace={workspace} theme={theme} />
            </Animated.View>
          ))}
        </View>
      )}

      {creating ? (
        <CreateWorkspace
          onDone={() => {
            setCreating(false);
            void workspaces.refetch();
          }}
        />
      ) : workspaces.data?.length ? (
        <Button
          title="New workspace"
          variant="secondary"
          icon={{ sf: "plus", md: "plus" }}
          onPress={() => setCreating(true)}
        />
      ) : null}
    </ScrollView>
  );
}

function WorkspaceRow({ workspace, theme }: { workspace: Workspace; theme: AppTheme }) {
  // The first line of the profile is the one thing worth surfacing here:
  // "where is this person right now", not when the row was last touched.
  const summary = workspace.profile
    ?.split("\n")
    // Strip markdown the model writes into the profile: leading heading and
    // bullet markers, then inline bold/italic runs. Without the second pass a
    // line like "**Name:** Myself" renders its asterisks verbatim.
    .map((line) =>
      line
        .replace(/^[#*\-\s]+/, "")
        .replace(/[*_]{1,2}/g, "")
        .trim(),
    )
    .find((line) => line.length > 0);

  return (
    <Link
      href={{ pathname: "/workspace/[workspaceId]", params: { workspaceId: workspace.id } }}
      asChild
      onPress={() => tap()}
    >
      <Pressable accessibilityRole="button" style={{ flexDirection: "row" }}>
        {/* The same spine the record is drawn on, in stub form. */}
        <View style={{ width: thread.gutter }}>
          <View
            style={{
              position: "absolute",
              left: thread.rail - 0.5,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: theme.spineFaint,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: thread.rail - thread.node / 2,
              top: 15,
              width: thread.node,
              height: thread.node,
              borderRadius: thread.node / 2,
              backgroundColor: theme.text,
            }}
          />
        </View>

        <View style={{ flex: 1, paddingVertical: space.md, gap: space.xs }}>
          <Text style={[type.title, { color: theme.text }]}>{workspace.name}</Text>
          {summary ? (
            <Text numberOfLines={2} style={[type.callout, { color: theme.textMuted }]}>
              {summary}
            </Text>
          ) : workspace.description ? (
            <Text numberOfLines={2} style={[type.callout, { color: theme.textMuted }]}>
              {workspace.description}
            </Text>
          ) : null}
          <Eyebrow>{relativeTime(workspace.updatedAt)}</Eyebrow>
        </View>
      </Pressable>
    </Link>
  );
}

function CreateWorkspace({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () =>
      healthApi.createWorkspace({ name: name.trim(), description: description.trim() || null }),
    onSuccess: onDone,
    onError: (error) =>
      Alert.alert("Could not create", error instanceof Error ? error.message : "Try again."),
  });

  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.raised,
      }}
    >
      <Field label="Who is this for?" placeholder="Dad" value={name} onChangeText={setName} autoFocus />
      <Field
        label="What are you tracking?"
        placeholder="Hypertension follow-up"
        value={description}
        onChangeText={setDescription}
      />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Cancel" variant="ghost" onPress={onDone} style={{ flex: 1 }} />
        <Button
          title="Create"
          loading={create.isPending}
          disabled={!name.trim()}
          onPress={() => create.mutate()}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
