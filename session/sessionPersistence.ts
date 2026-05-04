import { File, Paths } from "expo-file-system";
import type { BuiltJournal } from "./journalBuilder";

const SESSION_FILE = "session-state.v1.json";

/**
 * Subset of SessionStore state worth persisting across an OOM kill.
 * Excludes transient/derivable fields (errorMessage, biographyLoaded —
 * latter resets on session start anyway).
 *
 * Status: only "active" and "journal-ready" matter for recovery.
 *  - "active" → on relaunch, treat session as still active so End
 *    Session works and produces a journal from the persisted chat.
 *  - "journal-ready" → preserve the drafted journal so Tim can still
 *    Save to Vault after the crash.
 *  - "saving" / "ending" / etc. are reset to "active" since those are
 *    in-flight states the crash interrupted; the user's intent was to
 *    end, not to commit a half-drafted journal.
 */
export interface PersistedSession {
  sessionId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  status: "idle" | "active" | "journal-ready" | "saved";
  journal: BuiltJournal | null;
}

export async function persistSession(state: PersistedSession): Promise<void> {
  try {
    const file = new File(Paths.document, SESSION_FILE);
    try {
      file.delete();
    } catch {
      // didn't exist
    }
    // Don't bother writing an "idle" no-op state.
    if (state.status === "idle" && !state.sessionId) return;
    file.create();
    file.write(JSON.stringify(state));
  } catch (err) {
    console.warn("[sessionPersistence] write failed:", err);
  }
}

export async function hydrateSession(): Promise<PersistedSession | null> {
  try {
    const file = new File(Paths.document, SESSION_FILE);
    if (!file.exists) return null;
    const raw = await file.text();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed || typeof parsed !== "object") return null;
    console.log(
      `[sessionPersistence] hydrated state status=${parsed.status} sessionId=${parsed.sessionId}`
    );
    return parsed;
  } catch (err) {
    console.warn("[sessionPersistence] read failed:", err);
    return null;
  }
}

/** Wipe the persisted state — used on Discard or successful Save. */
export async function clearPersistedSession(): Promise<void> {
  try {
    const file = new File(Paths.document, SESSION_FILE);
    if (file.exists) file.delete();
  } catch {
    // nothing to do
  }
}
