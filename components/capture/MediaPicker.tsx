import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import type { CaptureMode } from "./CaptureModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPickMode: (m: CaptureMode) => void;
  /** Triggered by the "📍 Save place" entry — distinct flow from the
   *  camera/audio modes; opens the PlacePickerModal in the parent. */
  onPickPlace: () => void;
}

type Action =
  | { kind: "capture"; mode: CaptureMode; icon: string; label: string; hint?: string; emphasized?: boolean }
  | { kind: "place"; icon: string; label: string; hint?: string };

const OPTIONS: Action[] = [
  { kind: "capture", mode: "photo", icon: "📷", label: "Take Photo", hint: "+ 5s AudioSnap" },
  { kind: "capture", mode: "audio", icon: "🎙️", label: "Record Audio" },
  { kind: "capture", mode: "scene", icon: "🎬", label: "Capture Scene", hint: "Silent context push", emphasized: true },
  { kind: "place", icon: "📍", label: "Save Place", hint: "Pick from nearby POIs" },
];

export function MediaPicker({ visible, onClose, onPickMode, onPickPlace }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop} />
      <View style={styles.sheet}>
        {OPTIONS.map((o, i) => (
          <Pressable
            key={o.kind === "capture" ? o.mode : "place"}
            onPress={() => {
              if (o.kind === "capture") onPickMode(o.mode);
              else onPickPlace();
            }}
            style={[
              styles.row,
              o.kind === "capture" && o.emphasized ? styles.sceneRow : null,
              i < OPTIONS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: C.border } : null,
            ]}
          >
            <Text style={styles.icon}>{o.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.label,
                  o.kind === "capture" && o.emphasized ? { color: C.accent, fontWeight: "600" } : null,
                ]}
              >
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
