import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    time: string;
    condition?: string;
    conditions?: string;
    temperature?: number;
    alert?: string;
  };
}

export function WeatherCard({ msg }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const condition =
    msg.condition ??
    (msg.conditions
      ? msg.temperature
        ? `${msg.conditions} · ${msg.temperature}°F`
        : msg.conditions
      : "");
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.card}>
        <Text style={styles.header}>☁️ Weather Update · {msg.time}</Text>
        <Text style={styles.condition}>{condition}</Text>
        {msg.alert ? <Text style={styles.alert}>⚠️ {msg.alert}</Text> : null}
        <Pressable onPress={() => setDismissed(true)} style={styles.dismissBtn}>
          <Text style={{ color: C.muted, fontSize: 11 }}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(56,189,248,0.06)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.25)",
    borderLeftWidth: 3,
    borderLeftColor: C.sky,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  header: {
    fontSize: 10,
    color: C.sky,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  condition: { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 4 },
  alert: { fontSize: 12, color: C.textDim, lineHeight: 20, marginBottom: 8 },
  dismissBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
});
