import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { useSettings, SettingsToggleKey } from "@/stores/settingsStore";

interface ToggleRow {
  key: SettingsToggleKey;
  icon: string;
  label: string;
  hint?: string;
}

interface LinkRow {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
}

interface Section {
  heading: string;
  toggles?: ToggleRow[];
  link?: LinkRow;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPeoplePress?: () => void;
  onDiagnosticsPress?: () => void;
}

export function SettingsPanel({ visible, onClose, onPeoplePress, onDiagnosticsPress }: Props) {
  const s = useSettings();

  const sections: Section[] = [
    {
      heading: "Context Services",
      toggles: [
        { key: "locationEnabled", icon: "📍", label: "Location / GPS" },
        { key: "weatherEnabled", icon: "☁️", label: "Weather" },
        { key: "fitbitEnabled", icon: "💓", label: "Fitbit / Health Connect" },
        { key: "ambientAudioEnabled", icon: "🎤", label: "Ambient Audio" },
        { key: "calendarEnabled", icon: "📅", label: "Calendar" },
        { key: "nowPlayingEnabled", icon: "🎵", label: "Now Playing" },
      ],
    },
    {
      heading: "Voice & Audio",
      toggles: [
        {
          key: "voiceVerification",
          icon: "🎙️",
          label: "Voice verification (PTT gate)",
          hint: "Confirms Tim's voice on mic input before packaging.",
        },
      ],
    },
    {
      heading: "People",
      link: {
        icon: "👥",
        label: "People",
        hint: "Manage roster →",
        onPress: onPeoplePress ?? (() => {}),
      },
    },
    {
      heading: "Session Behavior",
      toggles: [
        { key: "drivingModeAuto", icon: "🚗", label: "Driving Mode (auto on drive)" },
      ],
    },
    {
      heading: "Dev",
      link: {
        icon: "🔬",
        label: "Service Diagnostics",
        hint: "Run checks →",
        onPress: onDiagnosticsPress ?? (() => {}),
      },
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 44 }}>
            {sections.map((sec) => (
              <View key={sec.heading}>
                <Text style={styles.heading}>{sec.heading}</Text>
                {sec.toggles?.map((r) => {
                  const enabled = s[r.key];
                  const showHint = !!r.hint;
                  return (
                    <View key={r.key}>
                      <Pressable
                        onPress={() => s.toggle(r.key)}
                        style={[styles.row, { borderBottomWidth: showHint ? 0 : 1 }]}
                      >
                        <View style={styles.rowLeft}>
                          <Text style={{ fontSize: 17 }}>{r.icon}</Text>
                          <Text style={{ fontSize: 14, color: enabled ? C.text : C.muted }}>{r.label}</Text>
                        </View>
                        <View
                          style={[
                            styles.toggle,
                            {
                              backgroundColor: enabled ? C.accent : C.raised,
                              borderColor: enabled ? C.accent : C.border,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.knob,
                              { left: enabled ? 21 : 3 },
                            ]}
                          />
                        </View>
                      </Pressable>
                      {showHint && <Text style={styles.hint}>{r.hint}</Text>}
                    </View>
                  );
                })}
                {sec.link && (
                  <Pressable onPress={sec.link.onPress} style={[styles.row, { borderBottomWidth: 1 }]}>
                    <View style={styles.rowLeft}>
                      <Text style={{ fontSize: 17 }}>{sec.link.icon}</Text>
                      <Text style={{ fontSize: 14, color: C.text }}>{sec.link.label}</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: C.accent }}>{sec.link.hint}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    maxHeight: "80%",
  },
  handleRow: { alignItems: "center", paddingVertical: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
  heading: {
    fontSize: 11,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomColor: C.border,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  toggle: { width: 44, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: "center" },
  knob: { position: "absolute", top: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff" },
  hint: {
    fontSize: 10,
    color: C.muted,
    lineHeight: 15,
    paddingBottom: 10,
    paddingLeft: 27,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
});
