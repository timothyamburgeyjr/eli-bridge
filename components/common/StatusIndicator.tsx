import React from "react";
import { View, Text } from "react-native";
import { C } from "@/constants/theme";

type Status = "green" | "amber" | "red";

interface Props {
  status: Status;
  label: string;
}

const COLOR: Record<Status, string> = {
  green: C.green,
  amber: C.amber,
  red: C.red,
};

export function StatusIndicator({ status, label }: Props) {
  const color = COLOR[status];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 1,
          shadowRadius: 3,
        }}
      />
      <Text style={{ fontSize: 10, color }}>{label}</Text>
    </View>
  );
}
