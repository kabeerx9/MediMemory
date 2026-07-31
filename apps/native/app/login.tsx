import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
} from "react-native";

import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { Button, Screen, useTheme } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { space, type } from "@/lib/theme";

export default function Login() {
  const theme = useTheme();
  const { data: session } = authClient.useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  useEffect(() => {
    if (session?.user) {
      router.replace("/workspaces");
    }
  }, [session?.user]);

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[type.display as TextStyle, styles.wordmark, { color: theme.text }]}>
            Caretalk
          </Text>
          <Text style={[type.callout as TextStyle, styles.tagline, { color: theme.textMuted }]}>
            Your health history, remembered.
          </Text>

          {mode === "sign-in" ? <SignIn /> : <SignUp />}

          <Button
            variant="ghost"
            full
            label={mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            style={styles.toggle}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space.lg,
    gap: space.lg,
  },
  wordmark: {
    textAlign: "center",
  },
  tagline: {
    textAlign: "center",
    marginTop: -space.sm,
  },
  toggle: {
    alignSelf: "center",
  },
});
