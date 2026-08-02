import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable } from "react-native";

import { Glyph } from "@/components/kind-icon";
import { tap, useTheme } from "@/components/ui";
import { useWorkspace } from "@/lib/use-workspace";
import { type } from "@/theme/tokens";

// A stack wrapping the tabs, so Import and Profile can present over them as a
// modal and a form sheet — putting them inside the tab group instead would
// need a tab-bar entry each, since NativeTabs requires a trigger per route.
//
// The header lives HERE rather than in the tab screens. A `<Stack.Screen>`
// rendered inside a tab targets the tabs navigator, not this stack, so a title
// set there would silently never appear — and with this header hidden there'd
// be no back button to Workspaces at all. One header, showing whose record
// you're in, with the tabs switching content beneath it.
export default function WorkspaceLayout() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const { workspace } = useWorkspace();
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerBlurEffect: "systemChromeMaterial",
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTitleStyle: type.heading,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          title: workspace?.name ?? "",
          headerRight: () => (
            <Link
              href={{ pathname: "/workspace/[workspaceId]/profile", params: { workspaceId } }}
              asChild
              onPress={() => tap()}
            >
              <Pressable accessibilityLabel="Profile" accessibilityRole="button" hitSlop={10}>
                <Glyph
                  sf="person.text.rectangle"
                  md="card-account-details-outline"
                  color={theme.text}
                  size={19}
                />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Stack.Screen name="import" options={{ presentation: "modal", title: "Import" }} />
      <Stack.Screen
        name="profile"
        options={{
          presentation: "formSheet",
          title: "Profile",
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.6, 1],
          // Transparent content is what makes the sheet liquid glass on iOS 26.
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </Stack>
  );
}
