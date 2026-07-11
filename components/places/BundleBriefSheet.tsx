import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import { useCompanionName } from "@/stores/personaStore";

interface Props {
  visible: boolean;
  placeCount: number;
  onClose: () => void;
  /** Called with the optional one-liner (or empty string) — caller bundles
   *  + sends. */
  onConfirm: (note: string) => void;
}

/**
 * Bottom sheet that appears when Tim taps the "📋 Brief Eli on N saved
 * places" pill. Lets him add an optional one-liner that frames the day,
 * then confirms the bundled brief.
 *
 * If the note is left blank, Gemini narrates the place flow purely from
 * the timeline. If filled, it weaves the framing through.
 */
export function BundleBriefSheet({
  visible,
  placeCount,
  onClose,
  onConfirm,
}: Props) {
  const who = useCompanionName();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.backdrop} />
      <KeyboardAvoidingView
        style={styles.kavWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.sheetWrap} edges={["bottom"]}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>{`📋 Brief ${who} on ${placeCount}`}</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: C.muted, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              Want to add a thought about how the day's going? Optional —
              leave blank for a pure timeline narration.
            </Text>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. good day, found a great series"
              placeholderTextColor={C.muted}
              style={styles.input}
              multiline
              maxLength={200}
              autoFocus
            />

            <View style={styles.actionsRow}>
              <Pressable onPress={onClose} style={[styles.actionBtn, styles.cancelBtn]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onConfirm(note.trim());
                }}
                style={[styles.actionBtn, styles.confirmBtn]}
              >
                <Text style={styles.confirmText}>{`📋 Brief ${who}`}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  kavWrap: { width: "100%" },
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
    marginBottom: 6,
  },
  title: { color: C.text, fontSize: 16, fontWeight: "700" },
  subtitle: {
    color: C.muted,
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 15,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: C.text,
    minHeight: 64,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  cancelText: { color: C.textDim, fontSize: 13, fontWeight: "600" },
  confirmBtn: {
    backgroundColor: C.accent + "22",
    borderColor: C.accent + "66",
  },
  confirmText: { color: C.accent, fontSize: 13, fontWeight: "700" },
});
