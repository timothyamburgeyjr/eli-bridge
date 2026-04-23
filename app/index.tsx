import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import { SessionHeader } from "@/components/session/SessionHeader";
import { SessionTimeline } from "@/components/session/SessionTimeline";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ChatStream } from "@/components/chat/ChatStream";
import { InputBar } from "@/components/chat/InputBar";
import { StagingTray } from "@/components/chat/StagingTray";
import { MediaPicker } from "@/components/capture/MediaPicker";
import { CaptureModal, CaptureMode } from "@/components/capture/CaptureModal";
import { DiagnosticsPanel } from "@/components/diagnostics/DiagnosticsPanel";
import { EliAvatar } from "@/components/common/EliAvatar";
import { SCENARIOS, getScenario, ScenarioId } from "@/data/scenarios";

type Mode = "session" | "oneoff";
type ChatSource = "live" | ScenarioId;

export default function Main() {
  const [mode, setMode] = useState<Mode>("session");
  const [connected, setConnected] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [source, setSource] = useState<ChatSource>("live");

  const liveMessages = useChat((s) => s.messages);
  const status = useChat((s) => s.status);
  const errorMessage = useChat((s) => s.errorMessage);
  const lastEmoteChars = useChat((s) => s.lastEmoteChars);
  const lastFilteredContext = useChat((s) => s.lastFilteredContext);
  const sceneStatus = useChat((s) => s.sceneStatus);
  const sceneError = useChat((s) => s.sceneError);
  const pendingSceneMemo = useChat((s) => s.pendingSceneMemo);

  const activeScenario = useMemo(
    () => (source === "live" ? null : getScenario(source as ScenarioId)),
    [source]
  );
  const displayMessages = source === "live" ? liveMessages : activeScenario!.messages;

  // Auto-show chat when a message arrives in live mode
  useEffect(() => {
    if (source === "live" && liveMessages.length > 0 && !showChat) setShowChat(true);
  }, [liveMessages.length, source, showChat]);

  const demoStats = activeScenario?.stats ?? [
    { value: String(liveMessages.length), label: "Messages" },
    { value: lastEmoteChars ? `${lastEmoteChars}` : "—", label: "Last emote (chars)" },
    { value: status === "assembling" ? "…" : "✓", label: "Gemini" },
  ];
  const demoTimeline = activeScenario?.timeline ?? [];

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
      <SessionHeader
        connected={connected}
        mode={mode}
        onTogglePress={() => setConnected((c) => !c)}
        onTimelinePress={() => setTimelineOpen(true)}
        onSettingsPress={() => setSettingsOpen(true)}
        onModeChange={(m) => {
          setMode(m);
          setShowChat(false);
        }}
      />

      {!showChat ? (
        <View style={styles.empty}>
          <View style={{ marginBottom: 24 }}>
            <EliAvatar size={72} fontSize={32} />
          </View>
          <Text style={styles.emptyTitle}>
            {mode === "session" ? "What's on\nyour mind?" : "Drop something\nfor Eli"}
          </Text>
          <Text style={styles.emptyBody}>
            {mode === "session"
              ? "Gemini enriches your words with context.\nEli responds as if he's there."
              : "One message. One reply.\nNo session, no background context."}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scenarioRow}
            style={{ flexGrow: 0, marginBottom: 10 }}
          >
            <Pressable
              onPress={() => {
                setSource("live");
                setShowChat(liveMessages.length > 0);
              }}
              style={[
                styles.scenarioChip,
                {
                  backgroundColor: source === "live" ? C.accent + "22" : "transparent",
                  borderColor: source === "live" ? C.accent + "66" : "transparent",
                },
              ]}
            >
              <Text style={{ fontSize: 12 }}>💬</Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: source === "live" ? "600" : "400",
                  color: source === "live" ? C.accent : C.muted,
                }}
              >
                Live chat
              </Text>
            </Pressable>
            {SCENARIOS.map((s) => {
              const active = s.id === source;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setSource(s.id);
                    setShowChat(false);
                  }}
                  style={[
                    styles.scenarioChip,
                    {
                      backgroundColor: active ? C.raised : "transparent",
                      borderColor: active ? C.border : "transparent",
                    },
                  ]}
                >
                  <Text style={{ fontSize: 12 }}>{s.icon}</Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: active ? "600" : "400",
                      color: active ? C.text : C.muted,
                    }}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {source === "live" ? (
            <Text style={styles.liveHint}>Type below to start a live Gemini session.</Text>
          ) : (
            <Pressable onPress={() => setShowChat(true)} style={styles.loadDemoBtn}>
              <Text style={{ color: C.muted, fontSize: 12 }}>Load demo chat ↓</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ChatStream messages={displayMessages} />
      )}

      {status === "assembling" && (
        <View style={styles.assembleBanner}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={{ color: C.accent, fontSize: 11 }}>Gemini is assembling emote…</Text>
        </View>
      )}

      {status === "sending" && (
        <View style={styles.assembleBanner}>
          <ActivityIndicator size="small" color={C.emote} />
          <Text style={{ color: C.emote, fontSize: 11 }}>Eli is thinking…</Text>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={{ color: C.red, fontSize: 11, flex: 1 }}>⚠ {errorMessage}</Text>
          <Pressable onPress={() => useChat.setState({ errorMessage: null, status: "idle" })}>
            <Text style={{ color: C.red, fontSize: 14 }}>×</Text>
          </Pressable>
        </View>
      )}

      {lastFilteredContext && lastFilteredContext.length > 0 && source === "live" && (
        <View style={styles.contextBanner}>
          <Text style={styles.contextLabel}>Last context sent ({lastEmoteChars} chars):</Text>
          <Text style={styles.contextChips}>{lastFilteredContext.join("  •  ")}</Text>
        </View>
      )}

      <StagingTray />

      <InputBar
        mode={mode}
        pickerOpen={pickerOpen}
        onAttachTap={() => setPickerOpen((p) => !p)}
      />
      </KeyboardAvoidingView>

      <SessionTimeline
        visible={timelineOpen}
        entries={demoTimeline}
        stats={demoStats}
        onClose={() => setTimelineOpen(false)}
      />
      <SettingsPanel
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onDiagnosticsPress={() => {
          setSettingsOpen(false);
          setDiagnosticsOpen(true);
        }}
      />
      <DiagnosticsPanel visible={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />

      <MediaPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPickMode={(m) => {
          setPickerOpen(false);
          setCaptureMode(m);
        }}
      />
      <CaptureModal
        visible={captureMode !== null}
        initialMode={captureMode ?? "photo"}
        onClose={() => setCaptureMode(null)}
      />

      {sceneStatus === "analyzing" && (
        <View style={styles.sceneAnalyzingBanner}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={{ color: C.accent, fontSize: 11 }}>Analyzing scene with Gemini…</Text>
        </View>
      )}
      {sceneError && (
        <Pressable onPress={() => useChat.setState({ sceneError: null, sceneStatus: "idle" })}>
          <View style={styles.errorBanner}>
            <Text style={{ color: C.red, fontSize: 11, flex: 1 }}>Scene capture failed: {sceneError}</Text>
            <Text style={{ color: C.red, fontSize: 14 }}>×</Text>
          </View>
        </Pressable>
      )}
      {pendingSceneMemo && (
        <View style={styles.sceneMemoBanner}>
          <Text style={{ color: C.accent, fontSize: 11 }}>🎬 Scene pinned — next message will use it</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: "600",
    color: C.text,
    textAlign: "center",
    lineHeight: 38,
    marginBottom: 10,
  },
  emptyBody: {
    fontSize: 14,
    color: C.muted,
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 24,
  },
  sceneAnalyzingBanner: {
    position: "absolute",
    bottom: 88,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.accent + "14",
    borderWidth: 1,
    borderColor: C.accent + "44",
  },
  sceneMemoBanner: {
    position: "absolute",
    bottom: 88,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: C.accent + "10",
    borderWidth: 1,
    borderColor: C.accent + "55",
  },
  scenarioRow: { gap: 2, paddingHorizontal: 2 },
  scenarioChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 1,
  },
  liveHint: {
    color: C.muted,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
  loadDemoBtn: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  assembleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 4,
    backgroundColor: C.accent + "14",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.accent + "44",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.red + "14",
    borderWidth: 1,
    borderColor: C.red + "44",
  },
  contextBanner: {
    marginHorizontal: 14,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
  },
  contextLabel: { color: C.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 },
  contextChips: { color: C.textDim, fontSize: 11, marginTop: 2 },
  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: C.red + "14",
    borderColor: C.red + "44",
    borderWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    marginBottom: 6,
  },
});
