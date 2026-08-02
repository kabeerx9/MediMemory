import { useChat } from "@ai-sdk/react";
import type { SaveMemoryToolOutput } from "@caretalk/contracts/health";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { Link } from "expo-router";
import { fetch as expoFetch } from "expo/fetch";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";

import { Glyph, KindIcon } from "@/components/kind-icon";
import { ErrorNote, notifySaved, Reading, tap, useTheme } from "@/components/ui";
import { clientTimeZone, healthApi, SERVER_URL } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { type CaretalkUIMessage, friendlyChatError, toUIMessages } from "@/lib/chat-types";
import { formatDay } from "@/lib/record";
import { useWorkspace } from "@/lib/use-workspace";
import { radius, space, type, type AppTheme } from "@/theme/tokens";

// Standard iOS chrome heights. Derived by hand rather than from
// @react-navigation/elements' useHeaderHeight: that package is a transitive
// dependency, so under pnpm's strict node_modules Metro cannot resolve it even
// though TypeScript can — it type-checks and then fails to bundle.
const TAB_BAR_HEIGHT = 49;
const NAV_BAR_HEIGHT = 44;

const starterPrompts = [
  "Dad's blood pressure this morning was 138/86.",
  "Started 10mg of amlodipine today, once daily.",
  "What should I ask the cardiologist next visit?",
] as const;

export default function ChatTab() {
  const { workspaceId, workspace, sessions, isLoading, error, refresh } = useWorkspace();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const settingUpSession = useRef(false);

  const createSession = useMutation({ mutationFn: () => healthApi.createSession(workspaceId) });

  // Resolve the active session: the most recent one, else lazily create one.
  useEffect(() => {
    if (isLoading || activeSessionId || settingUpSession.current) return;
    if (sessions.length > 0) {
      setActiveSessionId(sessions[0]!.id);
      return;
    }
    if (!workspace) return;
    settingUpSession.current = true;
    createSession
      .mutateAsync()
      .then((session) => {
        setActiveSessionId(session.id);
        void refresh();
      })
      .catch(() => {
        // Kept, not swallowed: without a session there is nothing to type into,
        // so there is no later send to surface the failure. The mutation's own
        // error state drives the message below.
      })
      .finally(() => {
        settingUpSession.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, sessions, activeSessionId, workspace]);

  const messagesQuery = useQuery({
    queryKey: ["session-messages", workspaceId, activeSessionId],
    queryFn: () => healthApi.getSessionMessages(workspaceId, activeSessionId as string),
    enabled: !!activeSessionId,
  });

  // Any of the three can fail, and every one of them leaves the screen with
  // nothing to render. Spinning forever tells you nothing; the common cause is
  // simply that the API isn't running.
  const failure = error ?? createSession.error ?? messagesQuery.error;

  if (failure) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          gap: space.md,
          padding: space.lg,
          paddingTop: insets.top + NAV_BAR_HEIGHT,
          backgroundColor: theme.paper,
        }}
      >
        <ErrorNote
          message={failure instanceof Error ? failure.message : "Could not reach Caretalk."}
        />
        <Text style={[type.caption, { color: theme.textFaint }]}>
          The app talks to {SERVER_URL}. If that isn&apos;t running, start it with{" "}
          <Text style={{ fontWeight: "600" }}>pnpm dev</Text> from the repo root.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            tap();
            createSession.reset();
            void refresh();
            void messagesQuery.refetch();
          }}
          style={{ paddingVertical: space.sm }}
        >
          <Text style={[type.bodyStrong, { color: theme.accent }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      {activeSessionId && messagesQuery.data ? (
        <Conversation
          key={activeSessionId}
          workspaceId={workspaceId}
          sessionId={activeSessionId}
          initialMessages={toUIMessages(messagesQuery.data.messages)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
          }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.textFaint} />
        </View>
      )}
    </View>
  );
}

function Conversation({
  workspaceId,
  sessionId,
  initialMessages,
  onSaved,
}: {
  workspaceId: string;
  sessionId: string;
  initialMessages: CaretalkUIMessage[];
  onSaved: () => void;
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
        // React Native's global fetch can't stream responses; Expo's can.
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

  // A save is the product's thesis firing. It gets the one haptic in the app
  // that isn't a plain tap, so you feel a fact land without watching for it.
  useEffect(() => {
    let saved = false;
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          (part.type === "tool-save_memory" || part.type === "tool-update_profile") &&
          part.state === "output-available" &&
          !seenToolCalls.current.has(part.toolCallId)
        ) {
          seenToolCalls.current.add(part.toolCallId);
          saved = true;
        }
      }
    }
    if (saved) {
      notifySaved();
      onSaved();
    }
  }, [messages, onSaved]);

  function submit(text?: string) {
    const trimmed = (text ?? draft).trim();
    if (!trimmed || busy) return;
    tap();
    setDraft("");
    void sendMessage({ text: trimmed });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.bottom + 52}
    >
      <ScrollView
        ref={scrollRef}
        // Explicit top inset rather than contentInsetAdjustmentBehavior: the
        // ScrollView sits inside a KeyboardAvoidingView, which breaks automatic
        // adjustment, and the opening line ends up hidden behind the header.
        contentContainerStyle={{
          padding: space.lg,
          paddingTop: insets.top + NAV_BAR_HEIGHT + space.lg,
          gap: space.lg,
          paddingBottom: space.xxl,
        }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardDismissMode="interactive"
      >
        {messages.length === 0 ? (
          <Opening onPick={submit} />
        ) : (
          messages
            .filter((message) => message.role !== "system")
            .map((message) => <MessageView key={message.id} message={message} theme={theme} />)
        )}

        {status === "submitted" ? <Thinking theme={theme} /> : null}
        {error ? <ErrorNote message={friendlyChatError(error)} /> : null}
      </ScrollView>

      <Composer
        busy={busy}
        draft={draft}
        onChange={setDraft}
        onSubmit={() => submit()}
        workspaceId={workspaceId}
        bottomInset={insets.bottom + TAB_BAR_HEIGHT}
      />
    </KeyboardAvoidingView>
  );
}

function Opening({ onPick }: { onPick: (text: string) => void }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(400)} style={{ gap: space.lg, paddingTop: space.xl }}>
      <Text style={[type.display, { color: theme.text }]}>Say what happened.</Text>
      <Text style={[type.body, { color: theme.textMuted, maxWidth: 320 }]}>
        Measurements, medication changes, symptoms, questions for the doctor. Caretalk keeps them
        dated and in order, and shows you every one it saves.
      </Text>
      <View style={{ gap: space.sm, paddingTop: space.sm }}>
        {starterPrompts.map((prompt) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            onPress={() => onPick(prompt)}
            style={({ pressed }) => ({
              padding: space.md,
              borderRadius: radius.md,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: pressed ? theme.sunken : theme.raised,
            })}
          >
            <Text style={[type.callout, { color: theme.textMuted }]}>{prompt}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

function MessageView({ message, theme }: { message: CaretalkUIMessage; theme: AppTheme }) {
  const isUser = message.role === "user";

  return (
    <View style={{ gap: space.md, alignItems: isUser ? "flex-end" : "stretch" }}>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          if (!part.text) return null;
          return isUser ? (
            <View
              key={index}
              style={{
                maxWidth: "88%",
                backgroundColor: theme.sunken,
                paddingHorizontal: space.md,
                paddingVertical: space.sm + 2,
                borderRadius: radius.lg,
                borderCurve: "continuous",
              }}
            >
              <Text selectable style={[type.body, { color: theme.text }]}>
                {part.text}
              </Text>
            </View>
          ) : (
            <Markdown key={index} style={markdownStyles(theme)}>
              {part.text}
            </Markdown>
          );
        }

        if (part.type === "tool-save_memory" && part.state === "output-available") {
          return <SavedChip key={part.toolCallId} output={part.output} />;
        }

        if (part.type === "tool-update_profile" && part.state === "output-available") {
          return <ProfileChip key={part.toolCallId} />;
        }

        return null;
      })}
    </View>
  );
}

/**
 * The signature moment: a fact entering permanent memory.
 *
 * This is the only place accent colour appears in the conversation, so teal
 * reads as one thing — "this is now remembered". A superseded fact shows what
 * it replaced inline, because that's the interesting half of the write.
 */
function SavedChip({ output }: { output: SaveMemoryToolOutput }) {
  const theme = useTheme();
  const reduced = useReducedMotion();

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.springify().damping(18).mass(0.5)}
      style={{
        flexDirection: "row",
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: theme.accent,
        backgroundColor: theme.accentLift,
      }}
    >
      <View style={{ paddingTop: 2 }}>
        <KindIcon kind={output.kind} color={theme.accent} size={15} />
      </View>
      <View style={{ flex: 1, gap: space.xs }}>
        {output.value !== null ? (
          <Reading
            value={
              output.valueSecondary !== null
                ? `${output.value}/${output.valueSecondary}`
                : String(output.value)
            }
            unit={output.unit}
            size="sm"
          />
        ) : null}
        <Text selectable style={[type.callout, { color: theme.text }]}>
          {output.content}
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <Text style={[type.caption, { color: theme.accent }]}>
            Saved · {formatDay(output.happenedOn)}
          </Text>
        </View>
        {output.supersededContent ? (
          <Text style={[type.caption, { color: theme.textFaint }]}>
            replaces {output.supersededContent}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function ProfileChip() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(240)}
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
    >
      <Glyph sf="person.text.rectangle" md="card-account-details-outline" color={theme.textFaint} size={14} />
      <Text style={[type.caption, { color: theme.textFaint }]}>Profile updated</Text>
    </Animated.View>
  );
}

function Thinking({ theme }: { theme: AppTheme }) {
  return (
    <Animated.View entering={FadeIn} style={{ flexDirection: "row", gap: 5, paddingVertical: space.sm }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.textFaint }}
        />
      ))}
    </Animated.View>
  );
}

function Composer({
  draft,
  onChange,
  onSubmit,
  busy,
  workspaceId,
  bottomInset,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  workspaceId: string;
  bottomInset: number;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingTop: space.md,
        // Clear the native tab bar — the composer is a sibling of the tab
        // navigator's content, so nothing insets it automatically and it
        // renders underneath the bar.
        paddingBottom: space.md + bottomInset,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        backgroundColor: theme.paper,
      }}
    >
      <Link href={{ pathname: "/workspace/[workspaceId]/import", params: { workspaceId } }} asChild>
        <Pressable
          accessibilityLabel="Import a report"
          accessibilityRole="button"
          hitSlop={8}
          style={{ height: 42, justifyContent: "center", paddingRight: 2 }}
        >
          <Glyph sf="paperclip" md="paperclip" color={theme.textMuted} size={20} />
        </Pressable>
      </Link>

      <TextInput
        style={[
          type.body,
          {
            flex: 1,
            color: theme.text,
            backgroundColor: theme.raised,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: radius.lg,
            borderCurve: "continuous",
            paddingHorizontal: space.md,
            paddingTop: 10,
            paddingBottom: 10,
            maxHeight: 132,
          },
        ]}
        placeholder="What happened?"
        placeholderTextColor={theme.textFaint}
        value={draft}
        onChangeText={onChange}
        editable={!busy}
        multiline
      />

      <Pressable
        accessibilityLabel="Send"
        accessibilityRole="button"
        disabled={!draft.trim() || busy}
        onPress={onSubmit}
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.accent,
          opacity: !draft.trim() || busy ? 0.4 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={theme.onAccent as string} />
        ) : (
          <Glyph sf="arrow.up" md="arrow-up" color={theme.onAccent} size={18} />
        )}
      </Pressable>
    </View>
  );
}

function markdownStyles(theme: AppTheme) {
  return {
    body: { ...type.body, color: theme.text },
    paragraph: { marginTop: 0, marginBottom: space.sm },
    strong: { fontWeight: "600" as const, color: theme.text },
    bullet_list: { marginBottom: space.sm },
    ordered_list: { marginBottom: space.sm },
    list_item: { marginBottom: space.xs },
    code_inline: {
      backgroundColor: theme.sunken,
      color: theme.text,
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    link: { color: theme.accent },
    heading1: { ...type.title, color: theme.text, marginBottom: space.sm },
    heading2: { ...type.heading, color: theme.text, marginBottom: space.xs },
    heading3: { ...type.bodyStrong, color: theme.text, marginBottom: space.xs },
  };
}
