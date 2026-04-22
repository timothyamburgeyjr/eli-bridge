import React, { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    time: string;
    photoPaths?: string[];
    note?: string;
    richText?: string;
    kindroidScene?: string;
  };
}

export function SceneCard({ msg }: Props) {
  const [expanded, setExpanded] = useState(false);
  const photos = msg.photoPaths ?? [];
  const hasText = !!msg.richText;
  const preview = msg.richText?.slice(0, 140).trim();

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.icon}>🎬</Text>
          <Text style={styles.title}>Scene captured</Text>
          <Text style={styles.time}>{msg.time}</Text>
        </View>

        {msg.note ? <Text style={styles.note}>"{msg.note}"</Text> : null}

        {photos.length > 0 ? (
          <View style={styles.thumbStrip}>
            {photos.map((p, i) => (
              <Image key={i} source={{ uri: p }} style={styles.thumb} />
            ))}
          </View>
        ) : null}

        {hasText ? (
          <Pressable onPress={() => setExpanded((e) => !e)}>
            <Text style={styles.richText}>
              {expanded ? msg.richText : preview + (msg.richText!.length > 140 ? "…" : "")}
            </Text>
            {msg.richText!.length > 140 ? (
              <Text style={styles.expand}>{expanded ? "Collapse" : "Expand"}</Text>
            ) : null}
          </Pressable>
        ) : null}

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: C.green }]} />
          <Text style={styles.statusText}>
            Eli's backdrop updated. Next message will use this scene.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: {
    backgroundColor: "rgba(124,92,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.3)",
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  icon: { fontSize: 14 },
  title: {
    flex: 1,
    fontSize: 11,
    color: C.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
  },
  time: { fontSize: 10, color: C.muted },
  note: {
    fontSize: 12,
    color: C.textDim,
    fontStyle: "italic",
    marginBottom: 8,
    lineHeight: 18,
  },
  thumbStrip: { flexDirection: "row", gap: 6, marginBottom: 10 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
  },
  richText: { fontSize: 12, color: C.textDim, lineHeight: 19 },
  expand: {
    fontSize: 10,
    color: C.accent,
    marginTop: 4,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(124,92,255,0.15)",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, color: C.muted, flex: 1 },
});
