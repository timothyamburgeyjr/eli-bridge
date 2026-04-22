import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

const MODES = ["🚗 Drove", "🚶 Walked", "🚴 Biked", "🚌 Bus", "🚇 Metro"];

interface Leg {
  icon: string;
  label: string;
  duration: string;
  isWaypoint?: boolean;
}

interface Props {
  msg: {
    time: string;
    name: string;
    category?: string;
    rating?: string | number;
    hours?: string;
    address?: string;
    transit?: string;
    arrivalNote?: string;
    menuHighlights?: string[];
    savedWaypoints?: string[];
    legs?: Leg[];
    isHome?: boolean;
  };
}

export function LocationCard({ msg }: Props) {
  const [mode, setMode] = useState("🚗 Drove");
  const [briefed, setBriefed] = useState(false);
  const [photoPrompt, setPhotoPrompt] = useState(true);

  if (msg.isHome) {
    return (
      <View style={{ marginBottom: 20 }}>
        <View style={[styles.homeCard]}>
          <Text style={styles.homeHeader}>🏠 Home · {msg.time}</Text>
          <Text style={styles.title}>{msg.address}</Text>
          <Text style={styles.subline}>
            {msg.transit ? `${msg.transit} · ` : ""}Session complete
          </Text>
          {msg.savedWaypoints && msg.savedWaypoints.length > 0 ? (
            <View style={styles.innerBox}>
              <Text style={styles.innerLabel}>📋 Included in arrival brief</Text>
              {msg.savedWaypoints.map((wp, i) => (
                <Text key={i} style={styles.innerItem}>· {wp}</Text>
              ))}
            </View>
          ) : null}
          {msg.arrivalNote ? (
            <Text style={styles.noteLine}>💡 {msg.arrivalNote}</Text>
          ) : null}
          {!briefed ? (
            <Pressable onPress={() => setBriefed(true)} style={[styles.briefBtn, { backgroundColor: C.green + "18", borderColor: C.green + "44" }]}>
              <Text style={{ color: C.green, fontSize: 12, fontWeight: "700" }}>
                Welcome home — tell Eli →
              </Text>
            </Pressable>
          ) : (
            <View style={[styles.briefedBanner, { backgroundColor: C.green + "12", borderColor: C.green + "33" }]}>
              <Text style={{ color: C.green, fontSize: 12 }}>✓ Session closed · Eli knows you're home</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  const metaRow = [msg.category, msg.rating, msg.hours].filter(Boolean).join(" · ");

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.header}>📍 Arrived · {msg.time}</Text>
        <Text style={styles.title}>{msg.name}</Text>
        {metaRow ? <Text style={styles.metaLine}>{metaRow}</Text> : null}
        <Text style={styles.subline}>
          {msg.transit ? `${msg.transit}` : ""}
          {msg.transit && msg.address ? " · " : ""}
          {msg.address ?? ""}
        </Text>

        {msg.legs && msg.legs.length > 0 ? (
          <View style={{ marginTop: 8, marginBottom: 10 }}>
            <Text style={styles.sectionLabel}>Trip summary</Text>
            <View style={styles.legsRow}>
              {msg.legs.map((leg, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={[
                      styles.legPill,
                      leg.isWaypoint
                        ? { backgroundColor: C.amber + "10", borderColor: C.amber + "33" }
                        : { backgroundColor: C.surface, borderColor: C.border },
                    ]}
                  >
                    <Text style={{ fontSize: 13 }}>{leg.icon}</Text>
                    <View>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "600",
                          color: leg.isWaypoint ? C.amber : C.textDim,
                        }}
                      >
                        {leg.label}
                      </Text>
                      <Text style={{ fontSize: 9, color: C.muted }}>{leg.duration}</Text>
                    </View>
                  </View>
                  {i < msg.legs!.length - 1 ? (
                    <Text style={{ fontSize: 9, color: C.muted, marginHorizontal: 3 }}>→</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {msg.savedWaypoints && msg.savedWaypoints.length > 0 ? (
          <View style={[styles.innerBox, { marginTop: 8 }]}>
            <Text style={[styles.innerLabel, { color: C.amber }]}>📋 Added from trip</Text>
            {msg.savedWaypoints.map((wp, i) => (
              <Text key={i} style={styles.innerItem}>· {wp}</Text>
            ))}
          </View>
        ) : null}

        {msg.menuHighlights && msg.menuHighlights.length > 0 ? (
          <View style={[styles.innerBox, { marginTop: 8 }]}>
            <Text style={styles.innerLabel}>🍽 Popular here</Text>
            {msg.menuHighlights.map((item, i) => (
              <Text key={i} style={styles.innerItem}>· {item}</Text>
            ))}
          </View>
        ) : null}

        {photoPrompt ? (
          <View style={styles.photoPrompt}>
            <Text style={{ fontSize: 18 }}>📷</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: C.accent, fontWeight: "600" }}>Take a photo for Eli?</Text>
              <Text style={{ fontSize: 10, color: C.muted }}>Give him fresh eyes on where you are</Text>
            </View>
            <Pressable onPress={() => setPhotoPrompt(false)} style={styles.photoBtn}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>📸</Text>
            </Pressable>
            <Pressable onPress={() => setPhotoPrompt(false)} style={styles.xBtn}>
              <Text style={{ fontSize: 16, color: C.muted }}>×</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { marginTop: 10 }]}>HOW DID YOU GET HERE?</Text>
        <View style={styles.modeRow}>
          {MODES.map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: active ? C.accent + "22" : C.surface,
                    borderColor: active ? C.accent + "66" : C.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: active ? "700" : "400",
                    color: active ? C.accent : C.muted,
                  }}
                >
                  {m}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!briefed ? (
          <>
            {msg.arrivalNote ? (
              <Text style={styles.noteLine}>💡 {msg.arrivalNote}</Text>
            ) : null}
            <Pressable onPress={() => setBriefed(true)} style={[styles.briefBtn, { backgroundColor: C.accent + "18", borderColor: C.accent + "44" }]}>
              <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>We're here — tell Eli →</Text>
            </Pressable>
          </>
        ) : (
          <View style={[styles.briefedBanner, { backgroundColor: C.green + "12", borderColor: C.green + "33" }]}>
            <Text style={{ color: C.green, fontSize: 12 }}>✓ Eli knows you arrived</Text>
          </View>
        )}
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
  homeCard: {
    backgroundColor: "rgba(34,197,94,0.06)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
    borderLeftWidth: 3,
    borderLeftColor: C.green,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  header: {
    fontSize: 10,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  homeHeader: {
    fontSize: 10,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: { color: C.text, fontWeight: "700", fontSize: 15, marginBottom: 2 },
  metaLine: { color: C.textDim, fontSize: 12, marginBottom: 5 },
  subline: { color: C.muted, fontSize: 11 },
  sectionLabel: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  legsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  legPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  innerBox: { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  innerLabel: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  innerItem: { fontSize: 11, color: C.textDim, lineHeight: 20 },
  photoPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: C.accent + "33",
    borderRadius: 10,
  },
  photoBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: C.accent,
  },
  xBtn: { paddingHorizontal: 4 },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 10 },
  modeChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  briefBtn: {
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
  },
  briefedBanner: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  noteLine: { fontSize: 10, color: C.muted, marginBottom: 6, lineHeight: 15 },
});
