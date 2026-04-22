import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

type WaypointState = "pending" | "told" | "saved";

interface Props {
  msg: {
    icon?: string;
    name: string;
    category: string;
    location?: string;
    duration?: string;
    openSession?: boolean;
    initialState?: WaypointState;
    briefSent?: string;
  };
}

export function WaypointCard({ msg }: Props) {
  const [state, setState] = useState<WaypointState>(msg.initialState ?? "pending");
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (state === "told") {
    return (
      <View style={{ marginBottom: 14 }}>
        <View style={[styles.stateBase, { backgroundColor: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.25)", borderLeftColor: C.green }]}>
          <View style={styles.iconHead}>
            <View style={styles.iconCircleSmall}>
              <Text style={{ fontSize: 14 }}>{msg.icon ?? "📍"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {msg.name}
                <Text style={styles.categoryDim}> · {msg.category}</Text>
              </Text>
              <Text style={styles.subLine}>
                {msg.location}
                {msg.duration ? ` · ${msg.duration}` : ""}
              </Text>
            </View>
            <View style={styles.statusPill}>
              <View style={[styles.dot, { backgroundColor: C.green }]} />
              <Text style={{ fontSize: 10, color: C.green, fontWeight: "600" }}>Told Eli</Text>
            </View>
          </View>
          {msg.briefSent ? (
            <Text style={styles.briefQuote}>"{msg.briefSent}"</Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (state === "saved") {
    return (
      <View style={{ marginBottom: 14 }}>
        <View style={[styles.stateBase, { backgroundColor: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.25)", borderLeftColor: C.amber }]}>
          <View style={styles.iconHead}>
            <View style={styles.iconCircleSmall}>
              <Text style={{ fontSize: 14 }}>{msg.icon ?? "📍"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {msg.name}
                <Text style={styles.categoryDim}> · {msg.category}</Text>
              </Text>
              <Text style={styles.subLine}>
                {msg.location}
                {msg.duration ? ` · ${msg.duration}` : ""}
              </Text>
            </View>
            <View style={styles.statusPill}>
              <View style={[styles.dot, { backgroundColor: C.amber }]} />
              <Text style={{ fontSize: 10, color: C.amber, fontWeight: "600" }}>Saved for arrival</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // pending
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.pendingCard}>
        <View style={[styles.iconHead, { marginBottom: 10 }]}>
          <View style={styles.iconCircleLarge}>
            <Text style={{ fontSize: 16 }}>{msg.icon ?? "📍"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {msg.name}
              <Text style={styles.categoryDim}> · {msg.category}</Text>
            </Text>
            <Text style={styles.subLine}>
              {msg.location}
              {msg.duration ? ` · ${msg.duration}` : ""}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable onPress={() => setState("told")} style={[styles.actionBtn, { backgroundColor: C.accent + "18", borderColor: C.accent + "44" }]}>
            <Text style={{ color: C.accent, fontSize: 11, fontWeight: "700" }}>Tell Eli</Text>
          </Pressable>
          {!msg.openSession && (
            <Pressable onPress={() => setState("saved")} style={[styles.actionBtn, { backgroundColor: C.amber + "12", borderColor: C.amber + "44" }]}>
              <Text style={{ color: C.amber, fontSize: 11, fontWeight: "700" }}>Save for Arrival</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setDismissed(true)} style={styles.dismissBtn}>
            <Text style={{ color: C.muted, fontSize: 14 }}>×</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stateBase: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  pendingCard: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  iconHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconCircleSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleLarge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 12, fontWeight: "600", color: C.text },
  categoryDim: { fontWeight: "400", color: C.muted },
  subLine: { fontSize: 10, color: C.muted },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  briefQuote: {
    fontSize: 11,
    color: C.textDim,
    fontStyle: "italic",
    lineHeight: 17,
    marginTop: 8,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(34,197,94,0.25)",
    marginLeft: 14,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  dismissBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
