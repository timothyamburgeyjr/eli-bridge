import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";

/**
 * Card that represents a place Tim saved via the "📍 Save place" picker.
 * Three states:
 *   pending  — just dropped, two action buttons visible
 *   saved    — Tim chose "save for later"; will be included in next bundled
 *              brief; status pill shows "📋 Saved · awaiting brief"
 *   briefed  — Eli has been briefed (either individually or via bundle);
 *              terminal state with "✓ Briefed" pill
 */

interface Props {
  msg: {
    id: string;
    time: string;
    placeId: string;
    name: string;
    category?: string;
    address?: string;
    distanceM?: number;
    rating?: number;
    openNow?: boolean;
    placeStatus: "pending" | "saved" | "briefed";
  };
}

export function SavedPlaceCard({ msg }: Props) {
  const briefSavedPlace = useChat((s) => s.briefSavedPlace);
  const markPlaceSavedForBundle = useChat(
    (s) => s.markPlaceSavedForBundle
  );
  const sendStatus = useChat((s) => s.status);
  const sendInFlight = sendStatus === "assembling" || sendStatus === "sending";

  const meta = [
    msg.category,
    msg.rating ? `⭐ ${msg.rating.toFixed(1)}` : null,
    msg.openNow === false ? "closed" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const distance =
    msg.distanceM !== undefined
      ? msg.distanceM < 1000
        ? `${msg.distanceM}m away`
        : `${(msg.distanceM / 1000).toFixed(1)}km away`
      : null;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>📍 Saved · {msg.time}</Text>
          {msg.placeStatus === "saved" ? (
            <View style={[styles.pill, styles.pillSaved]}>
              <Text style={[styles.pillText, { color: C.amber }]}>
                📋 awaiting brief
              </Text>
            </View>
          ) : msg.placeStatus === "briefed" ? (
            <View style={[styles.pill, styles.pillBriefed]}>
              <Text style={[styles.pillText, { color: C.green }]}>
                ✓ briefed
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.title}>{msg.name}</Text>
        {meta ? <Text style={styles.metaLine}>{meta}</Text> : null}

        <View style={styles.subRow}>
          {msg.address ? (
            <Text style={styles.address} numberOfLines={1}>
              {msg.address}
            </Text>
          ) : null}
          {distance ? <Text style={styles.distance}>{distance}</Text> : null}
        </View>

        {msg.placeStatus === "pending" ? (
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => briefSavedPlace(msg.id)}
              disabled={sendInFlight}
              style={[
                styles.actionBtn,
                styles.briefBtn,
                sendInFlight ? { opacity: 0.4 } : null,
              ]}
            >
              <Text style={styles.briefText}>💬 Brief Eli now</Text>
            </Pressable>
            <Pressable
              onPress={() => markPlaceSavedForBundle(msg.id)}
              style={[styles.actionBtn, styles.saveBtn]}
            >
              <Text style={styles.saveText}>📋 Save for later</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  header: {
    fontSize: 10,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillSaved: {
    backgroundColor: C.amber + "12",
    borderColor: C.amber + "44",
  },
  pillBriefed: {
    backgroundColor: C.green + "14",
    borderColor: C.green + "44",
  },
  pillText: { fontSize: 10, fontWeight: "700" },
  title: {
    color: C.text,
    fontWeight: "700",
    fontSize: 15,
    marginBottom: 2,
  },
  metaLine: { color: C.textDim, fontSize: 12, marginBottom: 4 },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  address: { color: C.muted, fontSize: 11, flex: 1 },
  distance: { color: C.accent, fontSize: 11, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  briefBtn: {
    backgroundColor: C.accent + "18",
    borderColor: C.accent + "55",
  },
  briefText: { color: C.accent, fontSize: 12, fontWeight: "700" },
  saveBtn: {
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  saveText: { color: C.textDim, fontSize: 12, fontWeight: "600" },
});
