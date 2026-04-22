import React, { useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

type State = "prompt" | "naming" | "enrolled" | "dismissed";

interface Props {
  msg: {
    variant?: "voice" | "face";
    quote?: string;
    faceNote?: string;
    confidence?: string;
    suggestion?: string;
  };
}

export function UnknownPersonCard({ msg }: Props) {
  const [state, setState] = useState<State>("prompt");
  const [name, setName] = useState("");
  const isVoice = msg.variant !== "face";

  if (state === "dismissed") return null;

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={{ fontSize: 14 }}>{isVoice ? "🎙️" : "🧑"}</Text>
          <Text style={styles.headTitle}>
            {isVoice ? "New voice detected" : "New face detected"}
          </Text>
        </View>

        {isVoice ? (
          <View>
            <Text style={styles.quote}>
              {msg.quote ?? "Someone nearby said something — I couldn't make it out clearly."}
            </Text>
            <Text style={styles.meta}>Sample 1 of 3 — needs more encounters to enroll</Text>
          </View>
        ) : (
          <View style={styles.faceRow}>
            <View style={styles.faceThumb}>
              <Text style={{ fontSize: 18 }}>🧑</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.faceNote}>
                {msg.faceNote ?? "Unrecognized person in your photo"}
              </Text>
              {msg.confidence ? (
                <Text style={styles.meta}>Confidence: {msg.confidence}</Text>
              ) : null}
            </View>
          </View>
        )}

        {msg.suggestion && state === "prompt" ? (
          <Text style={styles.suggestion}>Is this {msg.suggestion}?</Text>
        ) : null}

        {state === "prompt" ? (
          <View style={styles.actionRow}>
            <Pressable onPress={() => setState("naming")} style={styles.addBtn}>
              <Text style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}>Add Person</Text>
            </Pressable>
            <Pressable onPress={() => setState("dismissed")} style={styles.ignoreBtn}>
              <Text style={{ color: C.muted, fontSize: 12 }}>Ignore</Text>
            </Pressable>
          </View>
        ) : null}

        {state === "naming" ? (
          <View style={styles.namingRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Who is this?"
              placeholderTextColor={C.muted}
              style={styles.nameInput}
            />
            <Pressable
              onPress={() => {
                if (name.trim()) setState("enrolled");
              }}
              style={[styles.confirmBtn, { opacity: name.trim() ? 1 : 0.4 }]}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Add</Text>
            </Pressable>
          </View>
        ) : null}

        {state === "enrolled" ? (
          <Text style={styles.enrolledText}>
            ✓ {name} added to People {isVoice ? "🎙️" : "📷"}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  headTitle: { fontSize: 12, fontWeight: "700", color: C.text },
  quote: { fontSize: 12, color: C.textDim, fontStyle: "italic", marginBottom: 4 },
  meta: { fontSize: 10, color: C.muted, marginBottom: 10 },
  faceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  faceThumb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  faceNote: { fontSize: 12, color: C.textDim, fontStyle: "italic" },
  suggestion: { fontSize: 11, color: C.amber, marginBottom: 8 },
  actionRow: { flexDirection: "row", gap: 8 },
  addBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
    alignItems: "center",
  },
  ignoreBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  namingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    fontSize: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
  },
  confirmBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: "center",
  },
  enrolledText: { fontSize: 12, color: C.green },
});
