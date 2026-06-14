import { create } from "zustand";
import { readNote, writeNote, isVaultConfigured } from "@/services/obsidian";
import { updateScene as kindroidUpdateScene } from "@/services/kindroid";
import { setSessionContext } from "@/services/gemini";
import { gatherSensorSnapshot } from "./liveSensors";
import { buildJournal, journalFilename, BuiltJournal } from "./journalBuilder";
import { startSessionPoll, stopSessionPoll } from "./sessionPoller";
import {
  persistSession,
  hydrateSession as hydratePersistedSession,
  clearPersistedSession,
} from "./sessionPersistence";
import { resetPersonContextCache } from "@/people/personContext";
import { useCompanions } from "@/session/CompanionTracker";
import { useClarifications } from "@/stores/clarificationStore";
import { useMode } from "@/stores/modeStore";
import { useTimeline } from "@/stores/timelineStore";
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

  /** Save the drafted journal to the vault root. */
  saveJournal: (finalTitle?: string, finalMarkdown?: string) => Promise<void>;

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
    // Only a genuinely live session blocks a (re)start. We deliberately do NOT
    // bail on "starting" or any other transient state here: with immediate
    // activation below, "starting" can't legitimately linger, and treating a
    // stale/wedged status as "ignore" is exactly what left the Start button
    // dead. From anything except "active", start fresh (this resets state).
    if (get().status === "active") return;

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
    // Companion tracker resets per session so a new trip starts with just
    // Tim + Eli; clarification queue clears so stale popups from the prior
    // session don't bleed over.
    useCompanions.getState().reset();
    useClarifications.getState().skipAll();

    // Fresh timeline per session — diagnostic history from the previous
    // session lives on disk only via the prior export (if any).
    useTimeline.getState().clear();
    useTimeline.getState().append({
      kind: "session-start",
      icon: "▶",
      label: "Session started",
      meta: { sessionId, startedAt },
    });

    // Start background GPS polling so driving-mode auto-detection fires even
    // when Tim isn't actively sending messages (the common case — he starts
    // a drive and doesn't talk to Eli immediately).
    startSessionPoll();

    // Activate the session NOW — BEFORE the biography/scene I/O below.
    //
    // That I/O hits the network (Obsidian vault read, GPS fix, Kindroid scene
    // push) and any of it can hang on a dead-zone connection: the vault read
    // and the GPS fix have no timeout of their own. The old code awaited
    // Promise.all([bio, scene]) before flipping to "active", so one hung call
    // left the session stuck in "starting" FOREVER — and a stuck "starting"
    // makes the Start button a silent no-op (it early-returns on "starting")
    // that never clears the prior session's timeline. Activation must not
    // depend on best-effort context loading, so we go active immediately and
    // let the two loads run fire-and-forget.
    set({ status: "active" });
    persistCurrent(get);

    // Biography → prepended to the Gemini system prompt for this session.
    // Fire-and-forget; a failure or hang here just means no bio this session.
    void (async () => {
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

    // Initial Kindroid scene push. Fire-and-forget for the same reason.
    void (async () => {
      try {
        const scene = await composeInitialScene();
        await kindroidUpdateScene(scene);
        console.log(`[session] initial scene pushed: "${scene}"`);
      } catch (err) {
        console.warn("[session] initial scene push failed:", err);
      }
    })();
  },

  end: async (messages) => {
    const { startedAt, status } = get();
    if (status !== "active") return;
    if (!startedAt) return;

    const endedAt = new Date().toISOString();
    set({ status: "ending", endedAt });
    persistCurrent(get);

    useTimeline.getState().append({
      kind: "session-end",
      icon: "⏹",
      label: "Session ended",
      meta: { endedAt },
    });

    // Polling + driving/venue state are session-scoped — drop them on end.
    stopSessionPoll();
    useMode.getState().exitConversation();
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

  saveJournal: async (finalTitle, finalMarkdown) => {
    const { journal } = get();
    if (!journal) return;

    const title = finalTitle?.trim() || journal.title;
    const markdown = finalMarkdown ?? journal.markdown;
    const filename = journalFilename(title, journal.dateYmd);

    set({ status: "saving" });
    try {
      if (!isVaultConfigured()) {
        throw new Error("Vault not configured");
      }
      // Write only the journal markdown. Photo attachments live on the
      // self-hosted image server already (cowork skill organizes from
      // there); audio attachments stay in the phone's cache. The earlier
      // sequential vault dump was blocking the JS thread for 30s+ on
      // photo-heavy sessions and was removed.
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
    stopSessionPoll();
    useMode.getState().exitConversation();
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
      startSessionPoll();
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
