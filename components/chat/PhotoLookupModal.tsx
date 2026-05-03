import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import { analyzePhotoSubject, PhotoSubjectAnalysis } from "@/services/gemini";
import { toInlineBlob } from "@/session/pendingAttachments";
import { useChat } from "@/stores/chatStore";

interface Props {
  visible: boolean;
  /** The photo Tim tapped — shown as a thumbnail at the top for context. */
  photoUri: string | null;
  onClose: () => void;
}

/**
 * "🔍 Look this up" modal. Tim taps the 🔍 overlay on a photo → this opens
 * and immediately asks Gemini Pro to identify the subject of the photo and
 * emit encyclopedic context about it from training (much richer than web
 * search snippets for "what is this animal" style questions).
 *
 * No typing required. Tim sees the result and either Attaches it (the
 * context flows into the next send's lookupContext, weaved into the emote)
 * or Skips (just closes).
 */
export function PhotoLookupModal({ visible, photoUri, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PhotoSubjectAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const attachLookup = useChat((s) => s.attachLookup);
  const pendingCount = useChat((s) => s.pendingLookups.length);

  const runAnalysis = async (uri: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setAttached(false);
    try {
      const blob = await toInlineBlob({
        id: "lookup",
        kind: "image",
        localPath: uri,
        mimeType: guessMimeType(uri),
      });
      const analysis = await analyzePhotoSubject({
        mimeType: blob.mimeType,
        data: blob.data,
      });
      setResult(analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subject analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && photoUri) {
      runAnalysis(photoUri);
    } else if (!visible) {
      setResult(null);
      setError(null);
      setAttached(false);
    }
  }, [visible, photoUri]);

  const handleAttach = () => {
    if (!result) return;
    attachLookup({ subject: result.subject, context: result.context });
    setAttached(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.backdrop} />
      <KeyboardAvoidingView
        style={{ width: "100%" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.sheetWrap} edges={["bottom"]}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>🔍 Look this up</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: C.muted, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              Gemini identifies the subject and writes context from its
              training. Attach it to ride along on your next message.
              {pendingCount > 0
                ? `  · ${pendingCount} already attached`
                : ""}
            </Text>

            <View style={styles.thumbRow}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.thumb} />
              ) : null}
              <View style={{ flex: 1 }}>
                {loading ? (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={styles.statusText}>Analyzing photo…</Text>
                  </View>
                ) : error ? (
                  <View>
                    <Text style={styles.errorLabel}>{error}</Text>
                    <Pressable
                      onPress={() => photoUri && runAnalysis(photoUri)}
                      style={styles.retryBtn}
                    >
                      <Text style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}>
                        Try again
                      </Text>
                    </Pressable>
                  </View>
                ) : result ? (
                  <Text style={styles.subjectLabel}>{result.subject}</Text>
                ) : null}
              </View>
            </View>

            {result ? (
              <ScrollView style={{ maxHeight: 300 }}>
                <Text style={styles.contextText}>{result.context}</Text>
              </ScrollView>
            ) : null}

            {result ? (
              <View style={styles.actionsRow}>
                <Pressable onPress={onClose} style={[styles.actionBtn, styles.skipBtn]}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </Pressable>
                <Pressable
                  onPress={handleAttach}
                  disabled={attached}
                  style={[
                    styles.actionBtn,
                    styles.attachBtn,
                    attached && styles.attachBtnDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.attachBtnText,
                      attached && { color: C.green },
                    ]}
                  >
                    {attached ? "✓ Attached to next send" : "📎 Attach to next send"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function guessMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetWrap: {
    backgroundColor: C.raised,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheet: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { color: C.text, fontSize: 16, fontWeight: "700" },
  subtitle: { color: C.muted, fontSize: 11, marginBottom: 12, lineHeight: 15 },
  thumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: C.surface,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { color: C.accent, fontSize: 13, fontWeight: "600" },
  subjectLabel: { color: C.text, fontSize: 16, fontWeight: "700" },
  errorLabel: { color: C.muted, fontSize: 12, marginBottom: 8 },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
    alignSelf: "flex-start",
  },
  contextText: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  skipBtn: {
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  skipBtnText: { color: C.textDim, fontSize: 13, fontWeight: "600" },
  attachBtn: {
    backgroundColor: C.accent + "22",
    borderColor: C.accent + "66",
  },
  attachBtnDone: {
    backgroundColor: C.green + "14",
    borderColor: C.green + "44",
  },
  attachBtnText: { color: C.accent, fontSize: 13, fontWeight: "700" },
});
