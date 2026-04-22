import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    title?: string;
    eventName?: string;
    eventTime: string;
    countdown?: string;
    timeUntil?: string;
    location?: string;
  };
}

export function CalendarCard({ msg }: Props) {
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const title = msg.title ?? msg.eventName ?? "";
  const countdown = msg.countdown ?? msg.timeUntil ?? "";
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.card}>
        <Text style={styles.header}>📅 {countdown}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subline}>
          {msg.eventTime}
          {msg.location ? ` · ${msg.location}` : ""}
        </Text>
        <View style={styles.actions}>
          {!sent ? (
            <Pressable onPress={() => setSent(true)} style={styles.sendBtn}>
              <Text style={{ color: C.amber, fontSize: 12, fontWeight: "700" }}>
                Tell Eli I'm heading in
              </Text>
            </Pressable>
          ) : (
            <View style={styles.sentBanner}>
              <Text style={{ color: C.green, fontSize: 12 }}>✓ Eli knows</Text>
            </View>
          )}
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
    backgroundColor: C.amber + "08",
    borderWidth: 1,
    borderColor: C.amber + "44",
    borderLeftWidth: 3,
    borderLeftColor: C.amber,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  header: {
    fontSize: 10,
    color: C.amber,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: { color: C.text, fontWeight: "700", fontSize: 14, marginBottom: 2 },
  subline: { color: C.textDim, fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  sendBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.amber + "18",
    borderWidth: 1,
    borderColor: C.amber + "44",
    alignItems: "center",
  },
  sentBanner: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.green + "12",
    borderWidth: 1,
    borderColor: C.green + "33",
    alignItems: "center",
  },
  dismissBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
