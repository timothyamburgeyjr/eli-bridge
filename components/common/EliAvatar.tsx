import React from "react";
import { View, Text } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  size?: number;
  fontSize?: number;
}

export function EliAvatar({ size = 36, fontSize = 15 }: Props) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.eliGradFrom,
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: size / 2,
          backgroundColor: C.eliGradTo,
          opacity: 0.5,
        }}
      />
      <Text style={{ fontSize, fontWeight: "900", color: "#fff" }}>E</Text>
    </View>
  );
}
