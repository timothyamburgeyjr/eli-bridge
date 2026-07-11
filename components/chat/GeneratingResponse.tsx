import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import { useAudio } from "@/stores/audioStore";
import { useCompanionName } from "@/session/SessionStore";

/**
 * "Generating response…" indicator that sits inside the chat scroll, above
 * the latest message, while the send pipeline is running. Cycles its label
 * through the three legs of the pipeline so Tim can see which stage he's
 * waiting on:
 *
 *   chatStatus === "assembling"               → "Gemini · Building emote…"
 *   chatStatus === "sending"                  → "Eli · Awaiting reply…"
 *   audio cache entry status "generating"     → "ElevenLabs · Synthesizing voice…"
 *
 * Rendered as null (zero footprint) when no stage is active. Returns to null
 * naturally when the pipeline lands its result or the user aborts — both
 * paths reset the stores back to idle, which this component subscribes to.
 *
 * The animated audio-wave bars on the right play continuously while the
 * component is visible; they pause/unmount cleanly when it hides.
 */
export function GeneratingResponse() {
  const who = useCompanionName();
  const chatStatus = useChat((s) => s.status);
  const audioCurrentId = useAudio((s) => s.currentMessageId);
  const audioEntryStatus = useAudio((s) =>
    s.currentMessageId ? s.cache[s.currentMessageId]?.status : undefined
  );

  // Pick the current stage label — Gemini comes first chronologically,
  // followed by Kindroid (Eli), then ElevenLabs synth. Hidden when none of
  // those apply.
  let stage: { label: string; sub: string } | null = null;
  if (chatStatus === "assembling") {
    stage = { label: "Gemini", sub: "Building emote…" };
  } else if (chatStatus === "sending") {
    stage = { label: who, sub: "Awaiting reply…" };
  } else if (audioCurrentId && audioEntryStatus === "generating") {
    stage = { label: "ElevenLabs", sub: "Synthesizing voice…" };
  }

  if (!stage) return null;

  return (
    <View style={styles.row}>
      <View style={styles.iconDot}>
        <Text style={styles.sparkle}>✦</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.headline}>
          <Text style={styles.stageLabel}>{stage.label}</Text>
          {"  ·  "}
          <Text style={styles.stageSub}>{stage.sub}</Text>
        </Text>
      </View>
      <WaveBars />
    </View>
  );
}

/**
 * Five animated vertical bars whose heights cycle out of phase, giving the
 * "audio is processing" feel from the mockup. Uses RN's Animated since
 * Reanimated's worklet shape is overkill for five looping timings.
 */
function WaveBars() {
  // One Animated.Value per bar, primed at 0.4 so the initial frame is
  // already mid-loop rather than starting from a flat line.
  const bars = useRef([0.4, 0.7, 0.5, 0.8, 0.45].map((v) => new Animated.Value(v))).current;

  useEffect(() => {
    const loops = bars.map((v, i) => {
      const cycle = Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 280 + i * 40,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false, // height isn't transform-friendly
          }),
          Animated.timing(v, {
            toValue: 0.3,
            duration: 320 + i * 30,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );
      cycle.start();
      return cycle;
    });
    return () => loops.forEach((l) => l.stop());
  }, [bars]);

  return (
    <View style={styles.wave}>
      {bars.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              height: v.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 18],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  iconDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accent + "22",
    borderWidth: 1,
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  sparkle: { fontSize: 14, color: C.accent },
  headline: { fontSize: 13, lineHeight: 17 },
  stageLabel: { color: C.accent, fontWeight: "700" },
  stageSub: { color: C.textDim, fontWeight: "500" },
  wave: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 22,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: C.accent,
  },
});
