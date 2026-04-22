import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    description?: string;
  };
}

export function AudioSnapCard({ msg }: Props) {
  const [playing, setPlaying] = useState(false);
  const bars = useMemo(() => Array.from({ length: 40 }, () => 4 + Math.random() * 18), []);

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={{ fontSize: 14 }}>📸</Text>
          <Text style={styles.title}>AudioSnap</Text>
          <Text style={styles.tag}>~5s captured</Text>
        </View>
        <Text style={styles.desc}>
          {msg.description ?? "Ambient audio captured with photo"}
        </Text>
        <View style={styles.wave}>
          {bars.map((h, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: h,
                borderRadius: 1,
                marginHorizontal: 0.5,
                backgroundColor: playing ? C.accent : C.muted + "60",
              }}
            />
          ))}
        </View>
        <View style={styles.controls}>
          <Pressable
            onPress={() => setPlaying((p) => !p)}
            style={[
              styles.playBtn,
              {
                backgroundColor: playing ? C.accent + "18" : "transparent",
                borderColor: playing ? C.accent + "44" : C.border,
              },
            ]}
          >
            <Text style={{ color: playing ? C.accent : C.muted, fontSize: 11 }}>
              {playing ? "⏸ Pause" : "▶ Play"}
            </Text>
          </Pressable>
          <Text style={{ fontSize: 10, color: C.muted }}>Sent to Gemini with photo</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontSize: 12, fontWeight: "700", color: C.text, flex: 1 },
  tag: { fontSize: 10, color: C.muted },
  desc: { fontSize: 11, color: C.textDim, marginBottom: 6 },
  wave: {
    height: 28,
    borderRadius: 6,
    backgroundColor: C.bg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  controls: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  playBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
});
