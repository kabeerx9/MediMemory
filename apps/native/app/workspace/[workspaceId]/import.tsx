import { importFileMediaTypeSchema, type ImportFile, type ImportResponse } from "@caretalk/contracts/health";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import { Glyph, KindIcon } from "@/components/kind-icon";
import { Button, Eyebrow, Field, notifySaved, tap, useTheme } from "@/components/ui";
import { healthApi } from "@/lib/api";
import { formatDay, kindLabel } from "@/lib/record";
import { radius, space, type } from "@/theme/tokens";

// Raw-file cap. Base64 inflates ~4/3 and Vercel rejects request bodies over
// ~4.5MB, so 3MB raw is the safe ceiling — same as the web import page.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

export default function ImportScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<ImportFile | null>(null);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const runImport = useMutation({
    mutationFn: (force: boolean) =>
      healthApi.importContent(workspaceId, {
        title: title.trim() || (file ? file.name : "Imported notes"),
        content: content.trim() || undefined,
        file: file ?? undefined,
        ...(force ? { force: true } : {}),
      }),
    onSuccess: (response) => {
      setResult(response);
      // The server recognised this exact payload and ran no extraction, so the
      // form stays filled and you confirm rather than retype.
      if (response.duplicateOf) {
        Alert.alert(
          "Already imported",
          `This was imported before and saved ${response.memories.length} facts. Importing again duplicates all of them.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Import anyway", onPress: () => runImport.mutate(true) },
          ],
        );
        return;
      }
      notifySaved();
      setContent("");
      setTitle("");
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
    },
    onError: (err) =>
      Alert.alert("Could not import", err instanceof Error ? err.message : "Try again."),
  });

  async function pickFile() {
    setPicking(true);
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
        Alert.alert("File too large", "The limit is 3MB. Try a smaller scan or paste the text instead.");
        return;
      }

      // expo-file-system's File API (SDK 55+) reads base64 off a handle built
      // from the picked document's local uri.
      const base64 = await new File(asset.uri).base64();
      setFile({
        name: asset.name,
        mediaType: mediaType.data,
        dataUrl: `data:${mediaType.data};base64,${base64}`,
      });
    } catch {
      Alert.alert("Could not read file", "Try picking the file again.");
    } finally {
      setPicking(false);
    }
  }

  const canSubmit = (content.trim().length > 0 || file !== null) && !runImport.isPending;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.paper }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: space.sm }}>
        <Text style={[type.title, { color: theme.text }]}>Import a report</Text>
        <Text style={[type.callout, { color: theme.textMuted }]}>
          Paste a doctor's note or attach a PDF or photo of one. Caretalk pulls out the durable
          facts and adds them to the thread, the same way it would in conversation.
        </Text>
        <Text style={[type.caption, { color: theme.textFaint }]}>
          The file is read once to extract facts, then never stored.
        </Text>
      </View>

      <Field label="Title" placeholder="Cardiology visit, March 3" value={title} onChangeText={setTitle} />

      <Field
        label="Content"
        placeholder={file ? "Optional — context about the attached file…" : "Paste the note here…"}
        multiline
        value={content}
        onChangeText={setContent}
      />

      {file ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            padding: space.md,
            borderRadius: radius.md,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.raised,
          }}
        >
          <Glyph
            sf={file.mediaType === "application/pdf" ? "doc.text" : "photo"}
            md={file.mediaType === "application/pdf" ? "file-document-outline" : "image-outline"}
            color={theme.textMuted}
            size={18}
          />
          <Text numberOfLines={1} style={[type.callout, { color: theme.text, flex: 1 }]}>
            {file.name}
          </Text>
          <Pressable
            accessibilityLabel="Remove file"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              tap();
              setFile(null);
            }}
          >
            <Glyph sf="xmark" md="close" color={theme.textFaint} size={15} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={picking}
          onPress={() => {
            tap();
            void pickFile();
          }}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: space.sm,
            paddingVertical: space.lg,
            borderRadius: radius.md,
            borderCurve: "continuous",
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: theme.border,
            backgroundColor: pressed ? theme.sunken : "transparent",
          })}
        >
          {picking ? (
            <ActivityIndicator size="small" color={theme.textMuted as string} />
          ) : (
            <>
              <Glyph sf="paperclip" md="paperclip" color={theme.textMuted} size={16} />
              <Text style={[type.callout, { color: theme.textMuted }]}>Attach a PDF or photo</Text>
            </>
          )}
        </Pressable>
      )}

      <Button
        title="Read and save"
        loading={runImport.isPending}
        disabled={!canSubmit}
        onPress={() => runImport.mutate(false)}
      />

      {result ? (
        <View style={{ gap: space.md, paddingTop: space.sm }}>
          <Eyebrow>
            {result.duplicateOf ? "That import saved" : "Added to the thread"}
          </Eyebrow>

          {result.profileUpdated ? (
            <Text style={[type.caption, { color: theme.textFaint }]}>Profile updated</Text>
          ) : null}

          {result.memories.length === 0 ? (
            <Text style={[type.callout, { color: theme.textMuted }]}>
              No durable facts were found in that text.
            </Text>
          ) : (
            result.memories.map((memory, index) => (
              <Animated.View
                key={memory.id}
                entering={reduced ? undefined : FadeInDown.delay(index * 30).duration(240)}
                style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}
              >
                <View style={{ paddingTop: 3 }}>
                  <KindIcon kind={memory.kind} color={theme.accent} size={13} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text selectable style={[type.callout, { color: theme.text }]}>
                    {memory.content}
                  </Text>
                  <Text style={[type.caption, { color: theme.textFaint }]}>
                    {kindLabel[memory.kind]} · {formatDay(memory.happenedOn)}
                  </Text>
                </View>
              </Animated.View>
            ))
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
