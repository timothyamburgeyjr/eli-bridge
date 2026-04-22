import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    time: string;
    title: string;
    date: string;
    duration: string;
    locations?: string[];
    soundtrack?: string[];
    preview?: string;
    previewQuote?: string;
  };
}

export function SessionJournalCard({ msg }: Props) {
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const preview = msg.preview ?? msg.previewQuote ?? "";
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.header}>📓 Session Journal · {msg.time}</Text>
        <Text style={styles.title}>{msg.title}</Text>
        <Text style={styles.meta}>
          {msg.date} · {msg.duration}
          {msg.locations ? ` · ${msg.locations.length} locations` : ""}
        </Text>
        {msg.soundtrack && msg.soundtrack.length > 0 ? (
          <View style={styles.innerBox}>
            <Text style={styles.innerLabel}>🎵 Trip soundtrack</Text>
            {msg.soundtrack.map((track, i) => (
              <Text key={i} style={styles.innerItem}>· {track}</Text>
            ))}
          </View>
        ) : null}
        {preview ? (
          <Text style={styles.preview}>"{preview}..."</Text>
        ) : null}
        <Text style={styles.footerNote}>
          💡 Gemini drafted this from your session · GPS track · messages · Now Playing log
        </Text>
        {!saved ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setSaved(true)} style={styles.saveBtn}>
              <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>Save to Vault →</Text>
            </Pressable>
            <Pressable onPress={() => setDismissed(true)} style={styles.discardBtn}>
              <Text style={{ color: C.muted, fontSize: 12 }}>Discard</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.savedBanner}>
            <Text style={{ color: C.green, fontSize: 12 }}>✓ Saved to Obsidian vault</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(124,92,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.3)",
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  header: {
    fontSize: 10,
    color: C.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: { color: C.text, fontWeight: "700", fontSize: 14, marginBottom: 2 },
  meta: { color: C.muted, fontSize: 11, marginBottom: 10 },
  innerBox: {
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  innerLabel: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  innerItem: { fontSize: 11, color: C.textDim, lineHeight: 20 },
  preview: {
    fontSize: 12,
    color: C.textDim,
    lineHeight: 20,
    marginBottom: 10,
    fontStyle: "italic",
    borderLeftWidth: 2,
    borderLeftColor: "rgba(124,92,255,0.2)",
    paddingLeft: 10,
  },
  footerNote: { fontSize: 10, color: C.muted, marginBottom: 8 },
  saveBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
    alignItems: "center",
  },
  discardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  savedBanner: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.green + "12",
    borderWidth: 1,
    borderColor: C.green + "33",
    alignItems: "center",
  },
});
