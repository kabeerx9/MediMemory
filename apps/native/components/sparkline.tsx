import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { AppTheme } from "@/theme/tokens";

// A reading's shape over time, small enough to sit inline on the thread.
//
// Drawn as one path plus a single dot on the latest point — no axes, no grid,
// no fill. At this size an axis is noise; the number beside it carries the
// value, and the line only has to answer "which way is this going".
//
// Paired readings (blood pressure) draw two lines on a SHARED scale, because
// systolic and diastolic are only meaningful relative to each other.

export type SparkPoint = { value: number; valueSecondary: number | null };

export function Sparkline({
  points,
  theme,
  width = 96,
  height = 26,
  accent,
}: {
  points: SparkPoint[];
  theme: AppTheme;
  width?: number;
  height?: number;
  /** Colour of the primary trace. Defaults to ink so it stays quiet. */
  accent?: string;
}) {
  if (points.length < 2) return null;

  const stroke = accent ?? theme.text;
  const values = points.flatMap((point) =>
    point.valueSecondary !== null ? [point.value, point.valueSecondary] : [point.value],
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero — draw it down the middle instead.
  const span = max - min || 1;
  // Inset by the dot radius so the trace never clips at the edges.
  const pad = 2.5;

  const project = (pick: (point: SparkPoint) => number | null) => {
    const coords: string[] = [];
    points.forEach((point, index) => {
      const value = pick(point);
      if (value === null) return;
      const x = pad + (index / (points.length - 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / span) * (height - pad * 2);
      coords.push(`${coords.length === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return coords.join(" ");
  };

  const last = points[points.length - 1];
  const lastX = width - pad;
  const lastY = last ? height - pad - ((last.value - min) / span) * (height - pad * 2) : 0;
  const paired = points.some((point) => point.valueSecondary !== null);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {paired ? (
          <Path
            d={project((point) => point.valueSecondary)}
            stroke={theme.spine}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
        <Path
          d={project((point) => point.value)}
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
      </Svg>
    </View>
  );
}
