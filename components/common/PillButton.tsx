import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  icon: string;
  label: string;
  warn?: boolean;
}

export function Pill({ icon, label, warn }: Props) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: warn ? C.amber + "18" : "rgba(255,255,255,0.07)",
          borderColor: warn ? C.amber + "55" : "rgba(255,255,255,0.12)",
        },
      ]}
    >
      <Text style={[styles.text, { color: warn ? C.amber : "rgba(255,255,255,0.55)" }]}>
        {icon} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: { fontSize: 10 },
});
