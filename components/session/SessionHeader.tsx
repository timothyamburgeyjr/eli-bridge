import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { EliAvatar } from "@/components/common/EliAvatar";
import { StatusIndicator } from "@/components/common/StatusIndicator";

interface Props {
  connected: boolean;
  onTogglePress: () => void;
  onTimelinePress: () => void;
  onSettingsPress: () => void;
  onModeChange: (m: "session" | "oneoff") => void;
  mode: "session" | "oneoff";
}

export function SessionHeader({
  connected,
  onTogglePress,
  onTimelinePress,
  onSettingsPress,
  onModeChange,
  mode,
}: Props) {
  return (
    <View>
      <View style={styles.row}>
        <Pressable onPress={onTimelinePress} style={styles.menuBtn}>
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

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <EliAvatar size={26} fontSize={11} />
          <View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.text }}>Eli Bridge</Text>
            <View style={{ marginTop: 2 }}>
              <StatusIndicator status={connected ? "green" : "red"} label={connected ? "Connected" : "Disconnected"} />
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {mode === "session" && (
            <Pressable onPress={onSettingsPress} style={styles.iconBtn}>
              <Text style={{ fontSize: 16, color: C.textDim }}>⚙︎</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onTogglePress}
            style={[
              styles.connectBtn,
              {
                backgroundColor: connected ? C.red + "18" : C.green + "18",
                borderColor: connected ? C.red + "55" : C.green + "55",
              },
            ]}
          >
            <Text style={{ color: connected ? C.red : C.green, fontSize: 12, fontWeight: "600" }}>
              {connected ? "End" : "Connect"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.modeToggle}>
        {(["session", "oneoff"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => onModeChange(m)}
            style={[
              styles.modeBtn,
              {
                backgroundColor: mode === m ? C.accent : "transparent",
              },
            ]}
          >
            <Text
              style={{
                color: mode === m ? "#fff" : C.muted,
                fontSize: 13,
                fontWeight: mode === m ? "700" : "400",
              }}
            >
              {m === "session" ? "Session" : "Quick Send"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  menuBtn: { padding: 4 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  connectBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modeToggle: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 6,
    backgroundColor: C.raised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 11,
    alignItems: "center",
  },
});
