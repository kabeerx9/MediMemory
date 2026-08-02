import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { Sparkline } from "@/components/sparkline";
import { Eyebrow, EmptyState, Reading, useTheme } from "@/components/ui";
import {
  buildSeries,
  formatDay,
  formatReading,
  humanizeMetric,
  type Series,
} from "@/lib/record";
import { useWorkspace } from "@/lib/use-workspace";
import { radius, space, type, type AppTheme } from "@/theme/tokens";

// TRENDS — the payoff of tracking something for years.
//
// Reads the optional structured shadow the model fills alongside each fact
// (metric / value / unit). Prose stays authoritative in the record; a reading
// the model didn't tag simply doesn't chart, which is the right failure — it's
// invisible here, never lost there.

export default function TrendsTab() {
  const { memories } = useWorkspace();
  const theme = useTheme();
  const reduced = useReducedMotion();
  const series = useMemo(() => buildSeries(memories), [memories]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.paper }}
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl * 3 }}
    >
      {series.length === 0 ? (
        <EmptyState
          title="No series yet"
          body="Once the same measurement is recorded twice — a lab value, a weight, a blood pressure — its shape over time appears here."
        />
      ) : (
        series.map((item, index) => (
          <Animated.View
            key={item.metric}
            entering={reduced ? undefined : FadeInDown.delay(index * 40).duration(280)}
          >
            <TrendCard series={item} theme={theme} />
          </Animated.View>
        ))
      )}
    </ScrollView>
  );
}

function TrendCard({ series, theme }: { series: Series; theme: AppTheme }) {
  const latest = series.points[series.points.length - 1];
  const first = series.points[0];
  if (!latest || !first) return null;

  const delta = latest.value - first.value;
  const direction = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";

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
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: space.sm }}>
          <Eyebrow>{humanizeMetric(series.metric)}</Eyebrow>
          <Reading value={formatReading(latest)} unit={series.unit} />
        </View>
        <Sparkline points={series.points} theme={theme} width={112} height={40} />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: theme.textFaint }]}>
          {series.points.length} readings from {formatDay(first.date)}
        </Text>
        <Text style={[type.caption, { color: theme.textMuted }]}>
          {direction} {formatReading(first)} → {formatReading(latest)}
        </Text>
      </View>
    </View>
  );
}
