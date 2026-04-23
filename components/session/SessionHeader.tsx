import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { C } from "@/constants/theme";
import { EliAvatar } from "@/components/common/EliAvatar";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { useMode } from "@/stores/modeStore";
import { useConnection } from "@/stores/connectionStore";
import { useChat } from "@/stores/chatStore";

interface Props {
  connected: boolean;
  onTogglePress: () => void;
  onTimelinePress: () => void;
  onSettingsPress: () => void;
}

export function SessionHeader({
  connected,
  onTogglePress,
  onTimelinePress,
  onSettingsPress,
}: Props) {
  const driving = useMode((s) => s.driving);
  const enterDrivingManual = useMode((s) => s.enterDrivingManual);
  const exitDriving = useMode((s) => s.exitDriving);
  const toggleDriving = () => {
    if (driving) exitDriving();
    else enterDrivingManual();
  };

  // Connection awareness — a connected session on a degraded network
  // shows amber + "Offline · N queued" to signal that sends are queuing
  // rather than failing silently.
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

  const [modeMenuOpen, setModeMenuOpen] = useState(false);

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
              <StatusIndicator status={effectiveStatus} label={effectiveLabel} />
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {connected && (
            <Pressable
              onPress={toggleDriving}
              style={[
                styles.iconBtn,
                driving && {
                  backgroundColor: C.accent + "22",
                  borderColor: C.accent + "66",
                },
              ]}
              accessibilityLabel={driving ? "Exit Driving Mode" : "Enter Driving Mode"}
            >
              <Text style={{ fontSize: 16, color: driving ? C.accent : C.textDim }}>
                🚗
              </Text>
            </Pressable>
          )}
          <Pressable onPress={onSettingsPress} style={styles.iconBtn}>
            <Text style={{ fontSize: 16, color: C.textDim }}>⚙︎</Text>
          </Pressable>
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

      {/* Mode selector — single option for now, placeholder for v2 modes
          (Movie Mode, etc.). Compact pill so it doesn't dominate the header. */}
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => setModeMenuOpen(true)}
          style={styles.modeChip}
          accessibilityLabel="Select mode"
        >
          <Text style={styles.modeChipText}>Session</Text>
          <Text style={styles.modeChipChevron}>▾</Text>
        </Pressable>
      </View>

      <Modal
        visible={modeMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModeMenuOpen(false)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setModeMenuOpen(false)}
        />
        <View style={styles.modeMenu}>
          <View style={styles.modeMenuItem}>
            <Text style={styles.modeMenuItemLabel}>Session</Text>
            <Text style={styles.modeMenuCheck}>✓</Text>
          </View>
          <View style={styles.modeMenuDivider} />
          <Text style={styles.modeMenuSoon}>More modes coming soon</Text>
        </View>
      </Modal>
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
  modeRow: {
    alignItems: "center",
    paddingBottom: 8,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeChipText: { color: C.text, fontSize: 12, fontWeight: "600" },
  modeChipChevron: { color: C.muted, fontSize: 10 },
  modeMenu: {
    position: "absolute",
    top: 88,
    alignSelf: "center",
    minWidth: 200,
    backgroundColor: C.raised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  modeMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modeMenuItemLabel: { color: C.text, fontSize: 13, fontWeight: "600" },
  modeMenuCheck: { color: C.accent, fontSize: 13 },
  modeMenuDivider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 10,
    marginVertical: 2,
  },
  modeMenuSoon: {
    color: C.muted,
    fontSize: 11,
    fontStyle: "italic",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
