import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { useCompanionName } from "@/stores/personaStore";

/**
 * Summary card emitted after Tim taps "📋 Brief Eli on N saved places".
 * Shows the rolled-up list of places that were briefed plus Tim's optional
 * one-liner so Tim has a record of what Eli now knows.
 */

interface Props {
  msg: {
    time: string;
    places: { name: string; category?: string; time: string }[];
    note?: string;
  };
}

export function BriefBundleCard({ msg }: Props) {
  const who = useCompanionName();
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.card}>
        <Text style={styles.header}>
          {`📋 Briefed ${who} · ${msg.time}`}
        </Text>
        <Text style={styles.title}>
          {msg.places.length} {msg.places.length === 1 ? "place" : "places"}{" "}
          shared
        </Text>
        <View style={styles.list}>
          {msg.places.map((p, i) => (
            <Text key={i} style={styles.item}>
              · {p.time} {p.name}
              {p.category ? (
                <Text style={styles.itemMeta}> ({p.category})</Text>
              ) : null}
            </Text>
          ))}
        </View>
        {msg.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteLabel}>Your framing</Text>
            <Text style={styles.note}>"{msg.note}"</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.green + "0D",
    borderWidth: 1,
    borderColor: C.green + "33",
    borderLeftWidth: 3,
    borderLeftColor: C.green,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  header: {
    fontSize: 10,
    color: C.green,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: "700",
  },
  title: { color: C.text, fontWeight: "700", fontSize: 14, marginBottom: 8 },
  list: { gap: 3 },
  item: { color: C.textDim, fontSize: 12, lineHeight: 18 },
  itemMeta: { color: C.muted, fontSize: 11 },
  noteBox: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.surface,
    borderRadius: 10,
  },
  noteLabel: {
    fontSize: 9,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  note: { color: C.textDim, fontSize: 12, fontStyle: "italic" },
});
