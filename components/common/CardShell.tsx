import React, { ReactNode } from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  children: ReactNode;
  accentColor?: string;
  tintBg?: string;
  borderLeft?: boolean;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function CardShell({
  children,
  accentColor,
  tintBg,
  borderLeft,
  centered,
  style,
}: Props) {
  const color = accentColor ?? C.border;
  return (
    <View style={[{ marginBottom: 16, alignItems: centered ? "center" : "stretch" }]}>
      <View
        style={[
          {
            backgroundColor: tintBg ?? C.raised,
            borderColor: accentColor ? color + "33" : C.border,
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 11,
          },
          borderLeft ? { borderLeftWidth: 3, borderLeftColor: color } : null,
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
