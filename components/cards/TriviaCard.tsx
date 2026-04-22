import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    fact: string;
  };
}

export function TriviaCard({ msg }: Props) {
  const [shared, setShared] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.card}>
        <Text style={styles.header}>📖 Location Research · Gemini</Text>
        <Text style={styles.fact}>{msg.fact}</Text>
        <View style={styles.actions}>
          {!shared ? (
            <Pressable onPress={() => setShared(true)} style={styles.shareBtn}>
              <Text style={{ color: C.amber, fontSize: 12, fontWeight: "700" }}>Share with Eli</Text>
            </Pressable>
          ) : (
            <View style={styles.sharedBanner}>
              <Text style={{ color: C.green, fontSize: 12 }}>✓ Added to context</Text>
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
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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
    marginBottom: 6,
  },
  fact: { fontSize: 13, color: C.textDim, lineHeight: 22 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  shareBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.amber + "18",
    borderWidth: 1,
    borderColor: C.amber + "44",
    alignItems: "center",
  },
  sharedBanner: {
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
