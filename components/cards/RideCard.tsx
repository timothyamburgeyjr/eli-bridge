import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    name?: string;
    rideName?: string;
    type?: string;
    rideType?: string;
    duration?: string;
    peakG?: string | number;
    topSpeed?: string;
  };
}

export function RideCard({ msg }: Props) {
  const [shared, setShared] = useState(false);
  const name = msg.name ?? msg.rideName ?? "";
  const type = msg.type ?? msg.rideType ?? "";
  const peakG = typeof msg.peakG === "number" ? `${msg.peakG}g` : msg.peakG;
  const stats = [type, msg.duration, peakG ? `${peakG} peak` : null, msg.topSpeed]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Text style={{ fontSize: 18 }}>🎢</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.stats}>{stats}</Text>
        </View>
        {!shared ? (
          <Pressable onPress={() => setShared(true)} style={styles.shareBtn}>
            <Text style={{ color: C.accent, fontSize: 11, fontWeight: "600" }}>Share</Text>
          </Pressable>
        ) : (
          <Text style={{ fontSize: 11, color: C.green, paddingRight: 4 }}>✓ Eli knows</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(124,92,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 13, fontWeight: "700", color: C.text },
  stats: { fontSize: 11, color: C.muted, marginTop: 1 },
  shareBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
  },
});
