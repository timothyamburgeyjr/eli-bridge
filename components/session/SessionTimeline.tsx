import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { C } from "@/constants/theme";
import {
  useTimeline,
  TimelineEvent,
  TimelineEventKind,
} from "@/stores/timelineStore";

/**
 * Session Timeline panel — slide-in from the left, shows the live event log
 * of the current session plus a banner of derived stats. Doubles as a
 * diagnostic surface: errors and queued sends show up here with red icons,
 * and the Export button dumps the whole log to Obsidian as markdown.
 *
 * Both the presentation and diagnostic data come from `useTimeline` —
 * sources around the app (sendMessage, captureScene, driving poller,
 * modeStore, abortPipeline, audioStore) push events into it via
 * `useTimeline.getState().append(...)`. There is no demo-data plumbing
 * anymore; everything is live.
 */

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Back-compat type aliases for the demo scenario files. The demo data shape
// pre-dated the live timeline store; the arrays are no longer rendered (the
// component reads useTimeline directly), but the demo data files still
// compile against these stubs so we don't churn the demo modules.
export interface TimelineEntry {
  time: string;
  icon: string;
  label: string;
  sub?: string;
}
export interface TimelineStat {
  value: string;
  label: string;
}

export function SessionTimeline({ visible, onClose }: Props) {
  const events = useTimeline((s) => s.events);
  const exporting = useTimeline((s) => s.exporting);
  const lastExport = useTimeline((s) => s.lastExport);
  const exportToVault = useTimeline((s) => s.exportToVault);

  const stats = deriveStats(events);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <Text style={styles.title}>Session Timeline</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: C.muted, fontSize: 20 }}>×</Text>
              </Pressable>
            </View>
            <View style={styles.statsRow}>
              {stats.map((s) => (
                <View key={s.label} style={{ alignItems: "center" }}>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.exportRow}>
              <Pressable
                onPress={exportToVault}
                disabled={exporting || events.length === 0}
                style={[
                  styles.exportBtn,
                  (exporting || events.length === 0) && { opacity: 0.5 },
                ]}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={styles.exportBtnText}>
                    📤 Export to Obsidian
                  </Text>
                )}
              </Pressable>
            </View>
            {lastExport ? (
              <Text
                style={[
                  styles.exportResult,
                  { color: lastExport.ok ? C.green : C.red },
                ]}
                numberOfLines={2}
              >
                {lastExport.ok
                  ? `✓ Saved to ${lastExport.vaultPath}`
                  : `⚠ ${lastExport.error}`}
              </Text>
            ) : null}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {events.length === 0 ? (
              <Text style={styles.empty}>
                No events yet. Send a message, snap a photo, or change locations
                — they&apos;ll show up here.
              </Text>
            ) : (
              // Render newest at top — the most useful order both for "what
              // just happened" and for diagnostic review of a recent failure.
              [...events].reverse().map((event, i) => (
                <TimelineRow
                  key={event.id}
                  event={event}
                  isLast={i === events.length - 1}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

interface TimelineRowProps {
  event: TimelineEvent;
  isLast: boolean;
}

function TimelineRow({ event, isLast }: TimelineRowProps) {
  const color = colorForKind(event.kind);
  return (
    <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
      <View style={{ alignItems: "center" }}>
        <View style={[styles.iconDot, { borderColor: color + "66" }]}>
          <Text style={{ fontSize: 14 }}>{event.icon}</Text>
        </View>
        {!isLast && (
          <View
            style={{
              width: 1,
              flex: 1,
              backgroundColor: C.border,
              marginTop: 4,
              minHeight: 16,
            }}
          />
        )}
      </View>
      <View style={{ paddingTop: 4, flex: 1 }}>
        <Text style={[styles.eventLabel, { color }]}>{event.label}</Text>
        {event.detail ? (
          <Text style={styles.eventDetail} numberOfLines={3}>
            {event.detail}
          </Text>
        ) : null}
        <Text style={styles.eventTime}>{clockTime(new Date(event.t))}</Text>
      </View>
    </View>
  );
}

interface DerivedStat {
  value: string;
  label: string;
}

/**
 * Compute a small set of headline numbers from the event log. Picked for at-
 * a-glance utility: Tim opens the panel and these answer "how big has this
 * session been?" without needing to scroll.
 */
function deriveStats(events: TimelineEvent[]): DerivedStat[] {
  const counts = new Map<TimelineEventKind, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);

  const sent = counts.get("message-sent") ?? 0;
  const photos = countAttachmentsByKind(events, "image");
  const places = (counts.get("saved-place") ?? 0) + (counts.get("location") ?? 0);
  const errors = counts.get("error") ?? 0;

  return [
    { value: String(sent), label: "Messages" },
    { value: String(photos), label: "Photos" },
    { value: String(places), label: "Places" },
    { value: String(errors), label: "Errors" },
  ];
}

function countAttachmentsByKind(events: TimelineEvent[], kind: string): number {
  let n = 0;
  for (const e of events) {
    if (e.kind !== "attachment-staged") continue;
    const m = e.meta as { kind?: string } | undefined;
    if (m?.kind === kind) n++;
  }
  return n;
}

function colorForKind(kind: TimelineEventKind): string {
  switch (kind) {
    case "error":
    case "message-queued":
      return C.red;
    case "abort":
      return C.amber;
    case "drive-enter":
    case "drive-exit":
    case "venue-enter":
    case "venue-exit":
      return C.accent;
    case "session-start":
    case "session-end":
      return C.sky;
    default:
      return C.text;
  }
}

function clockTime(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const hr12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hr12}:${m} ${ampm}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "82%",
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: C.text },
  statsRow: { flexDirection: "row", gap: 20, marginBottom: 12 },
  statValue: { fontSize: 18, fontWeight: "700", color: C.accent },
  statLabel: { fontSize: 10, color: C.muted, marginTop: 2 },
  exportRow: { flexDirection: "row" },
  exportBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: C.accent + "1A",
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  exportBtnText: { color: C.accent, fontSize: 13, fontWeight: "700" },
  exportResult: { marginTop: 8, fontSize: 11, lineHeight: 14 },
  empty: {
    color: C.muted,
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 17,
  },
  iconDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  eventLabel: { fontSize: 13, fontWeight: "600" },
  eventDetail: { fontSize: 11, color: C.textDim, marginTop: 2, lineHeight: 15 },
  eventTime: { fontSize: 10, color: C.muted, marginTop: 2 },
});
