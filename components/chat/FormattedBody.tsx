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
