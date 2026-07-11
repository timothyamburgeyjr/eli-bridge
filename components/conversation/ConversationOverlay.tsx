import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAudioRecorder } from "expo-audio";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import { useMode } from "@/stores/modeStore";
import { useAudio } from "@/stores/audioStore";
import { useRecovery } from "@/stores/recoveryStore";
import {
  ensureRecordingPermission,
  setPlaybackAudioMode,
  setRecordingAudioMode,
  VOICE_RECORDING_PRESET,
} from "@/services/audio";
import { abortPipeline } from "@/session/abortPipeline";
import { QuickMessagesPopup } from "@/components/chat/QuickMessagesPopup";
import { useCompanionName } from "@/stores/personaStore";

const KEEP_AWAKE_TAG = "eli-bridge-conversation";

/**
 * Full-screen Conversation Mode overlay (formerly Drive Mode). Tap the
 * central mic zone to start recording, tap again to stop and send. Eli's
 * replies are always spoken through the phone speaker via ElevenLabs.
 *
 * Layout (top to bottom):
 *   1. Top status strip — time / location / weather chips
 *   2. Action row — "Conversation Mode" label + Abort pill + Stop button
 *   3. Central tap zone — large mic art + status line
 *   4. Quick Messages panel — tap-to-send AI-generated suggestion cards
 *
 * Enter via useMode.enterConversationManual() or auto-trigger (sustained
 * IN_VEHICLE — still the underlying trigger). Exit via the Stop button at
 * the top. Abort, distinct from Stop, kills any in-flight Gemini /
 * Kindroid / ElevenLabs work but keeps the overlay open.
 */
export function ConversationOverlay() {
  const who = useCompanionName();
  const conversation = useMode((s) => s.conversation);
  const exitConversation = useMode((s) => s.exitConversation);
  const messages = useChat((s) => s.messages);
  const addAttachment = useChat((s) => s.addAttachment);
  const sendMessage = useChat((s) => s.sendMessage);
  const chatStatus = useChat((s) => s.status);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [quickPopupOpen, setQuickPopupOpen] = useState(false);

  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up timer on unmount or state change
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Reset local state when the overlay closes
  useEffect(() => {
    if (!conversation) {
      setRecording(false);
      setElapsed(0);
      setError(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [conversation]);

  // Hold a wake-lock while Conversation Mode is active. Without this the screen
  // sleeps mid-conversation and the audio pipeline (recorder + ElevenLabs
  // playback) stops being driven, which leaves Tim talking to a frozen app.
  useEffect(() => {
    if (!conversation) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {
      // best-effort; rare on Android, but a failed activation shouldn't
      // crash the overlay
    });
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // already deactivated
      }
    };
  }, [conversation]);

  // Force the audio session into playback mode on entry so Eli's TTS routes
  // through the loudspeaker. Restore recording mode on exit so the regular
  // InputBar PTT keeps working.
  useEffect(() => {
    if (!conversation) return;
    setPlaybackAudioMode();
    return () => {
      setRecordingAudioMode();
    };
  }, [conversation]);

  // Force-speak every new Eli reply while Conversation Mode is on. Same
  // freshness gate as before — only auto-play messages <60s old.
  const lastAutoSpokenRef = useRef<string | null>(null);
  const playAi = useAudio((s) => s.playAi);
  useEffect(() => {
    if (!conversation) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.from !== "ai") continue;
      if (lastAutoSpokenRef.current === m.id) return;
      const raw = m.raw ?? (m.emote ? `_(*${m.emote}*)_ ${m.dialog}` : m.dialog);
      if (!raw) return;
      const msgTs = extractTimestampFromId(m.id);
      const ageMs = msgTs !== null ? Date.now() - msgTs : null;
      if (ageMs !== null && ageMs > 60_000) {
        console.log(
          `[conv] auto-speak SKIP (stale) msg=${m.id} age=${ageMs}ms`
        );
        lastAutoSpokenRef.current = m.id;
        return;
      }
      console.log(
        `[conv] auto-speak FIRE msg=${m.id} age=${ageMs ?? "?"}ms`
      );
      lastAutoSpokenRef.current = m.id;
      playAi(m.id, raw);
      return;
    }
  }, [conversation, messages, playAi]);

  // TTS lifecycle from audioStore — we need to block recording while audio
  // is generating/playing, and let a tap on the screen stop playback.
  const audioEntry = useAudio((s) =>
    s.currentMessageId ? s.cache[s.currentMessageId] : undefined
  );
  const stopAudio = useAudio((s) => s.stop);
  const audioGenerating = audioEntry?.status === "generating";
  const audioPlaying = audioEntry?.status === "playing";

  // ── Abort visibility ─────────────────────────────────────────────
  // Same predicate as the header — anything in flight makes the pill light up.
  const sceneStatus = useChat((s) => s.sceneStatus);
  const recoveryFailure = useRecovery((s) => s.failure);
  const abortActive =
    chatStatus === "assembling" ||
    chatStatus === "sending" ||
    sceneStatus === "analyzing" ||
    audioGenerating ||
    audioPlaying ||
    recoveryFailure !== null;

  // ── Live status strip data ──────────────────────────────────────
  const liveContext = useChat((s) => s.liveContext);
  // The poller writes chip strings like ["📍 Lynchburg, VA", "🌤 58°F clouds",
  // "🚶 still"]. Pull the first place chip + first weather chip out for the
  // top status strip; activity stays in the live context banner outside the
  // overlay so the strip doesn't double-render it.
  const placeChip = liveContext.find((c) => c.startsWith("📍")) ?? null;
  const weatherChip = liveContext.find((c) => c.startsWith("🌤")) ?? null;
  const [clockText, setClockText] = useState(() => formatClock(new Date()));
  useEffect(() => {
    if (!conversation) return;
    const id = setInterval(() => setClockText(formatClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, [conversation]);

  // Pulse animation while a stage is running.
  const pulse = useRef(new Animated.Value(1)).current;
  const waiting =
    chatStatus === "assembling" ||
    chatStatus === "sending" ||
    audioGenerating;
  const thinking = waiting || audioPlaying;
  useEffect(() => {
    if (!waiting) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [waiting, pulse]);

  const handleCentralTap = async () => {
    if (chatStatus === "assembling" || chatStatus === "sending") return;
    if (audioGenerating) return;
    if (audioPlaying) {
      stopAudio();
      return;
    }

    if (recording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      try {
        await recorderRef.current.stop();
        const uri = recorderRef.current.uri;
        setRecording(false);
        setElapsed(0);
        setPlaybackAudioMode();
        if (uri) {
          addAttachment({
            kind: "audio",
            localPath: uri,
            mimeType: "audio/mp4",
            duration: Math.max(1, elapsed),
          });
          await sendMessage("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stop-recording failed");
      }
      return;
    }

    setError(null);
    const granted = await ensureRecordingPermission();
    if (!granted) {
      setError("Mic permission denied.");
      return;
    }
    try {
      await setRecordingAudioMode();
      await beginRecordingCycle(recorderRef.current);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording failed");
    }
  };

  if (!conversation) return null;

  const statusLine =
    chatStatus === "assembling"
      ? "Gemini thinking…"
      : chatStatus === "sending"
      ? `${who} thinking…`
      : audioGenerating
      ? `Preparing ${who}'s voice…`
      : audioPlaying
      ? `${who} speaking · tap to stop`
      : recording
      ? `Recording · ${formatTime(elapsed)} · tap anywhere to send`
      : "Tap anywhere to speak";

  return (
    <Modal visible={conversation} animationType="fade" statusBarTranslucent>
      <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
        {/* ── Top status strip — clock · place · weather ── */}
        <View style={styles.statusStrip}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipIcon}>🕐</Text>
            <Text style={styles.statusChipText}>{clockText}</Text>
          </View>
          <View style={[styles.statusChip, { flex: 1.4 }]}>
            <Text style={styles.statusChipText} numberOfLines={1}>
              {placeChip ?? "📍 Locating…"}
            </Text>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText} numberOfLines={1}>
              {weatherChip ?? "🌤 —"}
            </Text>
          </View>
        </View>

        {/* ── Action row — mode label · Abort · Stop ── */}
        <View style={styles.actionRow}>
          <View style={styles.modeLabelRow}>
            <Text style={styles.modeLabelIcon}>💬</Text>
            <Text style={styles.modeLabel}>Conversation Mode</Text>
          </View>
          <Pressable
            onPress={() => {
              if (!abortActive) return;
              abortPipeline("conversation-abort");
            }}
            style={[styles.abortBtn, !abortActive && { opacity: 0.35 }]}
            accessibilityLabel="Abort current operation"
          >
            <Text style={styles.abortBtnIcon}>⚠</Text>
            <Text style={styles.abortBtnText}>Abort</Text>
          </Pressable>
          <Pressable onPress={exitConversation} style={styles.stopBtn} hitSlop={8}>
            <Text style={styles.stopBtnIcon}>⏹</Text>
            <Text style={styles.stopBtnText}>Stop</Text>
          </Pressable>
        </View>

        {/* ── Central tap zone — big mic + status line ── */}
        <Pressable onPress={handleCentralTap} style={styles.tapZone}>
          <View
            style={[
              styles.indicator,
              recording && styles.indicatorRecording,
              thinking && styles.indicatorBusy,
            ]}
          >
            {waiting ? (
              <ActivityIndicator size="large" color={C.accent} />
            ) : audioPlaying ? (
              <Text style={styles.indicatorGlyph}>🔊</Text>
            ) : (
              <Text style={styles.indicatorGlyph}>
                {recording ? "■" : "🎙️"}
              </Text>
            )}
          </View>

          <Animated.Text
            style={[
              styles.statusLine,
              recording && { color: C.red, fontWeight: "700" },
              waiting && { color: C.accent, fontWeight: "600", opacity: pulse },
              audioPlaying && { color: C.accent, fontWeight: "600" },
            ]}
          >
            {statusLine}
          </Animated.Text>

          {error ? <Text style={styles.error}>⚠ {error}</Text> : null}
        </Pressable>

        {/* ── Quick Messages — single button, opens the X-Ray popup. ── */}
        <View style={styles.quickContainer}>
          <View style={styles.quickHeader}>
            <Text style={styles.quickHeaderIcon}>✦</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickHeaderTitle}>Quick Messages</Text>
              <Text style={styles.quickHeaderSubtitle}>
                {`Send ${who} an instant message`}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setQuickPopupOpen(true)}
            style={({ pressed }) => [
              styles.quickButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.quickButtonIcon}>💬</Text>
            <Text style={styles.quickButtonLabel}>Open Quick Messages</Text>
            <Text style={styles.quickButtonChevron}>›</Text>
          </Pressable>
          <View style={styles.quickFooter}>
            <Text style={styles.quickFooterIcon}>ⓘ</Text>
            <Text style={styles.quickFooterText}>
              {`Browse categories of messages and send one to ${who} instantly.`}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <QuickMessagesPopup
        visible={quickPopupOpen}
        onClose={() => setQuickPopupOpen(false)}
      />
    </Modal>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatClock(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const hr12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hr12}:${m} ${ampm}`;
}

/** Pulls the trailing Date.now() out of message IDs like "eli-1714671234567". */
function extractTimestampFromId(id: string): number | null {
  const m = id.match(/-(\d{13})$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Start a recording cycle robustly. expo-audio's recorder (Android, SDK 55)
 * doesn't reliably reset after stop() across multiple record cycles in one
 * session — prepareToRecordAsync or record() throws IllegalStateException
 * because the native MediaRecorder is in a stale state.
 */
async function beginRecordingCycle(
  recorder: { prepareToRecordAsync: () => Promise<unknown>; record: () => void; stop: () => Promise<unknown> }
): Promise<void> {
  const attempt = async () => {
    try {
      await recorder.stop();
    } catch {
      // nothing was recording — expected on the happy path
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  try {
    await attempt();
  } catch (firstErr) {
    console.warn("[conv] recording cycle failed once, retrying:", firstErr);
    await new Promise((r) => setTimeout(r, 200));
    await attempt();
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  statusStrip: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  statusChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.raised,
  },
  statusChipIcon: { fontSize: 12, color: C.muted },
  statusChipText: { color: C.text, fontSize: 12, fontWeight: "500" },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 8,
  },
  modeLabelRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modeLabelIcon: { fontSize: 16, color: C.accent },
  modeLabel: { color: C.accent, fontSize: 15, fontWeight: "700" },

  abortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.red + "55",
    backgroundColor: C.red + "12",
  },
  abortBtnIcon: { fontSize: 12, color: C.red },
  abortBtnText: { fontSize: 12, color: C.red, fontWeight: "700" },

  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.red,
    backgroundColor: C.red + "22",
  },
  stopBtnIcon: { fontSize: 12, color: C.red },
  stopBtnText: { fontSize: 12, color: C.red, fontWeight: "700" },

  tapZone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 24,
  },
  indicator: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: C.accent + "55",
    backgroundColor: C.accent + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorRecording: {
    borderColor: C.red,
    backgroundColor: C.red + "18",
  },
  indicatorBusy: {
    borderColor: C.accent,
    backgroundColor: C.accent + "26",
  },
  indicatorGlyph: { fontSize: 70 },
  statusLine: { fontSize: 14, color: C.textDim, textAlign: "center" },
  error: { color: C.red, fontSize: 13, marginTop: 8 },

  quickContainer: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10,
  },
  quickHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quickHeaderIcon: { color: C.accent, fontSize: 20 },
  quickHeaderTitle: { color: C.text, fontSize: 17, fontWeight: "700" },
  quickHeaderSubtitle: { color: C.textDim, fontSize: 12, marginTop: 2 },

  quickButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.accent + "66",
    backgroundColor: C.accent + "1A",
  },
  quickButtonIcon: { fontSize: 22 },
  quickButtonLabel: {
    flex: 1,
    color: C.accent,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  quickButtonChevron: { color: C.accent, fontSize: 22, fontWeight: "600" },

  quickFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 4,
  },
  quickFooterIcon: { color: C.muted, fontSize: 12, marginTop: 1 },
  quickFooterText: {
    flex: 1,
    color: C.textDim,
    fontSize: 11,
    lineHeight: 14,
  },
});
