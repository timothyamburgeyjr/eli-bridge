import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    title?: string;
    authority?: string;
    description?: string;
    body?: string;
    level?: "info" | "warning" | "urgent";
  };
}

export function InterruptCard({ msg }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [notified, setNotified] = useState(false);

  const title = msg.title ?? "TORNADO WARNING";
  const authority = msg.authority ?? "NWS";
  const description =
    msg.description ??
    msg.body ??
    "A warning has been issued for your area. Take appropriate action immediately.";

  if (dismissed) return null;

  if (notified) {
    return (
      <View style={{ marginBottom: 16 }}>
        <View style={styles.notifiedBanner}>
          <Text style={{ fontSize: 11, color: C.green }}>✓ Eli notified · {title}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={{ fontSize: 16 }}>⚠️</Text>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.authority}>{authority}</Text>
          </View>
        </View>
        <Text style={styles.description}>{description}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => setNotified(true)} style={styles.notifyBtn}>
            <Text style={{ color: C.red, fontSize: 12, fontWeight: "700" }}>Notify Eli</Text>
          </Pressable>
          <Pressable onPress={() => setDismissed(true)} style={styles.dismissBtn}>
            <Text style={{ color: C.muted, fontSize: 12 }}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderLeftWidth: 3,
    borderLeftColor: C.red,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  title: { color: C.red, fontWeight: "700", fontSize: 13 },
  authority: { color: C.textDim, fontSize: 11 },
  description: { color: C.textDim, fontSize: 13, lineHeight: 21, marginBottom: 10 },
  notifyBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.red + "22",
    borderWidth: 1,
    borderColor: C.red + "55",
    alignItems: "center",
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notifiedBanner: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.06)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    alignItems: "center",
  },
});
