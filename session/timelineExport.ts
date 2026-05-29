import { useTimeline, TimelineEvent } from "@/stores/timelineStore";
import { writeNote, isVaultConfigured } from "@/services/obsidian";

/**
 * Timeline export — formats the current events as markdown and writes them
 * to a path in Tim's Obsidian vault. He picks it up via the vault sync on
 * his desktop. No native deps required (Obsidian's REST API is plain HTTP),
 * so this whole pipeline can ship via OTA.
 *
 * Diagnostic payloads (event.meta) are folded into the markdown as fenced
 * JSON blocks beneath the relevant entry, so error stacks and request bodies
 * survive the export intact for debugging.
 */

const VAULT_FOLDER = "00 - Diagnostics/Timelines";

/** Wire the timelineStore's exporter at app boot (called from _layout.tsx). */
export function installTimelineExporter(): void {
  useTimeline.getState().setExporter(async () => {
    const events = useTimeline.getState().events;
    if (events.length === 0) {
      throw new Error("Timeline is empty — nothing to export.");
    }
    if (!isVaultConfigured()) {
      throw new Error(
        "Obsidian vault not configured. Set EXPO_PUBLIC_VAULT_URL and EXPO_PUBLIC_VAULT_TOKEN in EAS env."
      );
    }
    const { path, markdown } = formatForVault(events);
    await writeNote(path, markdown);
    return { vaultPath: path };
  });
}

/**
 * Build the vault path + markdown body for an export. Pure — exported for
 * testing and so other callers (future "share to clipboard" flow) can reuse
 * the same formatter.
 */
export function formatForVault(events: TimelineEvent[]): {
  path: string;
  markdown: string;
} {
  const first = new Date(events[0].t);
  const last = new Date(events[events.length - 1].t);

  // ISO-style filename, safe for filesystems + sorts chronologically when
  // listed: "timeline-2026-05-26-1542.md"
  const slug = isoSlug(first);
  const path = `${VAULT_FOLDER}/timeline-${slug}.md`;

  const lines: string[] = [];
  lines.push(`# Session Timeline — ${friendly(first)}`);
  lines.push("");
  lines.push(`- **Session start:** ${friendly(first)}`);
  lines.push(`- **Last event:** ${friendly(last)}`);
  lines.push(`- **Duration:** ${formatDuration(last.getTime() - first.getTime())}`);
  lines.push(`- **Events:** ${events.length}`);
  lines.push(`- **Exported:** ${friendly(new Date())}`);
  lines.push("");

  // Per-kind tallies — quick at-a-glance counts for the diagnostic side.
  const counts = countByKind(events);
  if (Object.keys(counts).length > 0) {
    lines.push("## Counts");
    lines.push("");
    for (const [kind, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${kind}: ${n}`);
    }
    lines.push("");
  }

  // Per-subsystem tallies — how many calls hit each service. Surfaces e.g.
  // "elevenlabs: 12" next to "gemini: 30" so the diagnostic read shows where
  // the traffic (and any failures) concentrated.
  const bySubsystem = countBySubsystem(events);
  if (Object.keys(bySubsystem).length > 0) {
    lines.push("## By subsystem");
    lines.push("");
    for (const [sub, n] of Object.entries(bySubsystem).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${sub}: ${n}`);
    }
    lines.push("");
  }

  lines.push("## Events");
  lines.push("");

  for (const e of events) {
    const clock = clockTime(new Date(e.t));
    lines.push(`### ${clock} ${e.icon} ${escapeMd(e.label)}`);
    const summary = traceSummary(e);
    if (summary) {
      lines.push("");
      lines.push(`\`${summary}\``);
    }
    if (e.detail) {
      lines.push("");
      lines.push(escapeMd(e.detail));
    }
    if (e.meta && Object.keys(e.meta).length > 0) {
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(e.meta, null, 2));
      lines.push("```");
    }
    lines.push("");
  }

  return { path, markdown: lines.join("\n") };
}

function countByKind(events: TimelineEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}

function countBySubsystem(events: TimelineEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (!e.subsystem) continue;
    out[e.subsystem] = (out[e.subsystem] ?? 0) + 1;
  }
  return out;
}

/** One-line trace summary for an event's markdown heading, or "" when the
 *  event carries no subsystem/API/timing data. */
function traceSummary(e: TimelineEvent): string {
  const parts: string[] = [];
  if (e.subsystem) parts.push(`[${e.subsystem}]`);
  if (e.api?.method || e.api?.endpoint) {
    parts.push(`${e.api.method ?? ""} ${e.api.endpoint ?? ""}`.trim());
  }
  const ms = e.durationMs ?? e.api?.durationMs;
  if (ms != null) parts.push(formatMs(ms));
  if (e.api?.status != null) parts.push(String(e.api.status));
  if (e.api?.responseBytes != null && e.api.responseBytes > 0) {
    parts.push(formatBytes(e.api.responseBytes));
  }
  return parts.join(" · ");
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

function isoSlug(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}-${hh}${mi}`;
}

function friendly(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function clockTime(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const hr12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hr12}:${m} ${ampm}`;
}

function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSec}s`;
}

/** Strip Markdown syntax characters that could break heading/list rendering. */
function escapeMd(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}
