import React from "react";
import { Text } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  emote: string;
}

export function EmoteBubble({ emote }: Props) {
  return (
    <Text
      style={{
        color: C.emote,
        fontStyle: "italic",
        fontSize: 12.5,
        lineHeight: 20,
        marginBottom: 7,
      }}
    >
      _(* {emote} *)_
    </Text>
  );
}
