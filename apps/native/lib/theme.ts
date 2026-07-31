// Design tokens for the native app.
//
// These mirror the web brand defined in packages/ui/src/styles/globals.css so
// the two clients read as one product: warm paper + warm ink + a teal accent,
// deliberately not the cold blue/grey of a default RN starter.
//
// Mint (accent) is reserved for one thing: the moment a fact is saved to
// memory. That is the product's thesis, so it gets the only bright colour in
// the app. Spending it anywhere else dilutes the signal.

const palette = {
  teal700: "#0f766e",
  teal600: "#0d9488",
  teal500: "#14b8a6",
  mint400: "#2dd4bf",
  mint300: "#5eead4",

  inkDeep: "#292521",
  night: "#16140f",
  canvasLight: "#faf9f7",
  canvasDark: "#1c1a17",
  surfaceTint: "#f5f3ee",
  pressLight: "#f0efec",

  hairlineCloud: "#e7e4de",
  hairlineCool: "#ded9d1",
  hairlineDark: "#3a352e",

  onLightMuted: "#736c62",
  onDarkMuted: "#beb8ad",

  white: "#ffffff",
  danger: "#e5484d",
};

export type AppTheme = {
  // Keys React Navigation's Theme requires — keep these names.
  background: string;
  border: string;
  card: string;
  notification: string;
  primary: string;
  text: string;
  // Extended semantic tokens.
  canvas: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  textMuted: string;
  textFaint: string;
  onPrimary: string;
  primaryPressed: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  danger: string;
  dangerSoft: string;
  chatUserBg: string;
  chatUserText: string;
  hairline: string;
  overlay: string;
};

export const lightTheme: AppTheme = {
  background: palette.canvasLight,
  border: palette.hairlineCloud,
  card: palette.white,
  notification: palette.danger,
  primary: palette.teal700,
  text: palette.inkDeep,

  canvas: palette.canvasLight,
  surface: palette.white,
  surfaceMuted: palette.surfaceTint,
  surfaceSunken: palette.pressLight,
  textMuted: palette.onLightMuted,
  textFaint: "#9b948a",
  onPrimary: palette.white,
  primaryPressed: "#0b5d56",
  primarySoft: "rgba(15, 118, 110, 0.08)",
  accent: palette.teal600,
  accentSoft: "rgba(45, 212, 191, 0.16)",
  accentText: "#0b5d56",
  danger: palette.danger,
  dangerSoft: "rgba(229, 72, 77, 0.10)",
  chatUserBg: palette.surfaceTint,
  chatUserText: palette.inkDeep,
  hairline: palette.hairlineCool,
  overlay: "rgba(41, 37, 33, 0.45)",
};

export const darkTheme: AppTheme = {
  background: palette.canvasDark,
  border: palette.hairlineDark,
  card: palette.inkDeep,
  notification: palette.danger,
  primary: palette.teal500,
  text: "#f7f5f2",

  canvas: palette.canvasDark,
  surface: palette.inkDeep,
  surfaceMuted: "#231f1b",
  surfaceSunken: palette.night,
  textMuted: palette.onDarkMuted,
  textFaint: "#8a8378",
  onPrimary: "#04211e",
  primaryPressed: palette.teal600,
  primarySoft: "rgba(20, 184, 166, 0.14)",
  accent: palette.mint400,
  accentSoft: "rgba(45, 212, 191, 0.14)",
  accentText: palette.mint300,
  danger: "#ff6369",
  dangerSoft: "rgba(255, 99, 105, 0.14)",
  chatUserBg: "rgba(45, 212, 191, 0.12)",
  chatUserText: "#f7f5f2",
  hairline: palette.hairlineDark,
  overlay: "rgba(0, 0, 0, 0.6)",
};

// Consumed by React Navigation's ThemeProvider. Extra keys beyond the six it
// needs are harmless and let screens read one object for everything.
export const NAV_THEME = { light: lightTheme, dark: darkTheme };

// 4pt base. Screen gutter is `space.lg`; anything tighter than `space.xs`
// between distinct elements usually means two things should be one thing.
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

// System face (SF on iOS, Roboto on Android) with a deliberate scale. Display
// sizes get negative tracking so large text reads as set, not as scaled-up UI.
export const type = {
  display: { fontSize: 30, fontWeight: "700", letterSpacing: -0.6, lineHeight: 36 },
  title: { fontSize: 21, fontWeight: "700", letterSpacing: -0.3, lineHeight: 27 },
  heading: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2, lineHeight: 23 },
  body: { fontSize: 16, fontWeight: "400", lineHeight: 24 },
  bodyStrong: { fontSize: 16, fontWeight: "600", lineHeight: 24 },
  callout: { fontSize: 15, fontWeight: "400", lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600", letterSpacing: 0.1, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, lineHeight: 14 },
} as const;
