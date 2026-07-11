import React from "react";
import { View, Text, Image } from "react-native";
import { C } from "@/constants/theme";
import type { Personality } from "@/constants/personalities";

interface Props {
  /** Omit when no session is active — falls back to a neutral gradient mark. */
  personality?: Personality;
  size?: number;
  fontSize?: number;
  /** Accent ring around the portrait. */
  ring?: boolean;
  /** Greyed-out treatment for a personality that can't be talked to yet. */
  dimmed?: boolean;
}

export function PersonaAvatar({
  personality,
  size = 36,
  fontSize = 15,
  ring = false,
  dimmed = false,
}: Props) {
  const radius = size / 2;
  const accent = personality?.accent ?? C.accent;
  const ringWidth = ring ? Math.max(2, Math.round(size * 0.055)) : 0;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: personality?.bubble ?? C.raised,
        borderWidth: ringWidth,
        borderColor: dimmed ? C.border : accent,
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      {personality ? (
        <>
          <Image
            source={personality.face}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
          {/* RN has no cheap greyscale filter; a flat scrim over a lowered
              opacity reads as "unavailable" clearly enough at avatar sizes. */}
          {dimmed && (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: C.bg + "80",
              }}
            />
          )}
        </>
      ) : (
        <FallbackMark size={size} fontSize={fontSize} />
      )}
    </View>
  );
}

/** No personality selected yet — the app's own mark, not anyone's face. */
function FallbackMark({ size, fontSize }: { size: number; fontSize: number }) {
  return (
    <>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: size / 2,
          backgroundColor: C.accent,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: size / 2,
          backgroundColor: "#1D4B8E",
          opacity: 0.5,
        }}
      />
      <Text style={{ fontSize, fontWeight: "900", color: "#fff" }}>✦</Text>
    </>
  );
}
