import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    title?: string;
    artist?: string;
    track?: string;
    autoShared?: boolean;
  };
}

export function NowPlayingCard({ msg }: Props) {
  const title = msg.title ?? msg.track ?? "";
  const artist = msg.artist ?? "";
  const autoShared = !!msg.autoShared;
  const [staged, setStaged] = useState(autoShared);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const emotePreview = `_(* ${title} by ${artist} playing *)_`;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.songRow}>
          <View style={styles.albumArt}>
            <Text style={{ fontSize: 15, color: "#fff" }}>♪</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
            <Text style={styles.artist}>{artist}</Text>
          </View>
          {!autoShared && !staged ? (
            <Pressable onPress={() => setDismissed(true)} hitSlop={6}>
              <Text style={{ color: C.muted, fontSize: 18, lineHeight: 18 }}>×</Text>
            </Pressable>
          ) : null}
        </View>

        {autoShared ? (
          <View style={styles.statusRow}>
            <Text style={{ color: C.green, fontSize: 11 }}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>Auto-woven into your context</Text>
              <Text style={styles.emotePreview}>{emotePreview}</Text>
            </View>
          </View>
        ) : !staged ? (
          <View style={{ gap: 7 }}>
            <View style={styles.previewBlock}>
              <Text style={styles.previewText}>{emotePreview}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable onPress={() => setStaged(true)} style={styles.addBtn}>
                <Text style={{ color: C.accent, fontSize: 11, fontWeight: "600" }}>Add to emote</Text>
              </Pressable>
              <Pressable onPress={() => setDismissed(true)} style={styles.notNowBtn}>
                <Text style={{ color: C.muted, fontSize: 11 }}>Not now</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <Text style={{ color: C.green, fontSize: 11 }}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>Staged for your next message</Text>
              <View style={styles.stagedPreview}>
                <Text style={styles.emotePreviewSmall}>{emotePreview}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  songRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  albumArt: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1DB954",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 12, fontWeight: "600", color: C.text },
  artist: { fontSize: 10, color: C.muted },
  statusRow: { flexDirection: "row", gap: 5 },
  statusLabel: { fontSize: 10, color: C.muted, lineHeight: 14 },
  emotePreview: { fontSize: 10, fontStyle: "italic", color: C.emote, marginTop: 2, lineHeight: 14 },
  emotePreviewSmall: { fontSize: 10, fontStyle: "italic", color: C.emote, lineHeight: 14 },
  previewBlock: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  previewText: { fontSize: 10, fontStyle: "italic", color: C.emote, lineHeight: 16 },
  stagedPreview: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 3,
  },
  addBtn: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
    alignItems: "center",
  },
  notNowBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
