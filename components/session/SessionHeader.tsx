import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { PersonaAvatar } from "@/components/common/PersonaAvatar";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { MoodBadge } from "@/components/mood/MoodBadge";
import { MoodSheet } from "@/components/mood/MoodSheet";
import { useActivePersonality } from "@/stores/personaStore";
import { useMode } from "@/stores/modeStore";
import { useConnection } from "@/stores/connectionStore";
import { useChat } from "@/stores/chatStore";
import { useAudio } from "@/stores/audioStore";
import { useRecovery } from "@/stores/recoveryStore";
import { abortPipeline } from "@/session/abortPipeline";

interface Props {
  /** True when there's an active session (status === "active"). Drives the
   *  Start/End toggle on the right action button and enables Conversation
   *  Mode tap. */
  connected: boolean;
  /** Tap handler for the Start (when disconnected) or End (when connected)
   *  button — wired in app/index.tsx to start/end the session. */
  onTogglePress: () => void;
  /** Hamburger tap → open SessionTimeline. */
  onTimelinePress: () => void;
  /** Settings gear tap → open SettingsPanel. */
  onSettingsPress: () => void;
}

/**
 * Redesigned header. Top strip holds the hamburger, the active companion's
 * avatar with title + connection status, and the Abort pill (top-right, dimmed
 * when nothing is in flight). Below that, a row of three large tap targets:
 * Conversation Mode
 * (disabled until a session is active), Settings, and Start/End — the last
 * being context-dependent (green Start when idle, red End when connected).
 *
 * Conversation Mode is the renamed Drive Mode — same overlay, same auto-
 * activation on sustained IN_VEHICLE, just the user-facing label and code
 * identifiers have shifted.
 */
export function SessionHeader({
  connected,
  onTogglePress,
  onTimelinePress,
  onSettingsPress,
}: Props) {
  const persona = useActivePersonality();
  const [moodSheetOpen, setMoodSheetOpen] = useState(false);
  const conversation = useMode((s) => s.conversation);
  const enterConversationManual = useMode((s) => s.enterConversationManual);
  const exitConversation = useMode((s) => s.exitConversation);
  const toggleConversation = () => {
    if (!connected) return; // greyed-out — tapping is a no-op
    if (conversation) exitConversation();
    else enterConversationManual();
  };

  // ── Connection / queue chips ─────────────────────────────────────
  const netState = useConnection((s) => s.state);
  const queuedCount = useChat((s) => s.offlineQueue.length);
  const offline = netState === "offline";
  const effectiveStatus: "green" | "amber" | "red" = !connected
    ? "red"
    : offline
    ? "amber"
    : "green";
  const effectiveLabel = !connected
    ? "Disconnected"
    : offline
    ? queuedCount > 0
      ? `Offline · ${queuedCount} queued`
      : "Offline"
    : "Connected";

  // ── Abort visibility ─────────────────────────────────────────────
  // Pill always rendered at the top-right; opacity drops when there's nothing
  // to abort so it stays present (no layout jump) but visually quiet.
  const chatStatus = useChat((s) => s.status);
  const sceneStatus = useChat((s) => s.sceneStatus);
  const audioCurrentId = useAudio((s) => s.currentMessageId);
  const audioEntryStatus = useAudio((s) =>
    s.currentMessageId ? s.cache[s.currentMessageId]?.status : undefined
  );
  const recoveryFailure = useRecovery((s) => s.failure);
  const abortActive =
    chatStatus === "assembling" ||
    chatStatus === "sending" ||
    sceneStatus === "analyzing" ||
    (audioCurrentId != null &&
      (audioEntryStatus === "generating" || audioEntryStatus === "playing")) ||
    recoveryFailure !== null;

  return (
    <View>
      {/* ── Top strip: hamburger · avatar+title · abort pill ── */}
      <View style={styles.topStrip}>
        <Pressable onPress={onTimelinePress} style={styles.hamburgerBtn}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: i === 1 ? 14 : 20,
                height: 2,
                borderRadius: 1,
                backgroundColor: C.muted,
                marginVertical: 2,
              }}
            />
          ))}
        </Pressable>

        <View style={styles.titleBlock}>
          <PersonaAvatar personality={persona} size={32} fontSize={13} ring />
          <View>
            <Text style={styles.title}>
              {persona ? `${persona.shortName}'s Bridge` : "The Bridge"}
            </Text>
            {/* Status + mood live on one row under the title. A fourth sibling
                in topStrip would squeeze the title on narrow phones. */}
            <View style={styles.statusRow}>
              <Pressable
                onPress={() => useConnection.getState().refresh()}
                hitSlop={6}
              >
                <StatusIndicator status={effectiveStatus} label={effectiveLabel} />
              </Pressable>
              <MoodBadge onPress={() => setMoodSheetOpen(true)} />
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => {
            if (!abortActive) return;
            abortPipeline("header-abort");
          }}
          accessibilityLabel="Abort current operation"
          style={[
            styles.abortPill,
            { opacity: abortActive ? 1 : 0.35 },
          ]}
        >
          <Text style={styles.abortIcon}>⏹</Text>
          <Text style={styles.abortText}>Abort</Text>
        </Pressable>
      </View>

      {/* ── Action row: Conversation Mode · Settings · Start/End ── */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={toggleConversation}
          disabled={!connected}
          style={[
            styles.actionBtn,
            !connected && styles.actionBtnDisabled,
            conversation && styles.actionBtnActive,
          ]}
          accessibilityLabel={
            conversation ? "Exit Conversation Mode" : "Enter Conversation Mode"
          }
        >
          <Text style={[styles.actionIcon, conversation && { color: C.accent }]}>
            🎙
          </Text>
          <Text style={[styles.actionLabel, conversation && { color: C.accent }]}>
            Conversation{"\n"}Mode
          </Text>
        </Pressable>

        <Pressable onPress={onSettingsPress} style={styles.actionBtn}>
          <Text style={styles.actionIcon}>⚙</Text>
          <Text style={styles.actionLabel}>Settings</Text>
        </Pressable>

        <Pressable
          onPress={onTogglePress}
          style={[
            styles.actionBtn,
            connected ? styles.actionBtnEnd : styles.actionBtnStart,
          ]}
          accessibilityLabel={connected ? "End session" : "Start session"}
        >
          <Text
            style={[
              styles.actionIcon,
              { color: connected ? C.red : C.green },
            ]}
          >
            {connected ? "📞" : "▶"}
          </Text>
          <Text
            style={[
              styles.actionLabel,
              { color: connected ? C.red : C.green, fontWeight: "700" },
            ]}
          >
            {connected ? "End" : "Start"}
          </Text>
        </Pressable>
      </View>

      <MoodSheet
        visible={moodSheetOpen}
        onClose={() => setMoodSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  topStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  hamburgerBtn: { padding: 4 },
  titleBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: "700", color: C.text },
  abortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: C.amber + "1A",
    borderColor: C.amber + "66",
  },
  abortIcon: { fontSize: 14, color: C.amber },
  abortText: { fontSize: 13, fontWeight: "700", color: C.amber },
  actionRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    aspectRatio: 1.1,
    minHeight: 76,
    backgroundColor: C.raised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnActive: {
    backgroundColor: C.accent + "1A",
    borderColor: C.accent + "66",
  },
  actionBtnStart: {
    backgroundColor: C.green + "1A",
    borderColor: C.green + "66",
  },
  actionBtnEnd: {
    backgroundColor: C.red + "1A",
    borderColor: C.red + "66",
  },
  actionIcon: { fontSize: 26, color: C.textDim },
  actionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textDim,
    textAlign: "center",
    lineHeight: 14,
  },
});
