import React, { useEffect } from "react";
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

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Main-chat Quick Messages popup. Opened from the InputBar's More menu
 * ("🗨 Quick Messages"). Shows the current batch of Gemini-generated
 * suggestions as a vertical scrollable list with the FULL body text
 * visible on each card (matching the mockup) — different from the
 * Conversation Mode panel which uses short labels for tighter cards.
 *
 * Tap behavior: card → consume + send + close popup. Tim sees the reply
 * land in the chat behind him.
 *
 * The popup sets quickStore.popupConsumer while open so the session
 * poller knows to keep generating fresh batches even when Conversation
 * Mode isn't active.
 */
export function QuickMessagesPopup({ visible, onClose }: Props) {
  const suggestions = useQuick((s) => s.suggestions);
  const generating = useQuick((s) => s.generating);
  const lastError = useQuick((s) => s.lastError);
  const consume = useQuick((s) => s.consume);
  const setPopupConsumer = useQuick((s) => s.setPopupConsumer);
  const sendMessage = useChat((s) => s.sendMessage);
  const chatStatus = useChat((s) => s.status);

  // Register the popup as a generation consumer while open. Without this,
  // the generator would suppress (no Conversation Mode = no point) and the
  // popup could open to an empty state with no auto-refill.
  useEffect(() => {
    setPopupConsumer(visible);
    return () => setPopupConsumer(false);
  }, [visible, setPopupConsumer]);

  const handleTap = async (idx: number) => {
    if (chatStatus === "assembling" || chatStatus === "sending") return;
    const item = useQuick.getState().suggestions[idx];
    if (!item) return;
    consume(idx);
    // Close BEFORE awaiting send so Tim sees his message land in the
    // chat with no popup occluding it.
    onClose();
    try {
      await sendMessage(item.body);
    } catch (err) {
      console.warn("[quickPopup] tap-send failed:", err);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.sheetWrap} edges={["bottom"]} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headlineBlock}>
              <View style={styles.headerIconWrap}>
                <Text style={styles.headerIcon}>💬</Text>
              </View>
              <View>
                <Text style={styles.title}>Quick Messages</Text>
                <Text style={styles.sub}>Relevant right now</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          {suggestions.length === 0 ? (
            <View style={styles.emptyState}>
              {generating ? (
                <>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={styles.emptyText}>Generating suggestions…</Text>
                </>
              ) : lastError ? (
                <Text style={[styles.emptyText, { color: C.red }]} numberOfLines={2}>
                  ⚠ {lastError}
                </Text>
              ) : (
                <Text style={styles.emptyText}>
                  Suggestions will appear here as the trip evolves.
                </Text>
              )}
            </View>
          ) : (
            <ScrollView style={{ maxHeight: "100%" }} contentContainerStyle={{ paddingBottom: 8 }}>
              {suggestions.map((item, i) => (
                <Pressable
                  key={`${i}-${item.label}`}
                  onPress={() => handleTap(i)}
                  style={({ pressed }) => [
                    styles.card,
                    pressed && { opacity: 0.7 },
                  ]}
                  disabled={chatStatus === "assembling" || chatStatus === "sending"}
                >
                  <View style={styles.cardIconWrap}>
                    <Text style={styles.cardIcon}>{item.icon}</Text>
                  </View>
                  <Text style={styles.cardBody} numberOfLines={3}>
                    {/* Strip a leading *…* emote for display — the body
                        gets sent verbatim including the emote markers,
                        but the popup card preview reads cleaner without
                        the action prefix. */}
                    {stripLeadingEmote(item.body)}
                  </Text>
                  <Text style={styles.cardChevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function stripLeadingEmote(body: string): string {
  // Drop a single leading *…* segment if present, then trim.
  return body.replace(/^\s*\*[^*]*\*\s*/, "").trim() || body;
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sheet: {
    backgroundColor: C.raised,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.accent + "44",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    maxHeight: "78%",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headlineBlock: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.accent + "1A",
    borderWidth: 1,
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: { fontSize: 18 },
  title: { color: C.text, fontSize: 16, fontWeight: "700" },
  sub: { color: C.accent, fontSize: 12, fontWeight: "600", marginTop: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: { color: C.muted, fontSize: 18, lineHeight: 18 },
  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  emptyText: { color: C.muted, fontSize: 12, textAlign: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.accent + "14",
    borderWidth: 1,
    borderColor: C.accent + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  cardIcon: { fontSize: 22 },
  cardBody: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "500",
  },
  cardChevron: { color: C.accent, fontSize: 18 },
});
