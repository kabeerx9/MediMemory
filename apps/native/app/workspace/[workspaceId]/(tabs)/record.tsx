import { useMutation } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { Glyph, KindIcon } from "@/components/kind-icon";
import { Sparkline } from "@/components/sparkline";
import { READING_NODE_CENTER, ThreadFork, ThreadRow } from "@/components/thread";
import { Eyebrow, EmptyState, Reading, tap, useTheme } from "@/components/ui";
import { healthApi } from "@/lib/api";
import {
  buildSeries,
  buildThread,
  formatDay,
  humanizeMetric,
  type ThreadEntry,
} from "@/lib/record";
import { useWorkspace } from "@/lib/use-workspace";
import { radius, space, thread, type, type AppTheme } from "@/theme/tokens";

// THE RECORD — one continuous thread through the health journey.
//
// Every active fact is a node; the facts it replaced fork off it. Scrolling
// this is meant to feel like reading down a single line rather than paging
// through a stack of cards, which is why nothing here is boxed.

export default function RecordTab() {
  const { workspaceId, memories, refresh } = useWorkspace();
  const theme = useTheme();
  const [showHistory, setShowHistory] = useState(false);
  const reduced = useReducedMotion();

  const sections = useMemo(() => buildThread(memories, showHistory), [memories, showHistory]);
  const supersededCount = useMemo(
    () => memories.filter((memory) => memory.supersededById).length,
    [memories],
  );
  const series = useMemo(() => buildSeries(memories), [memories]);
  const seriesByMetric = useMemo(
    () => new Map(series.map((item) => [item.metric, item])),
    [series],
  );

  // Flat index across sections so the entering stagger runs down the whole
  // thread rather than restarting at each month.
  let rowIndex = 0;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.paper }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 3 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingBottom: space.lg }}>
        <View style={{ flex: 1 }}>
          <Eyebrow>
            {memories.length - supersededCount} active
            {supersededCount > 0 ? ` · ${supersededCount} superseded` : ""}
          </Eyebrow>
        </View>
        {supersededCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tap();
              setShowHistory((value) => !value);
            }}
            hitSlop={8}
          >
            <Text style={[type.caption, { color: theme.accent }]}>
              {showHistory ? "Hide history" : "Show history"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {sections.length === 0 ? (
        <EmptyState
          title="Nothing on the record yet"
          body="Tell Caretalk what happened in the Chat tab and every durable fact lands here, dated and in order."
        />
      ) : (
        sections.map((section, sectionIndex) => (
          <View key={`${section.month}-${sectionIndex}`}>
            <ThreadRow theme={theme} node="date" first={sectionIndex === 0}>
              <View style={{ paddingBottom: space.sm, paddingTop: sectionIndex === 0 ? 0 : space.sm }}>
                <Eyebrow color={theme.textMuted}>{section.month}</Eyebrow>
              </View>
            </ThreadRow>

            {section.entries.map((entry, entryIndex) => {
              const index = rowIndex++;
              // Measurement rows lead with a 32pt figure, so their node has to
              // drop to match or it sits above the number.
              const leadsWithReading = entry.memory.value !== null;
              const isLast =
                sectionIndex === sections.length - 1 && entryIndex === section.entries.length - 1;
              return (
                <Animated.View
                  key={entry.memory.id}
                  entering={
                    reduced ? undefined : FadeInDown.delay(Math.min(index, 12) * 22).duration(260)
                  }
                >
                  <ThreadRow
                    theme={theme}
                    last={isLast}
                    nodeCenter={leadsWithReading ? READING_NODE_CENTER : undefined}
                  >
                    <FactRow
                      entry={entry}
                      theme={theme}
                      workspaceId={workspaceId}
                      onChanged={refresh}
                      spark={
                        entry.memory.metric ? seriesByMetric.get(entry.memory.metric) : undefined
                      }
                    />
                  </ThreadRow>
                </Animated.View>
              );
            })}
          </View>
        ))
      )}

      <AddFact workspaceId={workspaceId} />
    </ScrollView>
  );
}

function FactRow({
  entry,
  theme,
  workspaceId,
  onChanged,
  spark,
}: {
  entry: ThreadEntry;
  theme: AppTheme;
  workspaceId: string;
  onChanged: () => void;
  spark?: { points: Array<{ value: number; valueSecondary: number | null }> };
}) {
  const { memory, superseded } = entry;
  const isMeasurement = memory.value !== null;
  const reading =
    memory.valueSecondary !== null
      ? `${memory.value}/${memory.valueSecondary}`
      : String(memory.value);

  // When the figure is already the headline, a caption that just restates it
  // ("138/86 mmHg" above "Blood pressure 138/86 mmHg") is noise. Fall back to
  // the metric's name in that case, but keep the prose whenever it carries
  // anything extra — "after breakfast", "left arm" — since `content` is the
  // authoritative record and the structured fields are only its shadow.
  const restatesReading = isMeasurement && memory.content.includes(reading) && memory.content.length <= 44;
  const caption = restatesReading && memory.metric ? humanizeMetric(memory.metric) : memory.content;

  const remove = useMutation({
    mutationFn: () => healthApi.deleteMemory(workspaceId, memory.id),
    onSuccess: onChanged,
    onError: (error) =>
      Alert.alert("Could not delete", error instanceof Error ? error.message : "Try again."),
  });

  function confirmDelete() {
    Alert.alert("Delete this fact?", memory.content, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
    ]);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={memory.content}
      onLongPress={() => {
        tap();
        confirmDelete();
      }}
      style={{ opacity: remove.isPending ? 0.4 : 1, gap: space.xs }}
    >
      {/* A measurement leads with its value — the number is the headline, the
          sentence is the caption. Non-numeric facts lead with the sentence. */}
      {isMeasurement ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Reading value={reading} unit={memory.unit} />
          {spark && spark.points.length >= 2 ? (
            <Sparkline points={spark.points} theme={theme} width={72} height={22} />
          ) : null}
        </View>
      ) : null}

      <Text
        selectable
        style={[
          isMeasurement ? type.callout : type.body,
          { color: isMeasurement ? theme.textMuted : theme.text },
        ]}
      >
        {caption}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <KindIcon kind={memory.kind} color={theme.textFaint} size={11} />
        <Text style={[type.caption, { color: theme.textFaint }]}>{formatDay(memory.happenedOn)}</Text>
      </View>

      {superseded.map((old) => (
        <ThreadFork key={old.id} theme={theme}>
          <Text
            style={[
              type.caption,
              { color: theme.textFaint, textDecorationLine: "line-through" },
            ]}
          >
            {old.content}
          </Text>
        </ThreadFork>
      ))}
    </Pressable>
  );
}

/** Bulk entry: a doctor's note or a photographed report, read once. */
function AddFact({ workspaceId }: { workspaceId: string }) {
  const theme = useTheme();

  return (
    <Link
      href={{ pathname: "/workspace/[workspaceId]/import", params: { workspaceId } }}
      asChild
      onPress={() => tap()}
    >
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          marginTop: space.lg,
          marginLeft: thread.gutter,
          paddingVertical: space.md,
          paddingHorizontal: space.md,
          borderRadius: radius.md,
          borderCurve: "continuous",
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: theme.border,
          backgroundColor: pressed ? theme.sunken : "transparent",
        })}
      >
        <Glyph sf="doc.text" md="file-document-outline" color={theme.textMuted} size={15} />
        <Text style={[type.callout, { color: theme.textMuted }]}>Import a report</Text>
      </Pressable>
    </Link>
  );
}
