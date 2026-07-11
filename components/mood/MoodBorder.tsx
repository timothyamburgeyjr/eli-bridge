import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { MOODS } from "@/constants/moods";
import { useMoodLabel, useMoodEnergy } from "@/stores/moodStore";
import { useSettings } from "@/stores/settingsStore";

/**
 * The mood, as a slow pulse around the edge of the whole app.
 *
 * Deliberately built on RN core `Animated`, not Reanimated. Reanimated is
 * installed and babel-wired but has zero imports anywhere in this codebase —
 * lighting up an unused native dependency for the first time is a poor trade
 * for one opacity loop that core Animated does identically well, on the same
 * UI thread. ConversationOverlay already runs this exact shape in production.
 *
 * The trick that keeps it fully native-driven: `borderColor` is NOT
 * native-driver-able, so we don't animate it. Only opacity animates. Color
 * changes come from React state and — thanks to the 45s dwell floor in the
 * store — happen at most once every 45 seconds.
 *
 * Conversation Mode gets invisibility for free: that overlay is a <Modal>, so
 * it renders in a separate Android window above this one. Which is correct —
 * Tim's driving, and a pulsing rim in his peripheral vision is a hazard.
 */
export function MoodBorder() {
  const enabled = useSettings((s) => s.moodEnabled);
  const label = useMoodLabel();
  const energy = useMoodEnergy();
  const pulse = useRef(new Animated.Value(0)).current;

  // Quantize to 5 steps so EMA drift of 0.01 doesn't restart the loop.
  const q = Math.round(Math.min(1, Math.max(0, energy)) * 4) / 4;

  useEffect(() => {
    if (!enabled) return;
    const periodMs = 2600 - q * 1500; // serene ≈2.6s … charged ≈1.1s
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: periodMs / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: periodMs / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [enabled, q, pulse]);

  if (!enabled) return null;

  const color = MOODS[label].color;
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1 + 0.1 * q, 0.22 + 0.38 * q],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      {/* Two nested rings: a wide, faint bloom plus a thin solid edge. Cheaper
          and better-looking than an Android elevation shadow, which can't do
          inner glow anyway. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: 12, borderColor: color + "1F" },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: 2.5, borderColor: color },
        ]}
      />
    </Animated.View>
  );
}
