import type { Memory, MemoryKind, SaveMemoryToolOutput, Workspace, WorkspaceDetail } from "@caretalk/contracts/health";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetch as expoFetch } from "expo/fetch";
import { File, Paths } from "expo-file-system";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";

import { Button, Card, EmptyState, ErrorNote, Field, PressableCard, SectionLabel, useTheme } from "@/components/ui";
import { clientTimeZone, healthApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { CaretalkUIMessage, friendlyChatError, toUIMessages } from "@/lib/chat-types";
import { formatDate, formatGroupDate, memoryKinds, useKindMeta } from "@/lib/kind-meta";
import { type AppTheme, radius, space, type } from "@/lib/theme";

const starterPrompts = [
  "Dad's blood pressure this morning was 138/86.",
  "Started 10mg of amlodipine today, once daily.",
  "What should I ask the cardiologist next visit?",
] as const;

export default function WorkspaceScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"chat" | "memory">("chat");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const settingUpSession = useRef(false);

  const workspaceQuery = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => healthApi.getWorkspace(workspaceId),
    enabled: !!workspaceId,
  });

  const createSessionMutation = useMutation({
    mutationFn: () => healthApi.createSession(workspaceId),
  });

  // Resolve which session is active: the first existing session, else
  // lazily create one — mirrors apps/web/src/features/health/workspace-shell.tsx.
  useEffect(() => {
    if (!workspaceQuery.data || activeSessionId || settingUpSession.current) return;
    const sessions = workspaceQuery.data.chatSessions;
    if (sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
      return;
    }
    settingUpSession.current = true;
    createSessionMutation
      .mutateAsync()
      .then((session) => {
        queryClient.setQueryData<WorkspaceDetail>(["workspace", workspaceId], (prev) =>
          prev ? { ...prev, chatSessions: [session, ...prev.chatSessions] } : prev,
        );
        setActiveSessionId(session.id);
      })
      .catch(() => {
        // surfaced via the chat view's own error state on next render
      })
      .finally(() => {
        settingUpSession.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceQuery.data, activeSessionId, workspaceId]);

  const messagesQuery = useQuery({
    queryKey: ["session-messages", workspaceId, activeSessionId],
    queryFn: () => healthApi.getSessionMessages(workspaceId, activeSessionId as string),
    enabled: !!activeSessionId,
  });

  function refreshWorkspace() {
    void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
  }

  // Just this workspace's active memories as markdown — the point is to paste
  // one person's history into an external chat without dragging in the rest.
  async function exportWorkspace() {
    if (exporting) return;
    setExporting(true);
    try {
      const markdown = await healthApi.exportWorkspaceMarkdown(workspaceId);
      const name = workspaceQuery.data?.workspace.name ?? "workspace";
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
      const target = new File(Paths.cache, `caretalk-${slug}.md`);
      target.write(markdown);
      await Sharing.shareAsync(target.uri, {
        mimeType: "text/markdown",
        dialogTitle: `Export ${name}`,
        UTI: "net.daringfireball.markdown",
      });
    } catch (err) {
      Alert.alert("Export failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.canvas }]}>
      <Stack.Screen
        options={{
          title: workspaceQuery.data?.workspace.name ?? "Workspace",
          // Fallback only: if there's genuinely nothing to pop back to, the
          // default back button never renders, so give an explicit way out
          // rather than trapping the user on this screen.
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <TouchableOpacity
                  accessibilityLabel="Back to workspaces"
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() => router.replace("/workspaces")}
                  style={styles.headerAction}
                >
                  <Ionicons color={theme.primary} name="chevron-back" size={24} />
                </TouchableOpacity>
              ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity
                disabled={exporting}
                onPress={() => void exportWorkspace()}
                hitSlop={10}
                style={styles.headerAction}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={16} color={theme.primary} />
                    <Text style={[type.label as object, styles.headerActionText, { color: theme.primary }]}>
                      Export
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Link
                href={{ pathname: "/workspace/[workspaceId]/import", params: { workspaceId } }}
                asChild
              >
                <TouchableOpacity hitSlop={10} style={styles.headerAction}>
                  <Ionicons name="download-outline" size={16} color={theme.primary} />
                  <Text style={[type.label as object, styles.headerActionText, { color: theme.primary }]}>
                    Import
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          ),
        }}
      />

      <View style={[styles.segmented, { backgroundColor: theme.surfaceSunken }]}>
        <SegmentButton active={view === "chat"} label="Chat" onPress={() => setView("chat")} theme={theme} />
        <SegmentButton active={view === "memory"} label="Memory" onPress={() => setView("memory")} theme={theme} />
      </View>

      {workspaceQuery.isLoading ? (
        <ActivityIndicator style={styles.spinner} color={theme.primary} />
      ) : workspaceQuery.isError || !workspaceQuery.data ? (
        <View style={styles.centered}>
          <ErrorNote
            message={
              workspaceQuery.error instanceof Error
                ? workspaceQuery.error.message
                : "Workspace not found."
            }
          />
        </View>
      ) : view === "chat" ? (
        activeSessionId && messagesQuery.data ? (
          <ChatView
            initialMessages={toUIMessages(messagesQuery.data.messages)}
            key={activeSessionId}
            onMemoryChange={refreshWorkspace}
            sessionId={activeSessionId}
            workspaceId={workspaceId}
          />
        ) : (
          <ActivityIndicator style={styles.spinner} color={theme.primary} />
        )
      ) : (
        <MemoryView
          workspace={workspaceQuery.data.workspace}
          memories={workspaceQuery.data.memories}
          onChanged={refreshWorkspace}
        />
      )}
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: AppTheme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.segmentButton, active && { backgroundColor: theme.surface }]}
      onPress={onPress}
    >
      <Text
        style={[type.label as object, { color: active ? theme.text : theme.textMuted }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Chat view
// ---------------------------------------------------------------------------

function ChatView({
  workspaceId,
  sessionId,
  initialMessages,
  onMemoryChange,
}: {
  workspaceId: string;
  sessionId: string;
  initialMessages: CaretalkUIMessage[];
  onMemoryChange: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const seenToolCalls = useRef(new Set<string>());

  const transport = useMemo(
    () =>
      new DefaultChatTransport<CaretalkUIMessage>({
        api: healthApi.chatUrl(workspaceId, sessionId),
        // React Native's global fetch does not support streaming responses;
        // Expo's fetch does. See https://ai-sdk.dev docs for the Expo pattern.
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        headers: { Cookie: authClient.getCookie() },
        // Per-turn, not per-mount: a phone that travels should date facts by
        // where it is now.
        body: () => ({ timeZone: clientTimeZone() }),
      }),
    [workspaceId, sessionId],
  );

  const { messages, sendMessage, status, error } = useChat<CaretalkUIMessage>({
    id: sessionId,
    messages: initialMessages,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    let didSave = false;
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          (part.type === "tool-save_memory" || part.type === "tool-update_profile") &&
          part.state === "output-available" &&
          !seenToolCalls.current.has(part.toolCallId)
        ) {
          seenToolCalls.current.add(part.toolCallId);
          didSave = true;
        }
      }
    }
    if (didSave) onMemoryChange();
  }, [messages, onMemoryChange]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy]);

  function submit(text?: string) {
    const trimmed = (text ?? draft).trim();
    if (!trimmed || busy) return;
    setDraft("");
    void sendMessage({ text: trimmed });
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex1}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex1}
        contentContainerStyle={styles.chatScrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <View style={[styles.emptyChatIcon, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.primary} />
            </View>
            <Text style={[type.title as object, { color: theme.text, textAlign: "center" }]}>
              Tell Caretalk what happened
            </Text>
            <Text
              style={[
                type.callout as object,
                { color: theme.textMuted, textAlign: "center", maxWidth: 300 },
              ]}
            >
              It will remember measurements, medications, symptoms, and questions for the doctor,
              saved as you talk.
            </Text>
            <View style={styles.starterList}>
              {starterPrompts.map((prompt) => (
                <PressableCard key={prompt} onPress={() => submit(prompt)} style={styles.starterCard}>
                  <Text style={[type.callout as object, { color: theme.text }]}>{prompt}</Text>
                </PressableCard>
              ))}
            </View>
          </View>
        ) : (
          messages
            .filter((message) => message.role !== "system")
            .map((message) => <ChatMessageBubble key={message.id} message={message} theme={theme} />)
        )}

        {status === "submitted" ? <TypingIndicator theme={theme} /> : null}

        {error ? (
          <View style={styles.chatErrorWrap}>
            <ErrorNote message={friendlyChatError(error)} />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.composer,
          {
            borderTopColor: theme.hairline,
            backgroundColor: theme.canvas,
            paddingBottom: space.md + insets.bottom,
          },
        ]}
      >
        <TextInput
          style={[
            styles.composerInput,
            type.body as object,
            { color: theme.text, borderColor: theme.hairline, backgroundColor: theme.surface },
          ]}
          placeholder="Message Caretalk…"
          placeholderTextColor={theme.textFaint}
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          multiline
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: theme.primary, opacity: !draft.trim() || busy ? 0.45 : 1 },
          ]}
          disabled={!draft.trim() || busy}
          onPress={() => submit()}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.onPrimary} />
          ) : (
            <Ionicons name="arrow-up" size={20} color={theme.onPrimary} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function TypingIndicator({ theme }: { theme: AppTheme }) {
  return (
    <View style={styles.typingRow}>
      <View style={[styles.typingDot, { backgroundColor: theme.textFaint }]} />
      <View style={[styles.typingDot, { backgroundColor: theme.textFaint }]} />
      <View style={[styles.typingDot, { backgroundColor: theme.textFaint }]} />
    </View>
  );
}

function ChatMessageBubble({ message, theme }: { message: CaretalkUIMessage; theme: AppTheme }) {
  const isUser = message.role === "user";

  return (
    <View style={isUser ? styles.userRow : styles.assistantColumn}>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          if (!part.text) return null;
          if (isUser) {
            return (
              <View key={index} style={[styles.userBubble, { backgroundColor: theme.chatUserBg }]}>
                <Text style={[type.body as object, { color: theme.chatUserText }]}>{part.text}</Text>
              </View>
            );
          }
          return (
            <View key={index} style={styles.assistantText}>
              <Markdown style={markdownStyles(theme)}>{part.text}</Markdown>
            </View>
          );
        }

        if (part.type === "tool-save_memory" && part.state === "output-available") {
          return <SaveMemoryChip key={part.toolCallId} output={part.output} theme={theme} />;
        }

        if (part.type === "tool-update_profile" && part.state === "output-available") {
          return <UpdateProfileChip key={part.toolCallId} theme={theme} />;
        }

        return null;
      })}
    </View>
  );
}

// The single brightest moment in the app: the visible proof that a fact was
// just committed to permanent memory. Mint/accent is reserved for this.
function SaveMemoryChip({ output, theme }: { output: SaveMemoryToolOutput; theme: AppTheme }) {
  return (
    <View style={[styles.rememberedChip, { backgroundColor: theme.accentSoft, borderColor: theme.accent + "33" }]}>
      <View style={styles.rememberedHeader}>
        <View style={[styles.rememberedBadge, { backgroundColor: theme.accent }]}>
          <Ionicons name="checkmark" size={13} color={theme.onPrimary} />
        </View>
        <Text style={[type.eyebrow as object, styles.rememberedLabel, { color: theme.accentText }]}>
          Remembered
        </Text>
      </View>
      <Text style={[type.callout as object, styles.rememberedContent, { color: theme.text }]}>
        {output.content}
        {output.happenedOn ? ` · ${formatDate(output.happenedOn)}` : ""}
      </Text>
      {output.supersededContent ? (
        <Text style={[type.caption as object, styles.rememberedSuperseded, { color: theme.textMuted }]}>
          Replaces: {output.supersededContent}
        </Text>
      ) : null}
    </View>
  );
}

function UpdateProfileChip({ theme }: { theme: AppTheme }) {
  return (
    <View style={[styles.rememberedChip, { backgroundColor: theme.accentSoft, borderColor: theme.accent + "33" }]}>
      <View style={styles.rememberedHeader}>
        <View style={[styles.rememberedBadge, { backgroundColor: theme.accent }]}>
          <Ionicons name="person-outline" size={12} color={theme.onPrimary} />
        </View>
        <Text style={[type.eyebrow as object, styles.rememberedLabel, { color: theme.accentText }]}>
          Profile updated
        </Text>
      </View>
    </View>
  );
}

function markdownStyles(theme: AppTheme) {
  return {
    body: { color: theme.text, ...(type.body as object) },
    paragraph: { marginTop: 0, marginBottom: space.sm },
    heading1: { color: theme.text, ...(type.heading as object), marginTop: space.sm, marginBottom: space.xs },
    heading2: { color: theme.text, ...(type.bodyStrong as object), marginTop: space.sm, marginBottom: space.xs },
    heading3: { color: theme.text, ...(type.bodyStrong as object), marginTop: space.sm, marginBottom: space.xs },
    strong: { fontWeight: "600" as const },
    bullet_list: { marginVertical: space.xs },
    ordered_list: { marginVertical: space.xs },
    list_item: { marginBottom: space.xs },
    code_inline: {
      backgroundColor: theme.surfaceSunken,
      color: theme.text,
      borderRadius: radius.sm,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    code_block: {
      backgroundColor: theme.surfaceSunken,
      color: theme.text,
      borderRadius: radius.sm,
      padding: space.sm,
    },
    fence: {
      backgroundColor: theme.surfaceSunken,
      color: theme.text,
      borderRadius: radius.sm,
      padding: space.sm,
    },
    link: { color: theme.primary },
  };
}

// ---------------------------------------------------------------------------
// Memory view
// ---------------------------------------------------------------------------

type MemoryGroup = { date: string | null; items: Memory[] };

function groupMemories(memories: Memory[], showHistory: boolean): MemoryGroup[] {
  const visible = memories.filter((memory) => showHistory || !memory.supersededById);
  const map = new Map<string | null, Memory[]>();
  for (const memory of visible) {
    const key = memory.happenedOn;
    const list = map.get(key);
    if (list) list.push(memory);
    else map.set(key, [memory]);
  }
  const dated = Array.from(map.entries()).filter(
    (entry): entry is [string, Memory[]] => entry[0] !== null,
  );
  dated.sort((a, b) => b[0].localeCompare(a[0]));
  const groups: MemoryGroup[] = dated.map(([date, items]) => ({ date, items }));
  const undated = map.get(null);
  if (undated?.length) groups.push({ date: null, items: undated });
  return groups;
}

function MemoryView({
  workspace,
  memories,
  onChanged,
}: {
  workspace: Workspace;
  memories: Memory[];
  onChanged: () => void;
}) {
  const theme = useTheme();
  const [showHistory, setShowHistory] = useState(false);
  const supersededCount = memories.filter((memory) => memory.supersededById).length;
  const groups = useMemo(() => groupMemories(memories, showHistory), [memories, showHistory]);

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.memoryScrollContent}>
      <ProfileCard workspace={workspace} onUpdated={onChanged} />

      <AddMemoryForm workspaceId={workspace.id} onCreated={onChanged} />

      <View style={styles.memoryHeaderRow}>
        <SectionLabel>Memory</SectionLabel>
        {supersededCount > 0 ? (
          <Button
            variant="ghost"
            label={showHistory ? "Hide history" : "Show history"}
            onPress={() => setShowHistory((v) => !v)}
            style={styles.historyToggleButton}
          />
        ) : null}
      </View>

      {groups.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="Nothing saved yet"
          body="Say what happened in the chat and Caretalk will remember it here."
        />
      ) : (
        <View style={styles.timeline}>
          <View style={[styles.timelineSpine, { backgroundColor: theme.border }]} />
          {groups.map((group) => (
            <View key={group.date ?? "undated"} style={styles.memoryGroup}>
              <View style={styles.memoryGroupHeader}>
                <View
                  style={[
                    styles.timelineDot,
                    group.date
                      ? { backgroundColor: theme.primary }
                      : { backgroundColor: "transparent", borderWidth: 2, borderColor: theme.textFaint },
                  ]}
                />
                <Text style={[type.label as object, styles.memoryGroupDate, { color: theme.text }]}>
                  {group.date ? formatGroupDate(group.date) : "Undated"}
                </Text>
              </View>
              <View style={styles.memoryGroupItems}>
                {group.items.map((memory) => (
                  <MemoryRow
                    key={memory.id}
                    memory={memory}
                    workspaceId={workspace.id}
                    onChanged={onChanged}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ProfileCard({ workspace, onUpdated }: { workspace: Workspace; onUpdated: () => void }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(workspace.profile ?? "");
  const mutation = useMutation({
    mutationFn: (profile: string) => healthApi.updateWorkspace(workspace.id, { profile: profile || null }),
    onSuccess: () => {
      setEditing(false);
      onUpdated();
    },
  });

  if (editing) {
    return (
      <Card>
        <SectionLabel>Profile</SectionLabel>
        <Field
          multiline
          autoFocus
          value={draft}
          onChangeText={setDraft}
          placeholder="Diagnosis, current treatment, latest status, next appointment…"
        />
        <View style={styles.formActions}>
          <Button variant="ghost" label="Cancel" onPress={() => setEditing(false)} disabled={mutation.isPending} />
          <Button
            variant="primary"
            label={mutation.isPending ? "Saving…" : "Save"}
            loading={mutation.isPending}
            onPress={() => mutation.mutate(draft)}
          />
        </View>
      </Card>
    );
  }

  return (
    <PressableCard
      onPress={() => {
        setDraft(workspace.profile ?? "");
        setEditing(true);
      }}
    >
      <View style={styles.profileHeaderRow}>
        <SectionLabel>Profile</SectionLabel>
        <Ionicons name="pencil-outline" size={14} color={theme.textFaint} />
      </View>
      {workspace.profile ? (
        <Markdown style={markdownStyles(theme)}>{workspace.profile}</Markdown>
      ) : (
        <Text style={[type.callout as object, { color: theme.textMuted }]}>
          No profile yet. Caretalk will draft one as it learns, or tap to write it yourself.
        </Text>
      )}
    </PressableCard>
  );
}

function AddMemoryForm({ workspaceId, onCreated }: { workspaceId: string; onCreated: () => void }) {
  const theme = useTheme();
  const kindMeta = useKindMeta();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<MemoryKind>("note");
  const [happenedOn, setHappenedOn] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      healthApi.createMemory(workspaceId, {
        content: content.trim(),
        kind,
        happenedOn: happenedOn.trim() || null,
      }),
    onSuccess: () => {
      setContent("");
      setHappenedOn("");
      setKind("note");
      setOpen(false);
      onCreated();
    },
    onError: (err) => {
      Alert.alert("Could not add memory", err instanceof Error ? err.message : "Try again.");
    },
  });

  if (!open) {
    return (
      <PressableCard onPress={() => setOpen(true)} style={styles.addButton}>
        <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
        <Text style={[type.bodyStrong as object, { color: theme.primary }]}>Add memory</Text>
      </PressableCard>
    );
  }

  return (
    <Card>
      <Field
        multiline
        autoFocus
        value={content}
        onChangeText={setContent}
        placeholder="What happened?"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kindPickerRow}>
        {memoryKinds.map((option) => {
          const meta = kindMeta[option];
          const selected = option === kind;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.kindOption,
                { backgroundColor: selected ? meta.bg : theme.surfaceSunken },
              ]}
              onPress={() => setKind(option)}
            >
              <Text style={[type.caption as object, { color: selected ? meta.fg : theme.textMuted }]}>
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Field
        value={happenedOn}
        onChangeText={setHappenedOn}
        placeholder="YYYY-MM-DD"
        hint="Optional — YYYY-MM-DD"
      />
      <View style={styles.formActions}>
        <Button variant="ghost" label="Cancel" onPress={() => setOpen(false)} disabled={mutation.isPending} />
      </View>
      <Button
        variant="primary"
        full
        label="Save memory"
        loading={mutation.isPending}
        disabled={!content.trim()}
        onPress={() => mutation.mutate()}
      />
    </Card>
  );
}

function MemoryRow({
  memory,
  workspaceId,
  onChanged,
}: {
  memory: Memory;
  workspaceId: string;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const kindMeta = useKindMeta();
  const superseded = Boolean(memory.supersededById);
  const meta = kindMeta[memory.kind] ?? kindMeta.note;

  const deleteMutation = useMutation({
    mutationFn: () => healthApi.deleteMemory(workspaceId, memory.id),
    onSuccess: onChanged,
    onError: (err) => {
      Alert.alert("Could not delete memory", err instanceof Error ? err.message : "Try again.");
    },
  });

  function confirmDelete() {
    Alert.alert("Delete memory", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  return (
    <TouchableOpacity
      style={[styles.memoryRow, deleteMutation.isPending && { opacity: 0.5 }]}
      onLongPress={confirmDelete}
      delayLongPress={350}
    >
      <View style={[styles.memoryRowIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={15} color={meta.fg} />
      </View>
      <View style={styles.memoryRowBody}>
        <Text
          style={[
            type.body as object,
            { color: theme.text },
            superseded && styles.strikethrough,
          ]}
        >
          {memory.content}
        </Text>
        <View style={styles.memoryRowMetaRow}>
          <Text style={[type.caption as object, { color: meta.fg }]}>
            {meta.label} · {formatDate(memory.happenedOn)}
          </Text>
          {superseded ? (
            <Text style={[type.caption as object, { color: theme.textFaint }]}> · Replaced</Text>
          ) : null}
        </View>
      </View>
      {/* Quiet on purpose: a red icon repeated down every row would make
          "delete" the loudest thing on a screen whose job is to be calm. The
          confirm dialog is where the destructive styling belongs. */}
      <TouchableOpacity
        accessibilityLabel="Delete memory"
        accessibilityRole="button"
        hitSlop={12}
        onPress={confirmDelete}
      >
        <Ionicons color={theme.textFaint} name="ellipsis-horizontal" size={16} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex1: { flex: 1 },
  spinner: { marginTop: 32 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  headerActions: { flexDirection: "row", alignItems: "center", gap: space.lg },
  headerAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerActionText: { fontWeight: "600" },

  segmented: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: space.xs,
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: space.sm,
    alignItems: "center",
    borderRadius: radius.pill,
  },

  // Chat
  chatScrollContent: { padding: space.lg, gap: space.md, flexGrow: 1 },
  emptyChat: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.sm },
  emptyChatIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  starterList: { width: "100%", gap: space.sm, marginTop: space.sm },
  starterCard: { padding: space.md },
  userRow: { alignItems: "flex-end" },
  assistantColumn: { alignItems: "flex-start", gap: space.sm },
  userBubble: {
    maxWidth: "85%",
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  assistantText: { width: "100%" },
  chatErrorWrap: { width: "100%" },
  typingRow: { flexDirection: "row", gap: 4, paddingVertical: space.xs, paddingLeft: 2 },
  typingDot: { width: 6, height: 6, borderRadius: radius.pill },

  rememberedChip: {
    alignSelf: "flex-start",
    maxWidth: "92%",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 4,
  },
  rememberedHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rememberedBadge: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberedLabel: { textTransform: "uppercase" },
  rememberedContent: {},
  rememberedSuperseded: {},

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    borderTopWidth: 1,
    paddingTop: space.md,
    paddingHorizontal: space.md,
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },

  // Memory
  memoryScrollContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  profileHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  formActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: space.md },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  kindPickerRow: { flexGrow: 0 },
  kindOption: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, marginRight: space.sm },
  memoryHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyToggleButton: { minHeight: 0, paddingHorizontal: space.sm, paddingVertical: space.xs },

  timeline: { position: "relative" },
  timelineSpine: { position: "absolute", top: 4, bottom: 4, left: 11, width: 1 },
  memoryGroup: { marginBottom: space.md },
  memoryGroupHeader: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.sm },
  timelineDot: { width: 8, height: 8, borderRadius: radius.pill },
  memoryGroupDate: {},
  memoryGroupItems: { paddingLeft: 24, gap: space.xs },
  memoryRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  memoryRowIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  memoryRowBody: { flex: 1, gap: 2 },
  memoryRowMetaRow: { flexDirection: "row", alignItems: "center" },
  strikethrough: { textDecorationLine: "line-through", opacity: 0.55 },
});
