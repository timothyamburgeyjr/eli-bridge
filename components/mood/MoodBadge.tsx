import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { MOODS } from "@/constants/moods";
import { useMood, useMoodLabel } from "@/stores/moodStore";
import { useSettings } from "@/stores/settingsStore";

interface Props {
  onPress: () => void;
}

/** Compact mood pill for the session header. Tap → the breakdown sheet. */
export function MoodBadge({ onPress }: Props) {
  const enabled = useSettings((s) => s.moodEnabled);
  const label = useMoodLabel();
  const confidence = useMood((s) => s.confidence);

  if (!enabled) return null;

  const def = MOODS[label];
  // A low-confidence read still colors the border (it's ambient), but the badge
  // states a claim in words — so it stays muted until we actually mean it.
  const weak = confidence < 0.45;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.pill,
        {
          backgroundColor: def.color + (weak ? "10" : "1A"),
          borderColor: def.color + (weak ? "33" : "66"),
        },
      ]}
    >
      <Text style={[styles.text, { color: def.color, opacity: weak ? 0.7 : 1 }]}>
        {def.emoji} {cap(label)}
      </Text>
    </Pressable>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
    borderWidth: 1,
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
  },
});
