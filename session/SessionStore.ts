import { create } from "zustand";
import { readNote, writeNote, isVaultConfigured } from "@/services/obsidian";
import { updateScene as kindroidUpdateScene } from "@/services/kindroid";
import { setSessionContext } from "@/services/gemini";
import { gatherSensorSnapshot } from "./liveSensors";
import { buildJournal, journalFilename, BuiltJournal } from "./journalBuilder";
import { startDrivingPoll, stopDrivingPoll } from "./drivingPoller";
import {
  collectSessionAttachments,
  archiveSessionAttachments,
  renderAttachmentsBlock,
} from "./sessionAttachments";
import {
  persistSession,
  hydrateSession as hydratePersistedSession,
  clearPersistedSession,
} from "./sessionPersistence";
import { resetPersonContextCache } from "@/people/personContext";
import { useMode } from "@/stores/modeStore";
import { useChat } from "@/stores/chatStore";
import type { ChatItem } from "@/components/chat/ChatStream";

const BIOGRAPHY_PATH = "08 - Elias Reed/biography.md";

export type SessionStatus =
  | "idle" // no active session
  | "starting" // biography load / initial scene push
  | "active" // session in progress
  | "ending" // journal draft in progress
  | "journal-ready" // draft rendered, awaiting Save/Discard
  | "saving" // writing to vault
  | "saved" // journal written
  | "error";

interface SessionState {
  status: SessionStatus;
  sessionId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  biographyLoaded: boolean;
  journal: BuiltJournal | null;
  errorMessage: string | null;

  /** Begin a new session — load biography, push initial scene, reset ledgers. */
  start: () => Promise<void>;

  /** End the session, draft the journal, and hand control to the UI for Save/Discard. */
  end: (messages: ChatItem[]) => Promise<void>;

  /**
   * Save the drafted journal to the vault root. When `archiveAttachments`
   * is true (default), all image/audio attachments captured during the
   * session are uploaded alongside the journal markdown and embedded in a
   * `## Attachments` section. Successfully-archived images are then deleted
   * from the self-hosted image server (vault becomes the canonical copy).
   */
  saveJournal: (
    finalTitle?: string,
    finalMarkdown?: string,
    archiveAttachments?: boolean
  ) => Promise<void>;

  /** Discard the draft and return to idle. */
  discardJournal: () => void;

  /**
   * Restore session state from disk after a process kill. Called once on
   * app boot. Resets in-flight statuses (saving, ending) to "active" since
   * the user's intent was to act, not to commit a half-drafted journal.
   */
  hydrate: () => Promise<void>;
}

function newSessionId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function timeOfDayHint(): string {
  const h = new Date().getHours();
  if (h < 6) return "late night";
  if (h < 12) return "morning light";
  if (h < 18) return "afternoon";
  return "evening";
}

/** Compose a short (≤160 char) Eli-centric scene from current sensors. */
async function composeInitialScene(): Promise<string> {
  let location = "home";
  try {
    const sensors = await gatherSensorSnapshot();
    location =
      sensors.location?.placeName ??
      (sensors.location
        ? `${sensors.location.latitude.toFixed(3)}, ${sensors.location.longitude.toFixed(3)}`
        : "home");
  } catch {
    // fall through — location stays "home"
  }
  const tod = timeOfDayHint();
  const base = `Eli is adjacent to Tim at ${location}, ${tod}.`;
  return base.length > 160 ? base.slice(0, 157).trimEnd() + "…" : base;
}

/**
 * Persist the relevant slice of the current store to disk so a deep-
 * background OOM kill doesn't lose Tim's active session. Fire-and-
 * forget; called from every action that mutates persisted fields.
 */
function persistCurrent(get: () => SessionState): void {
  const s = get();
  // Only persist statuses worth restoring. In-flight states (starting,
  // ending, saving) reset to "active" on next launch — user's intent was
  // to do the action, not to commit a half-completed transition.
  let snapStatus: "idle" | "active" | "journal-ready" | "saved";
  switch (s.status) {
    case "active":
    case "starting":
    case "ending":
    case "saving":
      snapStatus = "active";
      break;
    case "journal-ready":
      snapStatus = "journal-ready";
      break;
    case "saved":
      snapStatus = "saved";
      break;
    default:
      snapStatus = "idle";
  }
  persistSession({
    sessionId: s.sessionId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    status: snapStatus,
    journal: s.journal,
  });
}

export const useSession = create<SessionState>((set, get) => ({
  status: "idle",
  sessionId: null,
  startedAt: null,
  endedAt: null,
  biographyLoaded: false,
  journal: null,
  errorMessage: null,

  start: async () => {
    if (get().status === "active" || get().status === "starting") return;

    const sessionId = newSessionId();
    const startedAt = new Date().toISOString();
    set({
      status: "starting",
      sessionId,
      startedAt,
      endedAt: null,
      biographyLoaded: false,
      journal: null,
      errorMessage: null,
    });
    persistCurrent(get);

    // Reset per-session caches. chatStore clearing is the caller's responsibility
    // (via chatStore.clear()) so session-start doesn't clobber existing chat.
    resetPersonContextCache();

    // Start background GPS polling so driving-mode auto-detection fires even
    // when Tim isn't actively sending messages (the common case — he starts
    // a drive and doesn't talk to Eli immediately).
    startDrivingPoll();

    // Fire both external I/O in parallel — neither gate the session becoming active
    const bioPromise = (async () => {
      if (!isVaultConfigured()) {
        console.log("[session] vault not configured, skipping biography load");
        return;
      }
      try {
        const bio = await readNote(BIOGRAPHY_PATH);
        if (bio.trim().length >= 40) {
          setSessionContext(bio);
          set({ biographyLoaded: true });
          console.log(`[session] biography loaded (${bio.length} chars)`);
        } else {
          console.log("[session] biography page is near-empty; skipping prepend");
        }
      } catch (err) {
        console.warn("[session] biography load failed:", err);
      }
    })();

    const scenePromise = (async () => {
      try {
        const scene = await composeInitialScene();
        await kindroidUpdateScene(scene);
        console.log(`[session] initial scene pushed: "${scene}"`);
      } catch (err) {
        console.warn("[session] initial scene push failed:", err);
      }
    })();

    await Promise.all([bioPromise, scenePromise]);
    set({ status: "active" });
    persistCurrent(get);
  },

  end: async (messages) => {
    const { startedAt, status } = get();
    if (status !== "active") return;
    if (!startedAt) return;

    const endedAt = new Date().toISOString();
    set({ status: "ending", endedAt });
    persistCurrent(get);

    // Polling + driving/venue state are session-scoped — drop them on end.
    stopDrivingPoll();
    useMode.getState().exitDriving();
    useMode.getState().exitVenue();

    try {
      const journal = await buildJournal(messages, startedAt, endedAt);
      set({ journal, status: "journal-ready" });
      persistCurrent(get);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[session] journal build failed:", err);
      set({ status: "error", errorMessage: msg });
    }
  },

  saveJournal: async (finalTitle, finalMarkdown, archiveAttachments = true) => {
    const { journal } = get();
    if (!journal) return;

    const title = finalTitle?.trim() || journal.title;
    let markdown = finalMarkdown ?? journal.markdown;
    const filename = journalFilename(title, journal.dateYmd);

    set({ status: "saving" });
    try {
      if (!isVaultConfigured()) {
        throw new Error("Vault not configured");
      }

      // ── Step 1: Optionally archive attachments to the vault root, then
      // append a ## Attachments section to the markdown so Obsidian renders
      // them inline. Archive runs BEFORE the journal write so the markdown
      // we save is complete (no follow-up edits needed). Failed uploads
      // don't block the journal — they just get omitted from the section.
      if (archiveAttachments) {
        const messages = useChat.getState().messages;
        const candidates = collectSessionAttachments(messages);
        if (candidates.length > 0) {
          console.log(
            `[session] archiving ${candidates.length} attachment(s) to vault…`
          );
          const result = await archiveSessionAttachments(candidates);
          console.log(
            `[session] archive done: ${result.archived.length} succeeded, ` +
              `${result.failed.length} failed, ${result.serverDeleted} deleted from image server`
          );
          const block = renderAttachmentsBlock(result.archived);
          if (block) markdown = markdown.trimEnd() + "\n" + block;
        }
      }

      // ── Step 2: Write the journal (now with the embedded attachments).
      await writeNote(filename, markdown);
      console.log(`[session] journal saved to vault root as ${filename}`);
      set({ status: "saved" });
      // Wipe the persisted session — successful save means we don't want
      // to rehydrate this on next launch and act like the trip is still
      // open.
      clearPersistedSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[session] journal save failed:", err);
      set({ status: "error", errorMessage: msg });
    }
  },

  discardJournal: () => {
    stopDrivingPoll();
    useMode.getState().exitDriving();
    useMode.getState().exitVenue();
    set({
      status: "idle",
      sessionId: null,
      startedAt: null,
      endedAt: null,
      biographyLoaded: false,
      journal: null,
      errorMessage: null,
    });
    clearPersistedSession();
  },

  hydrate: async () => {
    const persisted = await hydratePersistedSession();
    if (!persisted) return;
    if (get().status !== "idle") return; // don't clobber an in-flight session

    if (persisted.status === "active") {
      // Recovery from OOM kill mid-session. Restart the GPS poller so
      // arrivals/driving-detection resume; chatStore.hydratePersistedMessages
      // (called separately in _layout) restores the chat thread.
      set({
        status: "active",
        sessionId: persisted.sessionId,
        startedAt: persisted.startedAt,
        endedAt: persisted.endedAt,
        biographyLoaded: false, // bio loads lazily on next send if needed
        journal: persisted.journal,
        errorMessage: null,
      });
      startDrivingPoll();
      console.log("[session] hydrated active session from disk");
    } else if (persisted.status === "journal-ready" || persisted.status === "saved") {
      // Tim was at the post-end review screen — restore the drafted
      // journal so he can still Save to Vault after the crash.
      set({
        status: persisted.status,
        sessionId: persisted.sessionId,
        startedAt: persisted.startedAt,
        endedAt: persisted.endedAt,
        biographyLoaded: false,
        journal: persisted.journal,
        errorMessage: null,
      });
      console.log(
        `[session] hydrated ${persisted.status} state with drafted journal`
      );
    }
  },
}));
