import { DarkTheme, DefaultTheme, type Theme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useTheme } from "@/components/ui";
import { NAV_THEME, type } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: NAV_THEME.light,
};
const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: NAV_THEME.dark,
};

// Anchors the stack. Without this, any entry that isn't a push — a deep link,
// or a Fast Refresh reload while sitting on a workspace — builds no back stack
// and strands you on that screen with no way out.
export const unstable_settings = {
  initialRouteName: "workspaces",
};

const queryClient = new QueryClient();

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

function RootStack() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.canvas },
        headerTintColor: theme.primary,
        headerTitleStyle: { ...type.heading, color: theme.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="workspaces" options={{ title: "Workspaces" }} />
      <Stack.Screen name="workspace/[workspaceId]/index" options={{ title: "Workspace" }} />
      <Stack.Screen name="workspace/[workspaceId]/import" options={{ title: "Import" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const { isDarkColorScheme } = useColorScheme();

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
          <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
          <GestureHandlerRootView style={styles.container}>
            <RootStack />
          </GestureHandlerRootView>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
