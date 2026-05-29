import React, { useState } from "react";
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
 * sources around the app (sendMessage, captureScene, session poller,
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

// ── Verbosity filter ────────────────────────────────────────────────
type TimelineFilter = "activity" | "trace" | "errors";

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "trace", label: "Full trace" },
  { key: "errors", label: "Errors" },
];

function labelForFilter(f: TimelineFilter): string {
  return FILTERS.find((x) => x.key === f)?.label ?? "Activity";
}

/** Decide whether an event survives the active filter. Events with no `level`
 *  are treated as "info" (all the legacy events predate the field). */
function matchesFilter(event: TimelineEvent, filter: TimelineFilter): boolean {
  const level = event.level ?? "info";
  switch (filter) {
    case "trace":
      return true;
    case "errors":
      return level === "error" || level === "warn";
    case "activity":
    default:
      return level !== "debug";
  }
}

export function SessionTimeline({ visible, onClose }: Props) {
  const events = useTimeline((s) => s.events);
  const exporting = useTimeline((s) => s.exporting);
  const lastExport = useTimeline((s) => s.lastExport);
  const exportToVault = useTimeline((s) => s.exportToVault);

  // Tapping a row opens a detail sheet with the full event — untruncated
  // detail, full timestamp, and the diagnostic meta payload that's
  // otherwise only visible in the Obsidian export.
  const [detailEvent, setDetailEvent] = useState<TimelineEvent | null>(null);

  // Verbosity filter. The full-trace logging emits a debug event per API call,
  // which would bury the everyday events — so "Activity" (the default) hides
  // debug, "Full trace" shows everything, "Errors" isolates failures.
  const [filter, setFilter] = useState<TimelineFilter>("activity");

  const stats = deriveStats(events);
  const visibleEvents = events.filter((e) => matchesFilter(e, filter));

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
            <View style={styles.filterRow}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
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
            ) : visibleEvents.length === 0 ? (
              <Text style={styles.empty}>
                No events match the “{labelForFilter(filter)}” filter. Switch to
                “Full trace” to see every API call.
              </Text>
            ) : (
              // Render newest at top — the most useful order both for "what
              // just happened" and for diagnostic review of a recent failure.
              [...visibleEvents].reverse().map((event, i) => (
                <TimelineRow
                  key={event.id}
                  event={event}
                  isLast={i === visibleEvents.length - 1}
                  onPress={() => setDetailEvent(event)}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>

      <TimelineEventDetail
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
      />
    </Modal>
  );
}

/**
 * Detail sheet for a single timeline event. Opens on row tap. Shows the
 * full headline, a humanized kind label, the absolute timestamp, the
 * untruncated detail line, and — most usefully for diagnostics — the
 * `meta` payload (error messages, lat/lon, request data, etc.) rendered
 * as a readable key/value list. Rendered as its own Modal stacked above
 * the timeline panel so it overlays cleanly.
 */
function TimelineEventDetail({
  event,
  onClose,
}: {
  event: TimelineEvent | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={event !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.detailBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.detailCard}>
          {event ? (
            <>
              <View style={styles.detailHeader}>
                <View
                  style={[
                    styles.detailIconDot,
                    { borderColor: colorForKind(event.kind) + "66" },
                  ]}
                >
                  <Text style={{ fontSize: 20 }}>{event.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.detailLabel, { color: colorForKind(event.kind) }]}
                  >
                    {event.label}
                  </Text>
                  <Text style={styles.detailKind}>{humanizeKind(event.kind)}</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Text style={{ color: C.muted, fontSize: 20 }}>×</Text>
                </Pressable>
              </View>

              <ScrollView style={{ maxHeight: 420 }}>
                <DetailField label="When" value={fullTimestamp(new Date(event.t))} />

                {event.subsystem ? (
                  <DetailField label="Subsystem" value={event.subsystem} />
                ) : null}

                {event.api?.endpoint ? (
                  <DetailField
                    label="API"
                    value={`${event.api.method ?? ""} ${event.api.endpoint}`.trim()}
                  />
                ) : null}

                {event.api?.status != null ? (
                  <DetailField label="Status" value={String(event.api.status)} />
                ) : null}

                {(() => {
                  const ms = event.durationMs ?? event.api?.durationMs;
                  return ms != null ? (
                    <DetailField label="Duration" value={formatMs(ms)} />
                  ) : null;
                })()}

                {event.api?.requestBytes != null ||
                event.api?.responseBytes != null ? (
                  <DetailField
                    label="Transfer"
                    value={[
                      event.api?.requestBytes != null
                        ? `↑ ${formatBytes(event.api.requestBytes)}`
                        : null,
                      event.api?.responseBytes != null
                        ? `↓ ${formatBytes(event.api.responseBytes)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("   ")}
                  />
                ) : null}

                {event.detail ? (
                  <DetailField label="Details" value={event.detail} />
                ) : null}

                {event.meta && Object.keys(event.meta).length > 0 ? (
                  <View style={styles.metaBlock}>
                    <Text style={styles.detailFieldLabel}>Diagnostic data</Text>
                    {Object.entries(event.meta).map(([k, v]) => (
                      <View key={k} style={styles.metaRow}>
                        <Text style={styles.metaKey}>{k}</Text>
                        <Text style={styles.metaValue} selectable>
                          {formatMetaValue(v)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ScrollView>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailFieldLabel}>{label}</Text>
      <Text style={styles.detailFieldValue} selectable>
        {value}
      </Text>
    </View>
  );
}

/** "message-sent" → "Message Sent". */
function humanizeKind(kind: TimelineEventKind): string {
  return kind
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "Wed, May 28, 2026 · 1:42:07 PM" — full date + seconds for diagnostics. */
function fullTimestamp(d: Date): string {
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${date} · ${time}`;
}

/** Render a meta value — primitives as-is, objects/arrays as pretty JSON. */
function formatMetaValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

interface TimelineRowProps {
  event: TimelineEvent;
  isLast: boolean;
  onPress: () => void;
}

function TimelineRow({ event, isLast, onPress }: TimelineRowProps) {
  const color = colorForEvent(event);
  const hasMeta = !!event.meta && Object.keys(event.meta).length > 0;
  const trace = traceSummary(event);
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
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          { paddingTop: 4, flex: 1 },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Text style={[styles.eventLabel, { color }]}>{event.label}</Text>
        {event.subsystem || trace ? (
          <View style={styles.traceRow}>
            {event.subsystem ? (
              <View style={[styles.subsystemChip, { borderColor: color + "55" }]}>
                <Text style={[styles.subsystemChipText, { color }]}>
                  {event.subsystem}
                </Text>
              </View>
            ) : null}
            {trace ? <Text style={styles.traceText}>{trace}</Text> : null}
          </View>
        ) : null}
        {event.detail ? (
          <Text style={styles.eventDetail} numberOfLines={3}>
            {event.detail}
          </Text>
        ) : null}
        <View style={styles.eventFooter}>
          <Text style={styles.eventTime}>{clockTime(new Date(event.t))}</Text>
          {/* Affordance hint that there's a detail view — stronger when the
              event carries diagnostic meta worth drilling into. */}
          <Text style={styles.eventDetailHint}>
            {hasMeta ? "details ›" : "›"}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Compact "1.2s · 200 · 84KB" trace line for a row, or null when the event
 *  carries no timing/status/size. */
function traceSummary(event: TimelineEvent): string | null {
  const parts: string[] = [];
  const ms = event.durationMs ?? event.api?.durationMs;
  if (ms != null) parts.push(formatMs(ms));
  if (event.api?.status != null) parts.push(String(event.api.status));
  const bytes = event.api?.responseBytes;
  if (bytes != null && bytes > 0) parts.push(formatBytes(bytes));
  return parts.length ? parts.join(" · ") : null;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/** Level-aware row color: errors red, warnings amber, otherwise by kind. */
function colorForEvent(event: TimelineEvent): string {
  const level = event.level ?? "info";
  if (level === "error") return C.red;
  if (level === "warn") return C.amber;
  return colorForKind(event.kind);
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
    case "api-call":
      return C.muted;
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
  filterRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.raised,
  },
  filterChipActive: {
    backgroundColor: C.accent + "22",
    borderColor: C.accent + "77",
  },
  filterChipText: { fontSize: 11, color: C.muted, fontWeight: "600" },
  filterChipTextActive: { color: C.accent },
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
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  eventTime: { fontSize: 10, color: C.muted },
  eventDetailHint: { fontSize: 10, color: C.accent, fontWeight: "600" },
  traceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  subsystemChip: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: C.surface,
  },
  subsystemChipText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "lowercase",
    letterSpacing: 0.3,
  },
  traceText: {
    fontSize: 10,
    color: C.muted,
    fontFamily: "monospace",
  },

  // ── Detail sheet ────────────────────────────────────────────────
  detailBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  detailCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  detailIconDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: { fontSize: 15, fontWeight: "700" },
  detailKind: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailField: { marginBottom: 14 },
  detailFieldLabel: {
    fontSize: 10,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailFieldValue: { fontSize: 13, color: C.text, lineHeight: 18 },
  metaBlock: { marginTop: 4 },
  metaRow: {
    backgroundColor: C.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  metaKey: {
    fontSize: 11,
    color: C.accent,
    fontWeight: "700",
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    color: C.textDim,
    fontFamily: "monospace",
    lineHeight: 16,
  },
});
