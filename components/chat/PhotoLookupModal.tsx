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
import {
  analyzePhotoCandidates,
  researchPhotoSubject,
  PhotoCandidate,
} from "@/services/gemini";
import { toInlineBlob } from "@/session/pendingAttachments";
import { useChat } from "@/stores/chatStore";
import { currentAbortSignal } from "@/session/abortBus";

interface Props {
  visible: boolean;
  /** The photo Tim tapped — shown as a thumbnail at the top for context. */
  photoUri: string | null;
  onClose: () => void;
}

/**
 * "🔍 Look this up" modal — two-stage flow:
 *   1. Open → Gemini Pro identifies 3-5 candidate subjects visible in the
 *      photo. Tim picks the one he's actually curious about.
 *   2. Pick → Gemini Pro researches that specific subject (with the photo
 *      re-attached so the context can call out which variant/breed/model is
 *      visible). Tim then Attaches the result to his next send, or Skips.
 *
 * The two-stage shape replaced a single-shot "guess the main subject" flow
 * that often picked the wrong thing — a tank instead of the turtle inside
 * it, the wall behind a painting instead of the painting, etc.
 */

type Stage =
  | "loading-candidates"
  | "candidates"
  | "loading-context"
  | "context"
  | "error";

export function PhotoLookupModal({ visible, photoUri, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("loading-candidates");
  const [candidates, setCandidates] = useState<PhotoCandidate[]>([]);
  const [chosen, setChosen] = useState<PhotoCandidate | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const attachLookup = useChat((s) => s.attachLookup);
  const pendingCount = useChat((s) => s.pendingLookups.length);

  const resetAll = () => {
    setStage("loading-candidates");
    setCandidates([]);
    setChosen(null);
    setContext(null);
    setError(null);
    setAttached(false);
  };

  const loadCandidates = async (uri: string) => {
    setStage("loading-candidates");
    setError(null);
    try {
      const blob = await toInlineBlob({
        id: "lookup",
        kind: "image",
        localPath: uri,
        mimeType: guessMimeType(uri),
      });
      const list = await analyzePhotoCandidates(
        { mimeType: blob.mimeType, data: blob.data },
        currentAbortSignal()
      );
      setCandidates(list);
      setStage("candidates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't identify subjects.");
      setStage("error");
    }
  };

  const researchChoice = async (candidate: PhotoCandidate) => {
    if (!photoUri) return;
    setChosen(candidate);
    setContext(null);
    setError(null);
    setStage("loading-context");
    try {
      const blob = await toInlineBlob({
        id: "lookup",
        kind: "image",
        localPath: photoUri,
        mimeType: guessMimeType(photoUri),
      });
      const ctx = await researchPhotoSubject(
        { mimeType: blob.mimeType, data: blob.data },
        candidate.subject,
        currentAbortSignal()
      );
      setContext(ctx);
      setStage("context");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subject research failed.");
      setStage("error");
    }
  };

  useEffect(() => {
    if (visible && photoUri) {
      resetAll();
      loadCandidates(photoUri);
    } else if (!visible) {
      // Defer clear so closing animation doesn't show flicker.
      resetAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, photoUri]);

  const handleAttach = () => {
    if (!chosen || !context) return;
    attachLookup({ subject: chosen.subject, context });
    setAttached(true);
  };

  const handleBackToCandidates = () => {
    setChosen(null);
    setContext(null);
    setAttached(false);
    setStage("candidates");
  };

  const handleRetry = () => {
    if (!photoUri) return;
    if (chosen) researchChoice(chosen);
    else loadCandidates(photoUri);
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
              {stage === "candidates" || stage === "loading-candidates"
                ? "Pick which subject to research."
                : stage === "loading-context"
                ? `Researching ${chosen?.subject ?? "subject"}…`
                : "Attach to ride along on your next message."}
              {pendingCount > 0 ? `  ·  ${pendingCount} already attached` : ""}
            </Text>

            <View style={styles.thumbRow}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.thumb} />
              ) : null}
              <View style={{ flex: 1 }}>
                {stage === "loading-candidates" ? (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={styles.statusText}>Identifying subjects…</Text>
                  </View>
                ) : stage === "loading-context" ? (
                  <View style={styles.statusRow}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={styles.statusText}>
                      {chosen?.subject ?? "Researching…"}
                    </Text>
                  </View>
                ) : stage === "error" ? (
                  <Text style={styles.errorLabel}>{error}</Text>
                ) : stage === "context" && chosen ? (
                  <Text style={styles.subjectLabel}>{chosen.subject}</Text>
                ) : null}
              </View>
            </View>

            {/* ── Candidate list ───────────────────────────────────────── */}
            {stage === "candidates" && candidates.length > 0 ? (
              <ScrollView style={{ maxHeight: 320 }}>
                {candidates.map((c, i) => (
                  <Pressable
                    key={`${c.subject}-${i}`}
                    onPress={() => researchChoice(c)}
                    style={styles.candidateRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateSubject}>{c.subject}</Text>
                      {c.locator ? (
                        <Text style={styles.candidateLocator}>{c.locator}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.candidateChevron}>›</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {/* ── Research result ──────────────────────────────────────── */}
            {stage === "context" && context ? (
              <ScrollView style={{ maxHeight: 300 }}>
                <Text style={styles.contextText}>{context}</Text>
              </ScrollView>
            ) : null}

            {/* ── Error retry ──────────────────────────────────────────── */}
            {stage === "error" ? (
              <View style={styles.actionsRow}>
                <Pressable onPress={onClose} style={[styles.actionBtn, styles.skipBtn]}>
                  <Text style={styles.skipBtnText}>Close</Text>
                </Pressable>
                <Pressable onPress={handleRetry} style={[styles.actionBtn, styles.attachBtn]}>
                  <Text style={styles.attachBtnText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}

            {/* ── Context-stage actions: back / attach ─────────────────── */}
            {stage === "context" ? (
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={handleBackToCandidates}
                  style={[styles.actionBtn, styles.skipBtn]}
                >
                  <Text style={styles.skipBtnText}>← Back</Text>
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
                    {attached ? "✓ Attached" : "📎 Attach"}
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
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 6,
  },
  candidateSubject: {
    color: C.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  candidateLocator: {
    color: C.textDim,
    fontSize: 11,
    lineHeight: 14,
  },
  candidateChevron: {
    color: C.muted,
    fontSize: 22,
    marginLeft: 8,
  },
  contextText: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
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
