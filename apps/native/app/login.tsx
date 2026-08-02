import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { Button, useTheme } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { space, thread, type } from "@/theme/tokens";

export default function Login() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  useEffect(() => {
    if (session?.user) router.replace("/workspaces");
  }, [session?.user]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: space.lg,
            paddingTop: insets.top + space.lg,
            paddingBottom: insets.bottom + space.lg,
            gap: space.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* The thread, introduced before it holds anything: a line, a node,
              the wordmark hanging off it — the same drawing the record uses. */}
          <View style={{ flexDirection: "row", paddingBottom: space.md }}>
            <View style={{ width: thread.gutter }}>
              <View
                style={{
                  position: "absolute",
                  left: thread.rail - 0.5,
                  top: 14,
                  bottom: -space.md,
                  width: 1,
                  backgroundColor: theme.spineFaint,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: thread.rail - thread.node / 2,
                  top: 14,
                  width: thread.node,
                  height: thread.node,
                  borderRadius: thread.node / 2,
                  backgroundColor: theme.text,
                }}
              />
            </View>
            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={[type.display, { color: theme.text }]}>Caretalk</Text>
              <Text style={[type.callout, { color: theme.textMuted }]}>
                One thread through a health journey.
              </Text>
            </View>
          </View>

          {mode === "sign-in" ? <SignIn /> : <SignUp />}

          <Button
            variant="ghost"
            title={mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            style={{ alignSelf: "center" }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
