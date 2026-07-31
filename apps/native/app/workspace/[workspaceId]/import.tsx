import { importFileMediaTypeSchema, type ImportFile, type ImportResponse } from "@caretalk/contracts/health";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from "react-native";

import { Button, Card, Field, Screen, SectionLabel, useTheme } from "@/components/ui";
import { healthApi } from "@/lib/api";
import { formatDate, useKindMeta } from "@/lib/kind-meta";
import { radius, space, type } from "@/lib/theme";

// Raw-file cap. Base64 inflates ~4/3 and the server (Vercel) rejects request
// bodies over ~4.5MB, so 3MB raw is the safe ceiling — same as
// apps/web/src/features/health/import-page.tsx.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

export default function ImportScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const theme = useTheme();
  const kindMeta = useKindMeta();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<ImportFile | null>(null);
  const [pickingFile, setPickingFile] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const importMutation = useMutation({
    mutationFn: () =>
      healthApi.importContent(workspaceId, {
        title: title.trim() || (file ? file.name : "Imported notes"),
        content: content.trim() || undefined,
        file: file ?? undefined,
      }),
    onSuccess: (response) => {
      setResult(response);
      setContent("");
      setTitle("");
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (err) => {
      Alert.alert("Could not import", err instanceof Error ? err.message : "Try again.");
    },
  });

  async function pickFile() {
    setPickingFile(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const asset = picked.assets[0];

      const mediaType = importFileMediaTypeSchema.safeParse(asset.mimeType);
      if (!mediaType.success) {
        Alert.alert("Unsupported file", "Only PDF, PNG, JPEG, or WebP files are supported.");
        return;
      }
      if (asset.size !== undefined && asset.size > MAX_FILE_BYTES) {
        Alert.alert(
          "File too large",
          "The limit is 3MB. Try a smaller scan or paste the text instead.",
        );
        return;
      }

      // expo-file-system's new File API (SDK 55+) exposes base64() directly
      // off a File handle constructed from the picked document's local uri.
      const base64 = await new File(asset.uri).base64();
      const dataUrl = `data:${mediaType.data};base64,${base64}`;
      setFile({ name: asset.name, mediaType: mediaType.data, dataUrl });
    } catch {
      Alert.alert("Could not read file", "Try picking the file again.");
    } finally {
      setPickingFile(false);
    }
  }

  const canSubmit = (content.trim().length > 0 || file !== null) && !importMutation.isPending;
  const isPdf = file?.mediaType === "application/pdf";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Import",
          // See workspace/index.tsx — same stranding guard for direct entry.
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <Pressable
                  accessibilityLabel="Back to workspace"
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={() =>
                    router.replace({
                      pathname: "/workspace/[workspaceId]",
                      params: { workspaceId },
                    })
                  }
                >
                  <Ionicons color={theme.primary} name="chevron-back" size={24} />
                </Pressable>
              ),
        }}
      />
      <Screen scroll edges={["bottom"]}>
        <View style={styles.intro}>
          <Text style={[type.title as TextStyle, { color: theme.text }]}>Import a report</Text>
          <Text style={[type.callout as TextStyle, { color: theme.textMuted }]}>
            Paste a doctor's note or attach a report — a PDF or a photo of it. Caretalk pulls out
            the durable facts and saves them the same way it would in conversation.
          </Text>
        </View>

        <Card muted style={styles.trustCard}>
          <View style={[styles.trustIcon, { backgroundColor: theme.primarySoft }]}>
            <Ionicons color={theme.primary} name="shield-checkmark-outline" size={16} />
          </View>
          <Text style={[type.caption as TextStyle, { color: theme.textMuted, flex: 1 }]}>
            The file itself is read once to extract facts, then never stored.
          </Text>
        </Card>

        <Field
          label="Title"
          placeholder="Cardiology visit, March 3"
          value={title}
          onChangeText={setTitle}
        />

        <Field
          label="Content"
          placeholder={
            file ? "Optional — add context about the attached file…" : "Paste the note or transcript here…"
          }
          multiline
          value={content}
          onChangeText={setContent}
        />

        <SectionLabel>Or attach a report</SectionLabel>

        {file ? (
          <Card style={[styles.fileChip, { backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }]}>
            <View style={[styles.fileChipIcon, { backgroundColor: theme.surface }]}>
              <Ionicons
                color={theme.primary}
                name={isPdf ? "document-text-outline" : "image-outline"}
                size={18}
              />
            </View>
            <Text style={[type.bodyStrong as TextStyle, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {file.name}
            </Text>
            <Pressable hitSlop={8} onPress={() => setFile(null)}>
              <Ionicons color={theme.textFaint} name="close-circle" size={22} />
            </Pressable>
          </Card>
        ) : (
          <Pressable
            disabled={pickingFile}
            onPress={() => void pickFile()}
            style={({ pressed }) => [
              styles.dropzone,
              {
                borderColor: theme.hairline,
                backgroundColor: pressed ? theme.surfaceMuted : theme.surface,
              },
            ]}
          >
            {pickingFile ? (
              <ActivityIndicator color={theme.primary} size="small" />
            ) : (
              <>
                <View style={[styles.dropzoneIcon, { backgroundColor: theme.primarySoft }]}>
                  <Ionicons color={theme.primary} name="cloud-upload-outline" size={22} />
                </View>
                <Text style={[type.bodyStrong as TextStyle, { color: theme.text }]}>Attach a report</Text>
                <Text style={[type.caption as TextStyle, { color: theme.textFaint }]}>
                  PDF or photo, up to 3MB
                </Text>
              </>
            )}
          </Pressable>
        )}

        <Button
          full
          label="Save to memory"
          loading={importMutation.isPending}
          disabled={!canSubmit}
          onPress={() => importMutation.mutate()}
          style={styles.submit}
        />

        {result ? (
          <View style={styles.resultSection}>
            <SectionLabel>Saved to memory</SectionLabel>

            {result.profileUpdated ? (
              <View style={[styles.profileChip, { backgroundColor: theme.accentSoft }]}>
                <Ionicons color={theme.accentText} name="person-circle-outline" size={14} />
                <Text style={[type.caption as TextStyle, { color: theme.accentText }]}>Profile updated</Text>
              </View>
            ) : null}

            {result.memories.length === 0 ? (
              <Text style={[type.callout as TextStyle, { color: theme.textMuted }]}>
                No new facts were found in that text.
              </Text>
            ) : (
              <View style={styles.resultList}>
                {result.memories.map((memory) => {
                  const meta = kindMeta[memory.kind] ?? kindMeta.note;
                  return (
                    <Card key={memory.id} style={styles.resultRow}>
                      <View style={[styles.resultKindCircle, { backgroundColor: meta.bg }]}>
                        <Ionicons color={meta.fg} name={meta.icon} size={16} />
                      </View>
                      <View style={styles.resultBody}>
                        <Text style={[type.body as TextStyle, { color: theme.text }]}>{memory.content}</Text>
                        <Text style={[type.caption as TextStyle, { color: meta.fg }]}>
                          {meta.label} · {formatDate(memory.happenedOn)}
                        </Text>
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  trustCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
  },
  trustIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dropzone: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    alignItems: "center",
    gap: space.xs,
  },
  dropzoneIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
  },
  fileChipIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  submit: { marginTop: space.xs },
  resultSection: { gap: space.md },
  resultList: { gap: space.sm },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  resultRow: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  resultKindCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  resultBody: { flex: 1, gap: 2 },
});
