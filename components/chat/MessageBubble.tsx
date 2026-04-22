import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { Pill } from "@/components/common/PillButton";
import { EliAvatar } from "@/components/common/EliAvatar";
import { FormattedBody } from "./FormattedBody";

interface ContextPill {
  icon: string;
  label: string;
}

function composeRaw(emote: string | undefined, dialog: string): string {
  if (emote && emote.trim()) return `_(*${emote.trim()}*)_ ${dialog}`;
  return dialog;
}

interface TimProps {
  emote?: string;
  dialog: string;
  /** Full raw message (with any inline emotes). Takes precedence over emote + dialog. */
  raw?: string;
  time: string;
  pills?: ContextPill[];
  isDrive?: boolean;
}

export function TimBubble({ emote, dialog, raw, time, pills, isDrive }: TimProps) {
  const body = raw ?? composeRaw(emote, dialog);
  return (
    <View style={[styles.row, { justifyContent: "flex-end", opacity: isDrive ? 0.7 : 1, marginBottom: isDrive ? 14 : 20 }]}>
      <View style={{ maxWidth: "78%", alignItems: "flex-end", gap: 4 }}>
        {isDrive && (
          <Text style={{ fontSize: 9, color: C.muted }}>🚗 Voice message recorded at speed</Text>
        )}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isDrive ? C.timBubble + "99" : C.timBubble,
              borderColor: isDrive ? "rgba(124,92,255,0.12)" : "rgba(124,92,255,0.25)",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 18,
              borderBottomLeftRadius: 18,
            },
          ]}
        >
          <FormattedBody text={body} />
          {pills && pills.length > 0 && (
            <View style={styles.pillRow}>
              {pills.map((p, i) => (
                <Pill key={i} icon={p.icon} label={p.label} />
              ))}
            </View>
          )}
        </View>
        <Text style={styles.timestamp}>{time}</Text>
      </View>
    </View>
  );
}

interface EliProps {
  emote?: string;
  dialog: string;
  raw?: string;
  time: string;
  isDrive?: boolean;
  autoplay?: boolean;
}

export function EliBubble({ emote, dialog, raw, time, isDrive, autoplay }: EliProps) {
  const [playing, setPlaying] = useState(false);
  const body = raw ?? composeRaw(emote, dialog);
  return (
    <View style={[styles.row, { alignItems: "flex-end", gap: 8, opacity: isDrive ? 0.7 : 1, marginBottom: isDrive ? 14 : 20 }]}>
      <EliAvatar size={28} fontSize={12} />
      <View style={{ maxWidth: "78%", gap: 4 }}>
        {isDrive && (
          <Text style={{ fontSize: 9, color: C.muted }}>🔊 Played aloud through speaker · Drive Mode</Text>
        )}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isDrive ? C.eliBubble + "99" : C.eliBubble,
              borderColor: isDrive ? C.border + "55" : C.border,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 18,
              borderBottomLeftRadius: 18,
              borderBottomRightRadius: 18,
            },
          ]}
        >
          <FormattedBody text={body} />
          <View style={styles.eliFooter}>
            <Text style={{ fontSize: 10, color: C.muted }}>
              {autoplay ? "🔊" : "🔇"} Eli · {time}
            </Text>
            <Pressable
              onPress={() => setPlaying((p) => !p)}
              style={[
                styles.playBtn,
                {
                  backgroundColor: playing ? C.accent + "22" : "rgba(255,255,255,0.07)",
                  borderColor: playing ? C.accent : C.border,
                },
              ]}
            >
              <Text style={{ color: playing ? C.accent : C.muted, fontSize: 12 }}>{playing ? "⏸" : "▶"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", width: "100%" },
  bubble: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 8 },
  timestamp: { fontSize: 10, color: C.muted, paddingRight: 4 },
  eliFooter: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
