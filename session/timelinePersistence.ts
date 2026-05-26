import { File, Paths } from "expo-file-system";
import type { TimelineEvent } from "@/stores/timelineStore";

const TIMELINE_FILE = "session-timeline.v1.json";

/**
 * Persist the timeline to the document directory so it survives OOM kills.
 * Same pattern as chatPersistence — fire-and-forget, caller debounces.
 */
export async function persistTimeline(events: TimelineEvent[]): Promise<void> {
  try {
    const file = new File(Paths.document, TIMELINE_FILE);
    try {
      file.delete();
    } catch {
      // didn't exist
    }
    if (events.length === 0) return;
    file.create();
    file.write(JSON.stringify(events));
  } catch (err) {
    console.warn("[timelinePersistence] write failed:", err);
  }
}

export async function hydrateTimeline(): Promise<TimelineEvent[]> {
  try {
    const file = new File(Paths.document, TIMELINE_FILE);
    if (!file.exists) return [];
    const raw = await file.text();
    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];
    const kept: TimelineEvent[] = [];
    for (const m of items) {
      if (!m || typeof m !== "object" || !m.id || !m.kind || typeof m.t !== "number") continue;
      kept.push(m as TimelineEvent);
    }
    console.log(`[timelinePersistence] hydrated ${kept.length} events`);
    return kept;
  } catch (err) {
    console.warn("[timelinePersistence] read failed:", err);
    return [];
  }
}
