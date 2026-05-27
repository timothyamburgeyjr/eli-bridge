import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Image,
  Modal,
} from "react-native";
import { C } from "@/constants/theme";
import { Pill } from "@/components/common/PillButton";
import { EliAvatar } from "@/components/common/EliAvatar";
import { FormattedBody } from "./FormattedBody";
import { useAudio } from "@/stores/audioStore";
import { PhotoLookupModal } from "./PhotoLookupModal";

interface ContextPill {
  icon: string;
  label: string;
}

interface TimAttachment {
  type: "image" | "audio" | "video" | "file";
  localPath: string;
  mimeType: string;
  duration?: number;
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
  /** Sent while offline — waiting for connection drain. */
  queued?: boolean;
  /** Send permanently failed after retries. */
  failed?: boolean;
  /** Image/audio/video files attached to this message. Images render inline
   *  in the bubble; other kinds are noted but not rendered (yet). */
  attachments?: TimAttachment[];
}

export function TimBubble({
  emote,
  dialog,
  raw,
  time,
  pills,
  isDrive,
  queued,
  failed,
  attachments,
}: TimProps) {
  const body = raw ?? composeRaw(emote, dialog);
  const dimmed = queued || failed;
  const images = (attachments ?? []).filter((a) => a.type === "image");
  const videos = (attachments ?? []).filter((a) => a.type === "video");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [lookupUri, setLookupUri] = useState<string | null>(null);
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
              borderColor: failed
                ? C.red + "66"
                : queued
                ? C.amber + "66"
                : isDrive
                ? "rgba(124,92,255,0.12)"
                : "rgba(124,92,255,0.25)",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 4,
              borderBottomRightRadius: 18,
              borderBottomLeftRadius: 18,
              opacity: dimmed ? 0.75 : 1,
            },
          ]}
        >
          {body.trim().length > 0 ? <FormattedBody text={body} /> : null}
          {images.length > 0 && (
            <View style={[styles.imageStack, body.trim().length > 0 && { marginTop: 8 }]}>
              {images.map((img, i) => (
                <View key={i} style={styles.imageWrap}>
                  <Pressable
                    onPress={() => setPreviewUri(img.localPath)}
                    onLongPress={() => setLookupUri(img.localPath)}
                    delayLongPress={400}
                  >
                    <Image
                      source={{ uri: img.localPath }}
                      style={styles.bubbleImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => setLookupUri(img.localPath)}
                    style={styles.lookupOverlay}
                    hitSlop={6}
                  >
                    <Text style={styles.lookupOverlayText}>🔍</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {videos.length > 0 && (
            // Video attachments don't render an inline player — the 5
            // extracted frames + Gemini's emote-from-video cover what Eli
            // sees. Here we just show a compact "video attached" badge per
            // clip with its duration so Tim can scroll back and remember
            // a message had a video.
            <View
              style={[
                { gap: 6 },
                body.trim().length > 0 || images.length > 0 ? { marginTop: 8 } : null,
              ]}
            >
              {videos.map((v, i) => (
                <View key={i} style={styles.videoBadge}>
                  <Text style={styles.videoBadgeIcon}>🎥</Text>
                  <Text style={styles.videoBadgeText}>
                    Video
                    {v.duration ? ` · ${v.duration}s` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {pills && pills.length > 0 && (
            <View style={styles.pillRow}>
              {pills.map((p, i) => (
                <Pill key={i} icon={p.icon} label={p.label} />
              ))}
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {queued ? (
            <Text style={{ fontSize: 10, color: C.amber }}>⏳ queued · will send when online</Text>
          ) : failed ? (
            <Text style={{ fontSize: 10, color: C.red }}>⚠ send failed</Text>
          ) : null}
          <Text style={styles.timestamp}>{time}</Text>
        </View>
      </View>

      <Modal
        visible={previewUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <Pressable
          style={styles.previewBackdrop}
          onPress={() => setPreviewUri(null)}
        >
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>

      <PhotoLookupModal
        visible={lookupUri !== null}
        photoUri={lookupUri}
        onClose={() => setLookupUri(null)}
      />
    </View>
  );
}

interface EliProps {
  id: string;
  emote?: string;
  dialog: string;
  raw?: string;
  time: string;
  isDrive?: boolean;
}

export function EliBubble({ id, emote, dialog, raw, time, isDrive }: EliProps) {
  const body = raw ?? composeRaw(emote, dialog);
  const entry = useAudio((s) => s.cache[id]);
  const playEli = useAudio((s) => s.playEli);
  const status = entry?.status ?? "idle";

  const handlePress = () => {
    playEli(id, body);
  };

  // Button visual state
  let icon: React.ReactNode = <Text style={{ fontSize: 12 }}>▶</Text>;
  let btnBg: string = "rgba(255,255,255,0.07)";
  let btnBorder: string = C.border;
  let iconColor: string = C.muted;

  if (status === "generating") {
    icon = <ActivityIndicator size="small" color={C.accent} />;
    btnBg = C.accent + "14";
    btnBorder = C.accent + "44";
  } else if (status === "playing") {
    icon = <Text style={{ fontSize: 12, color: C.accent }}>⏸</Text>;
    btnBg = C.accent + "22";
    btnBorder = C.accent;
    iconColor = C.accent;
  } else if (status === "ready") {
    // Fresh cached audio, not yet played → accent-colored ▶
    icon = <Text style={{ fontSize: 12, color: C.accent }}>▶</Text>;
    btnBg = C.accent + "14";
    btnBorder = C.accent + "66";
  } else if (status === "played") {
    // Already heard — muted ▶ so you can see at a glance what's been consumed
    icon = <Text style={{ fontSize: 12, color: C.muted }}>▶</Text>;
    btnBg = "rgba(255,255,255,0.04)";
    btnBorder = C.border;
    iconColor = C.muted;
  } else if (status === "error") {
    icon = <Text style={{ fontSize: 12, color: C.red }}>⚠</Text>;
    btnBg = C.red + "14";
    btnBorder = C.red + "44";
  }

  // Footer speaker icon reflects status: played = muted, otherwise show available
  const footerIcon = status === "played" ? "🔇" : "🔊";

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
              {footerIcon} Eli · {time}
            </Text>
            <Pressable
              onPress={handlePress}
              disabled={status === "generating"}
              style={[
                styles.playBtn,
                { backgroundColor: btnBg, borderColor: btnBorder },
              ]}
            >
              {icon}
            </Pressable>
          </View>
          {status === "error" && entry?.error ? (
            <Text style={styles.errorText}>{entry.error}</Text>
          ) : null}
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
  errorText: {
    fontSize: 10,
    color: C.red,
    marginTop: 6,
    lineHeight: 14,
  },
  imageStack: { gap: 6 },
  imageWrap: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.25)",
    position: "relative",
  },
  bubbleImage: {
    width: "100%",
    aspectRatio: 4 / 3,
  },
  lookupOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  lookupOverlayText: { fontSize: 14 },
  videoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accent + "55",
    backgroundColor: C.accent + "14",
  },
  videoBadgeIcon: { fontSize: 16 },
  videoBadgeText: { color: C.accent, fontSize: 12, fontWeight: "700" },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
});
