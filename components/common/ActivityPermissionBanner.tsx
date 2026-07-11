import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { C } from "@/constants/theme";
import { hasActivityPermission } from "@/modules/activity-recognition";
import { useCompanionName } from "@/session/SessionStore";

/**
 * Banner that surfaces a denied ACTIVITY_RECOGNITION permission instead of
 * letting it fail silently (the same trap the location permission hit when
 * Android auto-revoked it). Shows when the permission is denied; tapping
 * deep-links to the OS app-settings screen via `Linking.openSettings()` so
 * Tim can grant without hunting through menus.
 *
 * Dismissal is per-session — re-mount on cold start re-checks. We
 * deliberately don't run an AppState listener on foreground because the
 * banner re-appearing the moment Tim returns from settings (still showing
 * stale "denied" before the OS write propagates) is more confusing than
 * useful. A dismiss button is provided as the escape hatch.
 *
 * Polls once after a 3s grace so the auto-prompt on session start has time
 * to land before we accuse the user of denying.
 */
export function ActivityPermissionBanner() {
  const who = useCompanionName();
  const [denied, setDenied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const granted = await hasActivityPermission();
        if (!cancelled) setDenied(!granted);
      } catch {
        // Native module unavailable (older device, no Play Services) — silent.
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!denied || dismissed) return null;

  return (
    <View style={styles.banner}>
      <Pressable
        onPress={() => {
          Linking.openSettings();
          setDismissed(true);
        }}
        style={styles.tappable}
      >
        <Text style={styles.label}>⚠ Activity recognition disabled</Text>
        <Text style={styles.sub}>
          {`${who} won't know if you're walking, driving, or cycling. Tap to grant.`}
        </Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={styles.dismiss}>
        <Text style={{ color: C.muted, fontSize: 18 }}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.amber + "1A",
    borderColor: C.amber + "55",
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tappable: { flex: 1 },
  label: { color: C.amber, fontSize: 13, fontWeight: "700" },
  sub: { color: C.textDim, fontSize: 11, marginTop: 2, lineHeight: 14 },
  dismiss: { paddingHorizontal: 6 },
});
