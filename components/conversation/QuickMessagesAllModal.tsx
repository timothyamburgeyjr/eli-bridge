import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import { useQuick } from "@/stores/quickStore";
import { useChat } from "@/stores/chatStore";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuggestionTapped?: () => void;
}

/**
 * View-All sheet for Quick Messages. Lists every suggestion in the current
 * batch as a vertical scrollable column, useful when the 2×2 page-at-a-time
 * grid in the overlay isn't enough to find what Tim wants. Same tap-to-send
 * behavior — closes the modal after tap.
 */
export function QuickMessagesAllModal({
  visible,
  onClose,
  onSuggestionTapped,
}: Props) {
  const suggestions = useQuick((s) => s.suggestions);
  const consume = useQuick((s) => s.consume);
  const sendMessage = useChat((s) => s.sendMessage);
  const chatStatus = useChat((s) => s.status);

  const handleTap = async (idx: number) => {
    if (chatStatus === "assembling" || chatStatus === "sending") return;
    const item = useQuick.getState().suggestions[idx];
    if (!item) return;
    consume(idx);
    onClose();
    onSuggestionTapped?.();
    try {
      await sendMessage(item.body);
    } catch (err) {
      console.warn("[quickAll] tap-send failed:", err);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>All Quick Messages</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: C.muted, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: "100%" }}>
            {suggestions.length === 0 ? (
              <Text style={styles.empty}>
                No suggestions ready yet. They&apos;ll generate automatically
                as the trip evolves.
              </Text>
            ) : (
              suggestions.map((item, i) => (
                <Pressable
                  key={`${i}-${item.label}`}
                  onPress={() => handleTap(i)}
                  style={styles.row}
                  disabled={chatStatus === "assembling" || chatStatus === "sending"}
                >
                  <View style={styles.iconWrap}>
                    <Text style={styles.icon}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{item.label}</Text>
                    <Text style={styles.body} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.raised,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { color: C.text, fontSize: 16, fontWeight: "700" },
  empty: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    padding: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent + "1A",
    borderWidth: 1,
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18 },
  label: { color: C.text, fontSize: 13, fontWeight: "700", marginBottom: 3 },
  body: { color: C.textDim, fontSize: 11, lineHeight: 14 },
  chevron: { color: C.muted, fontSize: 22 },
});
