import React from "react";
import { Text, StyleProp, TextStyle, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  text: string;
  baseStyle?: StyleProp<TextStyle>;
}

interface Segment {
  type: "emote" | "dialog";
  text: string;
}

const EMOTE_RE = /_\(\*\s*([\s\S]*?)\s*\*\)_/g;

/**
 * Convert Tim's single-asterisk emotes `*action*` into Bridge emote wrappers
 * `_(*action*)_`. Sentence-terminating punctuation (`.`, `!`, `?`) immediately
 * after the closing asterisk is absorbed INTO the emote so it reads as a
 * complete thought rather than leaving a leading period in the dialog that
 * follows. Double-asterisk markdown `**bold**` is left alone.
 *
 * Examples:
 *   "*walks to the kitchen*. I'm making coffee"
 *     → "_(*walks to the kitchen.*)_ I'm making coffee"
 *   "*laughs* Yeah"
 *     → "_(*laughs*)_ Yeah"
 *   "*grinning*! Look at this"
 *     → "_(*grinning!*)_ Look at this"
 */
export function convertTimAsterisksToEmotes(input: string): string {
  return input.replace(
    /(?<!\*)\*([^*\n]+?)\*([.!?])?(?!\*)/g,
    (_, inner: string, punct?: string) => `_(*${inner}${punct ?? ""}*)_`
  );
}

/**
 * Return only the dialog text from a Bridge-format message, stripping every
 * `_(*emote*)_` block. Used to feed ElevenLabs — emotes never get spoken aloud.
 */
export function extractSpokenText(raw: string): string {
  return parseSegments(raw)
    .filter((s) => s.type === "dialog")
    .map((s) => s.text)
    .join(" ")
    .trim();
}

/**
 * Return all emote blocks (without the `_(* *)_` wrappers) joined by " | ".
 * Used as context for Gemini's audio-tag injection so it knows the emotional
 * backdrop when deciding where `[laughs]` / `[sighs]` etc. should land.
 */
export function extractEmoteContext(raw: string): string {
  return parseSegments(raw)
    .filter((s) => s.type === "emote")
    .map((s) => s.text)
    .join(" | ")
    .trim();
}

export function parseSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  EMOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOTE_RE.exec(raw)) !== null) {
    if (m.index > last) {
      const t = raw.slice(last, m.index);
      if (t.trim()) segments.push({ type: "dialog", text: t.trim() });
    }
    if (m[1].trim()) segments.push({ type: "emote", text: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    const t = raw.slice(last);
    if (t.trim()) segments.push({ type: "dialog", text: t.trim() });
  }
  return segments;
}

/**
 * Renders a Kindroid-format message body with inline `_(*emote*)_` blocks
 * styled purple italic and dialog styled as normal text. Used for both
 * Tim's Gemini-composed messages and Eli's Kindroid replies.
 */
export function FormattedBody({ text, baseStyle }: Props) {
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
            <Text key={i} style={styles.emote}>
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
