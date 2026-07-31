import { router, Stack } from "expo-router";
import { View } from "react-native";

import { Button, EmptyState, Screen } from "@/components/ui";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <Screen edges={["bottom"]}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            action={
              <Button
                label="Go to workspaces"
                onPress={() => router.replace("/workspaces")}
                variant="primary"
              />
            }
            body="That link doesn't lead anywhere in Caretalk. Head back to your workspaces to pick up where you left off."
            icon="compass-outline"
            title="This screen doesn't exist"
          />
        </View>
      </Screen>
    </>
  );
}
