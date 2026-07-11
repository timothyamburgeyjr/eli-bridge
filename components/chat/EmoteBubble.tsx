import React from "react";
import { Text } from "react-native";
import { useEmoteColor } from "@/stores/moodStore";
import type { MoodLabel } from "@/constants/moods";

interface Props {
  emote: string;
  /** Mood this emote was written in. Undefined → the house violet. */
  moodLabel?: MoodLabel;
}

export function EmoteBubble({ emote, moodLabel }: Props) {
  const color = useEmoteColor(moodLabel);
  return (
    <Text
      style={{
        color,
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
