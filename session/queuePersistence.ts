import { File, Paths } from "expo-file-system";
import type { QueuedSend } from "@/stores/chatStore";

const QUEUE_FILE = "offline-queue.v1.json";

/**
 * Persist the offline queue to the app's document directory (survives
 * process kills). Fire-and-forget by design — writes are best-effort
 * and shouldn't block the UI thread.
 */
export async function persistQueue(queue: QueuedSend[]): Promise<void> {
  try {
    const file = new File(Paths.document, QUEUE_FILE);
    try {
      file.delete();
    } catch {
      // didn't exist
    }
    if (queue.length === 0) return; // nothing to persist — file stays deleted
    file.create();
    file.write(JSON.stringify(queue));
  } catch (err) {
    console.warn("[queuePersistence] write failed:", err);
  }
}

/**
 * Read the persisted queue. Returns [] on first launch or if the file
 * doesn't exist. Skips entries whose attachment files are no longer on
 * disk (cache-dir recordings can be evicted by the OS between runs) and
 * logs how many were dropped.
 */
export async function hydrateQueue(): Promise<QueuedSend[]> {
  try {
    const file = new File(Paths.document, QUEUE_FILE);
    if (!file.exists) return [];
    const raw = await file.text();
    if (!raw) return [];
    const entries = JSON.parse(raw) as QueuedSend[];
    if (!Array.isArray(entries)) return [];

    const kept: QueuedSend[] = [];
    let droppedMissing = 0;
    for (const entry of entries) {
      const allFilesPresent = entry.attachments.every((att) => {
        try {
          const path = att.localPath.replace(/^file:\/\//, "");
          const f = new File(path);
          return f.exists;
        } catch {
          return false;
        }
      });
      if (allFilesPresent) {
        kept.push(entry);
      } else {
        droppedMissing++;
      }
    }
    if (droppedMissing > 0) {
      console.warn(
        `[queuePersistence] dropped ${droppedMissing} queued entries whose attachment files were missing on disk`
      );
    }
    console.log(`[queuePersistence] hydrated ${kept.length} queued sends`);
    return kept;
  } catch (err) {
    console.warn("[queuePersistence] read failed:", err);
    return [];
  }
}
