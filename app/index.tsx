import React, { useState, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import { useSettings } from "@/stores/settingsStore";
import { SessionHeader } from "@/components/session/SessionHeader";
import { SessionTimeline } from "@/components/session/SessionTimeline";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ChatStream } from "@/components/chat/ChatStream";
import { InputBar } from "@/components/chat/InputBar";
import { EliAvatar } from "@/components/common/EliAvatar";
import { SCENARIOS, getScenario, ScenarioId } from "@/data/scenarios";

type Mode = "session" | "oneoff";

export default function Main() {
  const [mode, setMode] = useState<Mode>("session");
  const [connected, setConnected] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("ys");

  const elevenLabsAutoplay = useSettings((s) => s.elevenLabsAutoplay);

  const scenario = useMemo(() => getScenario(scenarioId), [scenarioId]);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
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
            {SCENARIOS.map((s) => {
              const active = s.id === scenarioId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setScenarioId(s.id);
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

          <Pressable onPress={() => setShowChat(true)} style={styles.loadDemoBtn}>
            <Text style={{ color: C.muted, fontSize: 12 }}>Load demo chat ↓</Text>
          </Pressable>
        </View>
      ) : (
        <ChatStream messages={scenario.messages} autoplay={elevenLabsAutoplay} micActive={micActive} />
      )}

      {micActive && (
        <View style={styles.recordingBanner}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.red }} />
          <Text style={{ fontSize: 12, color: C.red }}>Recording… tap 🎙️ to stop</Text>
        </View>
      )}

      <InputBar
        mode={mode}
        micActive={micActive}
        pickerOpen={pickerOpen}
        onAttachTap={() => setPickerOpen((p) => !p)}
        onMicTap={() => setMicActive((m) => !m)}
        onSend={() => {
          /* Phase 1 stub: input clears itself */
        }}
      />

      <SessionTimeline
        visible={timelineOpen}
        entries={scenario.timeline}
        stats={scenario.stats}
        onClose={() => setTimelineOpen(false)}
      />
      <SettingsPanel visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
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
  scenarioRow: {
    gap: 2,
    paddingHorizontal: 2,
  },
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
  loadDemoBtn: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
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
