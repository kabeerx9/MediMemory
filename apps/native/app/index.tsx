import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, type TextStyle, View } from "react-native";

import { useTheme } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { space, type as typeTokens } from "@/theme/tokens";

export default function Index() {
  const theme = useTheme();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <View style={[styles.container, { backgroundColor: theme.paper }]}>
        <Text style={[typeTokens.display as TextStyle, styles.wordmark, { color: theme.text }]}>
          Caretalk
        </Text>
        <ActivityIndicator color={theme.primary} size="small" style={styles.spinner} />
      </View>
    );
  }

  if (session?.user) {
    return <Redirect href="/workspaces" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    marginBottom: space.lg,
  },
  spinner: {
    marginTop: space.xs,
  },
});
