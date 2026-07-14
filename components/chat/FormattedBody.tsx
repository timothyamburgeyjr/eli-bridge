import React from "react";
import { Text, StyleProp, TextStyle, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { useEmoteColor } from "@/stores/moodStore";
import type { MoodLabel } from "@/constants/moods";
import { parseSegments } from "@/session/formatContract";

interface Props {
  text: string;
  baseStyle?: StyleProp<TextStyle>;
  /** The mood this message was written in. Undefined on pre-mood messages. */
  moodLabel?: MoodLabel;
}

/**
 * The parsing and text utilities used to live here. They now live in
 * session/formatContract.ts, which imports nothing at all — the emote format is
 * a contract shared by the renderer, the packager and the verifier, and it kept
 * drifting while it was defined inside a React component that couldn't be tested.
 * Re-exported so the existing call sites don't care where it moved to.
 */
export {
  convertTimAsterisksToEmotes,
  extractEmoteContext,
  extractSpokenText,
  parseSegments,
  type Segment,
} from "@/session/formatContract";

/**
 * Renders a Kindroid-format message body with inline `_(*emote*)_` blocks
 * styled italic and dialog styled as normal text. Used for both Tim's
 * Gemini-composed messages and the companion's Kindroid replies.
 *
 * `moodLabel` is the mood this message was WRITTEN in, stamped at creation —
 * not the live mood. Reading the live mood here would repaint the whole
 * scrollback every time the weather turned.
 */
export function FormattedBody({ text, baseStyle, moodLabel }: Props) {
  const emoteColor = useEmoteColor(moodLabel);
  const segments = parseSegments(text);
  if (segments.length === 0) {
    return <Text style={[styles.dialog, baseStyle]}>{text}</Text>;
  }
  return (
    <Text style={[styles.dialog, baseStyle]}>
      {segments.map((seg, i) => {
        const needsSpace = i < segments.length - 1;
        if (seg.type === "emote") {
          return (
            // RN merges style arrays left→right, so the inline color wins and
            // styles.emote keeps C.emote as the fallback.
            <Text key={i} style={[styles.emote, { color: emoteColor }]}>
              _(* {seg.text} *)_
              {needsSpace ? "\n\n" : ""}
            </Text>
          );
        }
        return (
          <Text key={i}>
            {seg.text}
            {needsSpace ? "\n\n" : ""}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  dialog: { color: C.text, fontSize: 14, lineHeight: 23 },
  emote: { color: C.emote, fontStyle: "italic", fontSize: 12.5, lineHeight: 20 },
});
