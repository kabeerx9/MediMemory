import type { ReactNode } from "react";
import { View } from "react-native";

import { space, thread, type AppTheme } from "@/theme/tokens";

// THE THREAD — the app's signature.
//
// One continuous graphite line runs down the record. Every fact is a node on
// it, dates interrupt it as tracked-out labels, and a superseded fact branches
// off it instead of disappearing. That last part is the whole point: the data
// model is append-only with supersession, and this is that model drawn.
//
// Continuity is the thing to protect. The line is not a per-card decoration —
// each row paints a full-height segment at the same x, so stacked rows read as
// one unbroken line. `first` and `last` clip the segment to the node so the
// thread starts and ends at a fact rather than floating.

export function ThreadRow({
  theme,
  children,
  first,
  last,
  node = "fact",
  nodeCenter = NODE_CENTER,
}: {
  theme: AppTheme;
  children: ReactNode;
  first?: boolean;
  last?: boolean;
  /** `fact` = filled node · `date` = no node, line continues faint · `open` = hollow */
  node?: "fact" | "date" | "open";
  /**
   * Vertical centre of the node, in points from the top of the row.
   *
   * Defaults to the centre of a body line. A row that leads with a large
   * figure (a measurement) has to pass its own, or the dot floats above the
   * number instead of beside it — the fixed value only ever suits one type
   * size, and this thread deliberately mixes two.
   */
  nodeCenter?: number;
}) {
  const isDate = node === "date";

  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ width: thread.gutter }}>
        <View
          style={{
            position: "absolute",
            left: thread.rail - 0.5,
            width: 1,
            backgroundColor: isDate ? theme.spineFaint : theme.spine,
            // Clip to the node so the line begins and ends on a fact.
            top: first ? nodeCenter : 0,
            bottom: last ? undefined : 0,
            height: last ? nodeCenter : undefined,
          }}
        />
        {!isDate ? (
          <View
            style={{
              position: "absolute",
              left: thread.rail - thread.node / 2,
              top: nodeCenter - thread.node / 2,
              width: thread.node,
              height: thread.node,
              borderRadius: thread.node / 2,
              backgroundColor: node === "open" ? theme.paper : theme.text,
              borderWidth: node === "open" ? 1.5 : 0,
              borderColor: theme.spine,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, paddingBottom: space.lg }}>{children}</View>
    </View>
  );
}

// Default node centre: the middle of a body-text line, so the dot sits beside
// the first line rather than drifting down as content grows.
const NODE_CENTER = 11;
/** Node centre for a row that leads with a `Reading` (32pt line). */
export const READING_NODE_CENTER = 16;

/**
 * A superseded fact, drawn as a branch off its replacement's node.
 *
 * The elbow is two borders on an empty view — cheaper than an SVG and it
 * inherits the spine colour exactly, so the branch reads as the same line
 * turning rather than as a separate rule.
 */
export function ThreadFork({
  theme,
  children,
}: {
  theme: AppTheme;
  children: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", paddingTop: space.sm }}>
      <View
        style={{
          width: thread.fork,
          height: 12,
          marginLeft: 2,
          borderLeftWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.spineFaint,
          borderBottomLeftRadius: 6,
        }}
      />
      <View style={{ flex: 1, paddingLeft: space.sm, marginTop: 2 }}>{children}</View>
    </View>
  );
}
