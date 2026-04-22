import React from "react";
import { View, Text, Pressable, Image, StyleSheet, ScrollView } from "react-native";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import type { AttachmentKind } from "@/session/pendingAttachments";

const KIND_ICON: Record<AttachmentKind, string> = {
  image: "🖼️",
  audio: "🎵",
  video: "🎬",
};

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: "Photo",
  audio: "Audio",
  video: "Video",
};

export function StagingTray() {
  const items = useChat((s) => s.pending);
  const removeAttachment = useChat((s) => s.removeAttachment);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>
            {items.length} attachment{items.length === 1 ? "" : "s"} pending
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {items.map((item) => (
            <View key={item.id} style={styles.cell}>
              {item.kind === "image" ? (
                <Image source={{ uri: item.localPath }} style={styles.thumb} />
              ) : (
                <View style={styles.audioTile}>
                  <Text style={styles.audioIcon}>{KIND_ICON[item.kind]}</Text>
                  {item.duration ? (
                    <Text style={styles.audioDuration}>{item.duration}s</Text>
                  ) : (
                    <Text style={styles.audioLabel}>{KIND_LABEL[item.kind]}</Text>
                  )}
                </View>
              )}
              <Pressable
                onPress={() => removeAttachment(item.id)}
                hitSlop={8}
                style={styles.removeBadge}
              >
                <Text style={styles.removeX}>×</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  headerLabel: {
    fontSize: 10,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: { gap: 8, paddingHorizontal: 2 },
  cell: {
    position: "relative",
  },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
  },
  audioTile: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  audioIcon: { fontSize: 22 },
  audioDuration: { fontSize: 11, color: C.accent, fontWeight: "700" },
  audioLabel: { fontSize: 10, color: C.muted },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  removeX: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 15,
  },
});
