import { File, Paths } from "expo-file-system";
import type { ChatItem } from "@/components/chat/ChatStream";

const MESSAGES_FILE = "chat-messages.v1.json";

/**
 * Persist the chat thread to the document directory so it survives a
 * deep-background OOM kill. Without this, every process kill resets the
 * chat to empty — which Tim hit at the zoo and lost the entire trip's
 * thread + active session.
 *
 * Fire-and-forget. Caller should debounce — message arrays update on
 * every send/receive/system-card-emit, and a write per change is
 * unnecessary churn.
 */
export async function persistMessages(messages: ChatItem[]): Promise<void> {
  try {
    const file = new File(Paths.document, MESSAGES_FILE);
    try {
      file.delete();
    } catch {
      // didn't exist
    }
    if (messages.length === 0) return;
    file.create();
    file.write(JSON.stringify(messages));
  } catch (err) {
    console.warn("[chatPersistence] write failed:", err);
  }
}

/**
 * Read persisted messages. Returns [] on first launch / missing file /
 * corruption. Filters out messages whose attachment files are no longer
 * on disk (cache-dir contents can be evicted by Android between runs)
 * so we don't try to render broken images.
 */
export async function hydrateMessages(): Promise<ChatItem[]> {
  try {
    const file = new File(Paths.document, MESSAGES_FILE);
    if (!file.exists) return [];
    const raw = await file.text();
    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];

    const kept: ChatItem[] = [];
    for (const m of items) {
      if (!m || typeof m !== "object" || !m.id || !m.from) continue;
      const atts = (m as { attachments?: { localPath?: string }[] }).attachments;
      if (atts && atts.length > 0) {
        // Drop attachments whose local files no longer exist; keep the
        // bubble itself with text intact.
        const surviving = atts.filter((a) => {
          if (!a?.localPath) return false;
          try {
            const path = a.localPath.replace(/^file:\/\//, "");
            return new File(path).exists;
          } catch {
            return false;
          }
        });
        kept.push({ ...m, attachments: surviving } as ChatItem);
      } else {
        kept.push(m as ChatItem);
      }
    }
    console.log(`[chatPersistence] hydrated ${kept.length} messages`);
    return kept;
  } catch (err) {
    console.warn("[chatPersistence] read failed:", err);
    return [];
  }
}
