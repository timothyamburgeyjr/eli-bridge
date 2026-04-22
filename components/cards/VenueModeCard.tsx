import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    venue?: string;
    venueName?: string;
    venueType?: string;
    note: string;
  };
}

export function VenueModeCard({ msg }: Props) {
  const venue = msg.venue ?? msg.venueName ?? "";
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Text style={{ fontSize: 16 }}>🏟️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>VenueMode active · {venue}</Text>
          <Text style={styles.note}>{msg.note}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(124,92,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.25)",
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  title: { fontSize: 12, color: C.accent, fontWeight: "600", marginBottom: 2 },
  note: { fontSize: 11, color: C.muted, lineHeight: 16 },
});
