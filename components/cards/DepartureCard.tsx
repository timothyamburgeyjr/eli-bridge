import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { C } from "@/constants/theme";

const TRANSPORT_MODES = [
  { id: "car", icon: "🚗", label: "Car" },
  { id: "rideshare", icon: "🚕", label: "Rideshare" },
  { id: "cycling", icon: "🚴", label: "Cycling" },
  { id: "walking", icon: "🚶", label: "Walking" },
  { id: "bus", icon: "🚌", label: "Bus" },
  { id: "coach", icon: "🚎", label: "Coach" },
  { id: "train", icon: "🚆", label: "Train" },
  { id: "metro", icon: "🚇", label: "Metro" },
  { id: "tram", icon: "🚊", label: "Tram" },
  { id: "shuttle", icon: "🚐", label: "Shuttle" },
  { id: "flight", icon: "✈️", label: "Flight" },
  { id: "ferry", icon: "⛴️", label: "Ferry" },
  { id: "scooter", icon: "🛴", label: "Scooter" },
  { id: "motorcycle", icon: "🏍️", label: "Moto" },
];

interface Leg {
  icon: string;
  label: string;
  duration: string;
  note?: string;
}

interface Props {
  msg: {
    time: string;
    from_location: string;
    destination_set?: string;
    detectedMode?: string;
    briefed?: boolean;
    legs?: Leg[];
  };
}

export function DepartureCard({ msg }: Props) {
  const [mode, setMode] = useState(msg.detectedMode ?? "car");
  const [briefed, setBriefed] = useState(!!msg.briefed);

  const selected = TRANSPORT_MODES.find((m) => m.id === mode);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>
            {selected?.icon ?? "🚗"} On the move · {msg.time}
          </Text>
          <Text style={styles.headerMeta}>Activity Recognition</Text>
        </View>

        <View style={styles.destRow}>
          <Text style={{ fontSize: 16 }}>🗺️</Text>
          <View style={{ flex: 1 }}>
            {msg.destination_set ? (
              <>
                <Text style={styles.destMeta}>Google Maps · Active navigation</Text>
                <Text style={styles.destValue}>{msg.destination_set}</Text>
              </>
            ) : (
              <>
                <Text style={styles.destMeta}>Google Maps · No navigation active</Text>
                <Text style={{ fontSize: 13, color: C.textDim }}>
                  No destination set — just heading out
                </Text>
              </>
            )}
          </View>
        </View>

        {msg.legs ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionLabel}>Route plan · from Maps</Text>
            <View style={styles.legList}>
              {msg.legs.map((leg, i) => (
                <View
                  key={i}
                  style={[
                    styles.legRow,
                    i < msg.legs!.length - 1 ? { borderBottomWidth: 1, borderBottomColor: C.border } : null,
                  ]}
                >
                  <Text style={{ fontSize: 16 }}>{leg.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: C.text }}>
                      {leg.label}
                      {leg.note ? <Text style={{ color: C.muted, fontWeight: "400" }}> · {leg.note}</Text> : null}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: C.textDim }}>{leg.duration}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>How are you traveling?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
              {TRANSPORT_MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setMode(m.id)}
                    style={[
                      styles.modeChip,
                      {
                        backgroundColor: active ? C.accent + "22" : C.surface,
                        borderColor: active ? C.accent + "66" : C.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 13 }}>{m.icon}</Text>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: active ? "700" : "400",
                        color: active ? C.accent : C.muted,
                      }}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        {!briefed ? (
          <Pressable onPress={() => setBriefed(true)} style={styles.briefBtn}>
            <Text style={styles.briefBtnText}>Tell Eli we're heading out →</Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={styles.greenDot} />
            <Text style={styles.briefedText}>
              {msg.legs
                ? `Eli briefed · ${msg.legs.length}-leg route → ${msg.destination_set}`
                : `Eli briefed · ${selected?.icon} ${selected?.label}${msg.destination_set ? ` → ${msg.destination_set}` : " · no destination"}`}
            </Text>
          </View>
        )}

        <Text style={styles.footerNote}>Session stays live. Arrival card picks up from here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: {
    backgroundColor: "rgba(124,92,255,0.06)",
    borderColor: C.accent + "33",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerLabel: { fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: 1 },
  headerMeta: { fontSize: 10, color: C.muted },
  destRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.raised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  destMeta: { fontSize: 11, color: C.muted, marginBottom: 1 },
  destValue: { fontSize: 13, fontWeight: "600", color: C.text },
  sectionLabel: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  legList: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  legRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 7 },
  modeRow: { gap: 5, paddingRight: 14, marginBottom: 12 },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  briefBtn: {
    paddingVertical: 8,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
    borderRadius: 10,
    alignItems: "center",
  },
  briefBtnText: { color: C.accent, fontSize: 12, fontWeight: "700" },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  briefedText: { fontSize: 11, color: C.green, flex: 1 },
  footerNote: { marginTop: 8, fontSize: 10, color: C.muted, lineHeight: 15 },
});
