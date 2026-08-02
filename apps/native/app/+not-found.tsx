import { router, Stack } from "expo-router";
import { View } from "react-native";

import { Button, EmptyState, useTheme } from "@/components/ui";
import { space } from "@/theme/tokens";

export default function NotFoundScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: space.lg,
          backgroundColor: theme.paper,
        }}
      >
        <EmptyState
          title="This screen doesn't exist"
          body="That link doesn't lead anywhere in Caretalk. Head back to your workspaces to pick up where you left off."
          action={
            <Button title="Go to workspaces" onPress={() => router.replace("/workspaces")} />
          }
        />
      </View>
    </>
  );
}
