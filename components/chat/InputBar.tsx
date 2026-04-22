import React, { useState } from "react";
import { View, TextInput, Pressable, Text, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  mode: "session" | "oneoff";
  micActive: boolean;
  onMicTap: () => void;
  onAttachTap: () => void;
  onSend: (text: string) => void;
  pickerOpen?: boolean;
}

export function InputBar({ mode, micActive, onMicTap, onAttachTap, onSend, pickerOpen }: Props) {
  const [text, setText] = useState("");
  const hasSend = text.trim().length > 0;

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Pressable
          onPress={onAttachTap}
          style={[
            styles.circleBtn,
            {
              backgroundColor: pickerOpen ? C.accentDim : "transparent",
              borderColor: pickerOpen ? C.accent : C.border,
            },
          ]}
        >
          <Text style={{ fontSize: 20, color: pickerOpen ? C.accent : C.textDim, fontWeight: "300" }}>+</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={mode === "oneoff" ? "Drop a message for Eli…" : "Message Eli…"}
          placeholderTextColor={C.muted}
          multiline
          style={styles.input}
        />
        {hasSend ? (
          <Pressable onPress={handleSend} style={[styles.sendBtn, { backgroundColor: C.accent }]}>
            <Text style={{ fontSize: 18, color: "#fff" }}>↑</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onMicTap}
            style={[
              styles.sendBtn,
              {
                backgroundColor: micActive ? C.red + "22" : "transparent",
                borderWidth: 1.5,
                borderColor: micActive ? C.red : C.border,
              },
            ]}
          >
            <Text style={{ fontSize: 18 }}>🎙️</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.raised,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 28,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
