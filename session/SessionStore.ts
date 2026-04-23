import { create } from "zustand";
import { readNote, writeNote, isVaultConfigured } from "@/services/obsidian";
import { updateScene as kindroidUpdateScene } from "@/services/kindroid";
import { setSessionContext } from "@/services/gemini";
import { gatherSensorSnapshot } from "./liveSensors";
import { buildJournal, journalFilename, BuiltJournal } from "./journalBuilder";
import { resetPersonContextCache } from "@/people/personContext";
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

    // Reset per-session caches. chatStore clearing is the caller's responsibility
    // (via chatStore.clear()) so session-start doesn't clobber existing chat.
    resetPersonContextCache();

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
  },

  end: async (messages) => {
    const { startedAt, status } = get();
    if (status !== "active") return;
    if (!startedAt) return;

    const endedAt = new Date().toISOString();
    set({ status: "ending", endedAt });

    try {
      const journal = await buildJournal(messages, startedAt, endedAt);
      set({ journal, status: "journal-ready" });
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
      await writeNote(filename, markdown);
      console.log(`[session] journal saved to vault root as ${filename}`);
      set({ status: "saved" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[session] journal save failed:", err);
      set({ status: "error", errorMessage: msg });
    }
  },

  discardJournal: () => {
    set({
      status: "idle",
      sessionId: null,
      startedAt: null,
      endedAt: null,
      biographyLoaded: false,
      journal: null,
      errorMessage: null,
    });
  },
}));
