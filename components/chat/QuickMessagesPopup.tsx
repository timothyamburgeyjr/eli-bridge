import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import { useQuick } from "@/stores/quickStore";
import { useChat } from "@/stores/chatStore";
import { gatherSensorSnapshot } from "@/session/liveSensors";
import {
  QUICK_CATEGORIES,
  getCategoryMeta,
  type QuickCategoryKey,
} from "@/constants/quickCategories";
import type { SensorSnapshot } from "@/types";

/**
 * Quick Messages popup — single-modal X-Ray-style flow.
 *
 *   Categories view  → tap a category card
 *   Detail view      → 4–7 Gemini-generated messages for that category
 *                       (tap a message to send + close popup)
 *
 * One Modal, internal navigation. The back arrow returns from Detail to
 * Categories; the close X dismisses the whole popup. The snapshot used for
 * "Relevant right now in {place}" + Gemini grounding is gathered once when
 * the popup opens, so the place name in the Detail header matches what
 * Gemini is generating against.
 *
 * Same component is mounted from two entry points:
 *   - More menu in main chat (live mode)
 *   - "Open Quick Messages" button in the Conversation Mode overlay
 */

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function QuickMessagesPopup({ visible, onClose }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<QuickCategoryKey | null>(null);
  const [snapshot, setSnapshot] = useState<SensorSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const fetchCategory = useQuick((s) => s.fetchCategory);

  // Gather the sensor snapshot ONCE when the popup opens. This snapshot
  // feeds both the Detail header ("Relevant right now in {place}") and the
  // Gemini call when the user taps a category, so they stay aligned.
  useEffect(() => {
    if (!visible) {
      setSelectedCategory(null);
      setSnapshot(null);
      return;
    }
    setSnapshotLoading(true);
    (async () => {
      try {
        const s = await gatherSensorSnapshot();
        setSnapshot(s);
      } catch (err) {
        console.warn("[quickPopup] snapshot gather failed:", err);
        setSnapshot(null);
      } finally {
        setSnapshotLoading(false);
      }
    })();
  }, [visible]);

  const handleCategoryTap = (key: QuickCategoryKey) => {
    setSelectedCategory(key);
    if (snapshot) {
      // Fire and forget — the Detail view subscribes to the store and renders
      // loading/error/ready off the per-category status.
      void fetchCategory(key, snapshot);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (selectedCategory !== null) setSelectedCategory(null);
        else onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
            <View style={styles.grabber} />
            {selectedCategory === null ? (
              <CategoriesView
                snapshotLoading={snapshotLoading}
                onCategoryTap={handleCategoryTap}
                onClose={onClose}
              />
            ) : (
              <DetailView
                categoryKey={selectedCategory}
                snapshot={snapshot}
                onBack={() => setSelectedCategory(null)}
                onClose={onClose}
              />
            )}
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

// ── Categories view ───────────────────────────────────────────────

function CategoriesView({
  snapshotLoading,
  onCategoryTap,
  onClose,
}: {
  snapshotLoading: boolean;
  onCategoryTap: (key: QuickCategoryKey) => void;
  onClose: () => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Text style={{ fontSize: 18 }}>💬</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quick Message Categories</Text>
          <Text style={styles.subtitle}>Choose what kind of message to send</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
          <Text style={{ color: C.muted, fontSize: 20 }}>×</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {QUICK_CATEGORIES.map((cat) => (
          <Pressable
            key={cat.key}
            onPress={() => onCategoryTap(cat.key)}
            disabled={snapshotLoading}
            style={({ pressed }) => [
              styles.categoryRow,
              pressed && { opacity: 0.6 },
              snapshotLoading && { opacity: 0.5 },
            ]}
          >
            <View style={styles.categoryIcon}>
              <Text style={{ fontSize: 24 }}>{cat.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryTitle}>{cat.title}</Text>
              <Text style={styles.categoryDescription}>{cat.description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
        {snapshotLoading ? (
          <View style={styles.snapshotLoading}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={styles.snapshotLoadingText}>Reading your moment…</Text>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

// ── Detail view ───────────────────────────────────────────────────

function DetailView({
  categoryKey,
  snapshot,
  onBack,
  onClose,
}: {
  categoryKey: QuickCategoryKey;
  snapshot: SensorSnapshot | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const meta = getCategoryMeta(categoryKey);
  const state = useQuick((s) => s.byCategory[categoryKey]);
  const consume = useQuick((s) => s.consume);
  const fetchCategory = useQuick((s) => s.fetchCategory);
  const sendMessage = useChat((s) => s.sendMessage);
  const chatStatus = useChat((s) => s.status);

  const placeName = snapshot?.location?.placeName ?? null;
  const contextLine = placeName
    ? `Relevant right now in ${placeName}`
    : "Relevant right now";

  const handleSend = async (idx: number) => {
    if (chatStatus === "assembling" || chatStatus === "sending") return;
    const item = state.messages[idx];
    if (!item) return;
    consume(categoryKey, idx);
    onClose();
    try {
      await sendMessage(item.body);
    } catch (err) {
      console.warn("[quickPopup] send failed:", err);
    }
  };

  const handleRetry = () => {
    if (snapshot) void fetchCategory(categoryKey, snapshot);
  };

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={{ color: C.accent, fontSize: 20, fontWeight: "700" }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.subtitle}>{contextLine}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
          <Text style={{ color: C.muted, fontSize: 20 }}>×</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {state.status === "loading" || state.status === "idle" ? (
          <View style={styles.fullStateBlock}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.fullStateText}>
              Asking Gemini for fresh {meta.title.toLowerCase()} messages…
            </Text>
          </View>
        ) : state.status === "error" ? (
          <View style={styles.fullStateBlock}>
            <Text style={[styles.fullStateText, { color: C.red }]}>
              ⚠ {state.error ?? "Generation failed."}
            </Text>
            <Pressable onPress={handleRetry} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : state.messages.length === 0 ? (
          <View style={styles.fullStateBlock}>
            <Text style={styles.fullStateText}>
              No messages came back. Tap to retry.
            </Text>
            <Pressable onPress={handleRetry} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          state.messages.map((msg, idx) => (
            <Pressable
              key={`${categoryKey}-${idx}`}
              onPress={() => handleSend(idx)}
              disabled={chatStatus === "assembling" || chatStatus === "sending"}
              style={({ pressed }) => [
                styles.messageRow,
                pressed && { opacity: 0.6 },
                (chatStatus === "assembling" || chatStatus === "sending") && {
                  opacity: 0.5,
                },
              ]}
            >
              <View style={styles.messageIcon}>
                <Text style={{ fontSize: 22 }}>{msg.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.messageTitle}>{msg.label}</Text>
                <Text style={styles.messageBody} numberOfLines={4}>
                  {msg.body}
                </Text>
              </View>
              <Text style={styles.sendChevron}>↗</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </>
  );
}

// ── styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
    minHeight: "60%",
    borderTopWidth: 1,
    borderColor: C.border,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.muted + "55",
    marginTop: 8,
    marginBottom: 4,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 12, color: C.accent, marginTop: 2 },

  list: { padding: 16, gap: 10 },

  // Category row
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.raised,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.accent + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  categoryDescription: {
    fontSize: 12,
    color: C.textDim,
    marginTop: 4,
    lineHeight: 16,
  },
  chevron: { fontSize: 22, color: C.accent, fontWeight: "600" },

  // Detail message row
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  messageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.accent + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  messageTitle: { fontSize: 14, fontWeight: "700", color: C.text },
  messageBody: {
    fontSize: 12,
    color: C.textDim,
    marginTop: 4,
    lineHeight: 17,
    fontStyle: "italic",
  },
  sendChevron: { fontSize: 18, color: C.accent, marginTop: 8 },

  // Loading / error blocks
  fullStateBlock: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  fullStateText: {
    color: C.textDim,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accent + "66",
    backgroundColor: C.accent + "1A",
  },
  retryBtnText: { color: C.accent, fontSize: 13, fontWeight: "700" },

  snapshotLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
  },
  snapshotLoadingText: { color: C.muted, fontSize: 12 },
});
