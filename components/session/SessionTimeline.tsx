import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

export interface TimelineEntry {
  time: string;
  icon: string;
  label: string;
  sub?: string;
}

export interface TimelineStat {
  value: string;
  label: string;
}

interface Props {
  visible: boolean;
  entries: TimelineEntry[];
  stats: TimelineStat[];
  onClose: () => void;
}

export function SessionTimeline({ visible, entries, stats, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Session Timeline</Text>
            <View style={styles.statsRow}>
              {stats.map((s) => (
                <View key={s.label} style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: C.accent }}>{s.value}</Text>
                  <Text style={{ fontSize: 10, color: C.muted }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {entries.map((entry, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                <View style={{ alignItems: "center" }}>
                  <View style={styles.iconDot}>
                    <Text style={{ fontSize: 14 }}>{entry.icon}</Text>
                  </View>
                  {i < entries.length - 1 && (
                    <View
                      style={{
                        width: 1,
                        flex: 1,
                        backgroundColor: C.border,
                        marginTop: 4,
                        minHeight: 20,
                      }}
                    />
                  )}
                </View>
                <View style={{ paddingTop: 4, flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.text }}>{entry.label}</Text>
                  {entry.sub ? (
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{entry.sub}</Text>
                  ) : null}
                  <Text style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{entry.time}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "78%",
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 20 },
  iconDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
