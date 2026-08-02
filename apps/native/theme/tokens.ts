import type { TextStyle } from "react-native";

// Design tokens — "The Thread".
//
// The record is one continuous line through time. Facts hang off a spine; a
// superseded fact forks off it rather than vanishing. That's the product's
// thesis (append-only, history never lost) used as the visual identity, so the
// tokens here exist to serve one drawing: a graphite hairline, ink on it, and
// exactly one colour held in reserve.
//
// GROUND is chart paper, not stationery — cool off-white with a faint
// green-grey cast, the colour of the paper a lab result prints on. Warm cream
// would push this toward generic editorial; the subject's own artifacts are
// cooler than that.
//
// TEAL is the brand, matching the web client (packages/ui/src/styles/globals.css
// — the CSS vars are named "violet" but hold teal values; a rename artifact).
// It is spent on ONE thing: the moment a fact enters memory. Kind, dates, and
// structure are all rendered in ink, so the single colour always means "saved".

const palette = {
  // Chart paper
  paper: "#f6f7f4",
  paperRaised: "#ffffff",
  paperSunken: "#eeefea",

  // Ink — near-black, cool undertone
  ink: "#15191a",
  inkMuted: "#5f6663",
  inkFaint: "#8d938f",

  // The spine
  graphite: "#c3c8c2",
  graphiteFaint: "#dcdfd9",

  // Reserved accent
  teal: "#0f766e",
  tealBright: "#14b8a6",
  tealLift: "rgba(15, 118, 110, 0.09)",

  // Night
  night: "#101211",
  nightRaised: "#191c1a",
  nightSunken: "#0a0c0b",
  nightInk: "#f2f4f1",
  nightInkMuted: "#9aa19c",
  nightInkFaint: "#6b726d",
  nightGraphite: "#333733",
  nightGraphiteFaint: "#242724",
  nightTealLift: "rgba(20, 184, 166, 0.13)",

  danger: "#c8453f",
  dangerNight: "#ff6b64",
};

export type AppTheme = {
  // React Navigation's Theme requires these six names.
  background: string;
  border: string;
  card: string;
  notification: string;
  primary: string;
  text: string;

  // Ground
  paper: string;
  raised: string;
  sunken: string;

  // Ink
  textMuted: string;
  textFaint: string;
  onAccent: string;

  // The spine
  spine: string;
  spineFaint: string;

  // Reserved
  accent: string;
  accentLift: string;

  danger: string;
  overlay: string;
  isDark: boolean;
};

export const lightTheme: AppTheme = {
  background: palette.paper,
  border: palette.graphiteFaint,
  card: palette.paperRaised,
  notification: palette.danger,
  primary: palette.teal,
  text: palette.ink,

  paper: palette.paper,
  raised: palette.paperRaised,
  sunken: palette.paperSunken,

  textMuted: palette.inkMuted,
  textFaint: palette.inkFaint,
  onAccent: "#ffffff",

  spine: palette.graphite,
  spineFaint: palette.graphiteFaint,

  accent: palette.teal,
  accentLift: palette.tealLift,

  danger: palette.danger,
  overlay: "rgba(21, 25, 26, 0.4)",
  isDark: false,
};

export const darkTheme: AppTheme = {
  background: palette.night,
  border: palette.nightGraphiteFaint,
  card: palette.nightRaised,
  notification: palette.dangerNight,
  primary: palette.tealBright,
  text: palette.nightInk,

  paper: palette.night,
  raised: palette.nightRaised,
  sunken: palette.nightSunken,

  textMuted: palette.nightInkMuted,
  textFaint: palette.nightInkFaint,
  onAccent: "#04211e",

  spine: palette.nightGraphite,
  spineFaint: palette.nightGraphiteFaint,

  accent: palette.tealBright,
  accentLift: palette.nightTealLift,

  danger: palette.dangerNight,
  overlay: "rgba(0, 0, 0, 0.6)",
  isDark: true,
};

export const NAV_THEME = { light: lightTheme, dark: darkTheme };

// 4pt base. The screen gutter is `space.lg`.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

// THE SPINE. These three numbers are the layout — every row on the thread
// aligns to them, so the line reads as continuous down the whole screen rather
// than as a decoration repeated per card.
export const thread = {
  /** Distance from the screen gutter to the centre of the line. */
  rail: 9,
  /** Diameter of a node. */
  node: 9,
  /** Left inset of content hanging off the spine. */
  gutter: 30,
  /** How far a superseded fact branches out. */
  fork: 14,
} as const;

// System face (SF on iOS, Roboto on Android). The personality is not the
// typeface — it's that DATA is set as display: readings large in tabular
// figures with the unit small beside them, and every label tracked out. A
// column of readings has to align on the decimal, which is what tabular-nums
// buys and why measurements never use the proportional default.
// `satisfies` rather than `as const`: it keeps the literal types React Native
// needs for fontWeight while leaving fontVariant a mutable array, which a
// readonly tuple would not be assignable to in a TextStyle.
export const type = {
  display: { fontSize: 32, fontWeight: "700", letterSpacing: -0.8, lineHeight: 37 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4, lineHeight: 28 },
  heading: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2, lineHeight: 23 },
  body: { fontSize: 16, fontWeight: "400", lineHeight: 23 },
  bodyStrong: { fontSize: 16, fontWeight: "600", lineHeight: 23 },
  callout: { fontSize: 15, fontWeight: "400", lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600", letterSpacing: 0, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  /** Tracked-out uppercase. Used for months on the spine and section headers. */
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.1, lineHeight: 14 },
  /** A measurement, set as display. Always paired with `unit`. */
  reading: {
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.6,
    lineHeight: 32,
    fontVariant: ["tabular-nums"],
  },
  /** The unit beside a reading — present, not shouting. */
  unit: { fontSize: 13, fontWeight: "600", letterSpacing: 0.2, lineHeight: 18 },
  /** Any inline figure that has to align in a column. */
  figure: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"], lineHeight: 21 },
} satisfies Record<string, TextStyle>;
