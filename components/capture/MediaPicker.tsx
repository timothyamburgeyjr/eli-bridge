import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import type { CaptureMode } from "./CaptureModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPickMode: (m: CaptureMode) => void;
}

const OPTIONS: { mode: CaptureMode; icon: string; label: string; hint?: string }[] = [
  { mode: "photo", icon: "📷", label: "Take Photo", hint: "+ 5s AudioSnap" },
  { mode: "audio", icon: "🎙️", label: "Record Audio" },
  { mode: "scene", icon: "🎬", label: "Capture Scene", hint: "Silent context push" },
];

export function MediaPicker({ visible, onClose, onPickMode }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop} />
      <View style={styles.sheet}>
        {OPTIONS.map((o, i) => (
          <Pressable
            key={o.mode}
            onPress={() => onPickMode(o.mode)}
            style={[
              styles.row,
              o.mode === "scene" ? styles.sceneRow : null,
              i < OPTIONS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: C.border } : null,
            ]}
          >
            <Text style={styles.icon}>{o.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, o.mode === "scene" ? { color: C.accent, fontWeight: "600" } : null]}>
                {o.label}
              </Text>
              {o.hint ? <Text style={styles.hint}>{o.hint}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: "absolute",
    bottom: 82,
    left: 14,
    minWidth: 240,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sceneRow: { backgroundColor: C.accent + "10" },
  icon: { fontSize: 20 },
  label: { fontSize: 13, color: C.text, fontWeight: "500" },
  hint: { fontSize: 10, color: C.muted, marginTop: 1 },
});
