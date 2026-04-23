import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { useMode } from "@/stores/modeStore";

const GRACE_SECONDS = 10;

/**
 * Floating banner that appears at the top of the screen when auto-driving is
 * pending. Ticks a 10-second countdown. If Tim doesn't tap "Cancel" by then,
 * Driving Mode auto-confirms. Safe on any screen — rendered at the layout root.
 */
export function DrivingAutoBanner() {
  const drivingPendingSince = useMode((s) => s.drivingPendingSince);
  const confirmDrivingAuto = useMode((s) => s.confirmDrivingAuto);
  const cancelDrivingAuto = useMode((s) => s.cancelDrivingAuto);

  const [remaining, setRemaining] = useState(GRACE_SECONDS);

  useEffect(() => {
    if (!drivingPendingSince) return;

    // Reset countdown each time a new auto-entry begins.
    setRemaining(GRACE_SECONDS);

    const startedMs = new Date(drivingPendingSince).getTime();

    const tick = () => {
      const elapsedSec = Math.floor((Date.now() - startedMs) / 1000);
      const left = GRACE_SECONDS - elapsedSec;
      if (left <= 0) {
        confirmDrivingAuto();
      } else {
        setRemaining(left);
      }
    };

    // Prime immediately, then every 500ms for smooth countdown.
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [drivingPendingSince, confirmDrivingAuto]);

  if (!drivingPendingSince) return null;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={styles.banner}>
        <Text style={styles.headline}>🚗 Entering Driving Mode</Text>
        <Text style={styles.subline}>
          Vehicle detected · auto-switching in {remaining}s
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={cancelDrivingAuto} style={styles.cancelBtn}>
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: "600" }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={confirmDrivingAuto} style={styles.confirmBtn}>
            <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>
              Enter now
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
  },
  banner: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.accent + "66",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 420,
    width: "92%",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  headline: { color: C.accent, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  subline: { color: C.textDim, fontSize: 12, marginBottom: 10 },
  actions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.accent + "55",
    backgroundColor: C.accent + "18",
    alignItems: "center",
  },
});
