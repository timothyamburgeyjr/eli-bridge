import { create } from "zustand";
import { createAudioPlayer, AudioPlayer } from "expo-audio";
import { extractSpokenText, extractEmoteContext } from "@/components/chat/FormattedBody";
import { addAudioTags } from "@/services/gemini";
import { synthesizeToFile } from "@/services/elevenlabs";
import { useRecovery } from "@/stores/recoveryStore";
import {
  currentAbortSignal,
  currentGeneration,
  isStaleGeneration,
} from "@/session/abortBus";

export type AudioStatus = "idle" | "generating" | "ready" | "playing" | "played" | "error";

interface AudioCacheEntry {
  messageId: string;
  status: AudioStatus;
  path?: string;
  error?: string;
  /** Timestamp (ms) when the entry transitioned to "generating". Used by the
   * watchdog to recover from stuck synthesis. */
  generatingStartedAt?: number;
}

interface AudioState {
  cache: Record<string, AudioCacheEntry>;
  currentMessageId: string | null;

  /**
   * Play the audio for an Eli message. On cache miss, this generates audio via
   * Gemini (tag injection) → ElevenLabs (synthesis) and writes to the local
   * cache. On cache hit, it replays the existing file with zero API cost.
   */
  playEli: (messageId: string, rawMessage: string) => Promise<void>;

  /** Stop the currently-playing audio, if any. */
  stop: () => void;

  /**
   * Watchdog-only — recover from a stuck "generating" entry that slipped past
   * the upstream timeouts. Marks the entry as error and clears
   * currentMessageId so consumers (Drive Mode overlay) unstick.
   */
  forceResetStuckGeneration: (reason: string) => void;

  /** Reset the cache (e.g. on session end). Does not delete files from disk. */
  clear: () => void;
}

let currentPlayer: AudioPlayer | null = null;
let currentListener: { remove(): void } | null = null;

function teardownPlayer() {
  if (currentListener) {
    try {
      currentListener.remove();
    } catch {
      // already torn down
    }
    currentListener = null;
  }
  if (currentPlayer) {
    try {
      currentPlayer.pause();
      currentPlayer.remove();
    } catch {
      // already torn down
    }
    currentPlayer = null;
  }
}

export const useAudio = create<AudioState>((set, get) => ({
  cache: {},
  currentMessageId: null,

  clear: () => {
    teardownPlayer();
    set({ cache: {}, currentMessageId: null });
  },

  forceResetStuckGeneration: (reason) => {
    const s = get();
    if (!s.currentMessageId) return;
    const entry = s.cache[s.currentMessageId];
    if (!entry || entry.status !== "generating") return;
    console.warn(`[audioStore] watchdog forcing reset — ${reason}`);
    set({
      cache: {
        ...s.cache,
        [s.currentMessageId]: {
          ...entry,
          status: "error",
          error: reason,
        },
      },
      currentMessageId: null,
    });
  },

  stop: () => {
    teardownPlayer();
    const state = get();
    if (state.currentMessageId) {
      const entry = state.cache[state.currentMessageId];
      if (entry?.status === "playing") {
        set({
          cache: { ...state.cache, [state.currentMessageId]: { ...entry, status: "played" } },
          currentMessageId: null,
        });
      } else {
        set({ currentMessageId: null });
      }
    }
  },

  playEli: async (messageId, rawMessage) => {
    const state = get();
    const existing = state.cache[messageId];

    // If this message is currently playing, tapping again pauses it → mark played.
    if (existing?.status === "playing") {
      console.log(`[audio] playEli STOP (already playing) msg=${messageId}`);
      get().stop();
      return;
    }

    // Always stop whatever else is playing first.
    if (state.currentMessageId && state.currentMessageId !== messageId) {
      console.log(
        `[audio] playEli stopping prior msg=${state.currentMessageId} to start msg=${messageId}`
      );
      get().stop();
    }

    // Cache hit: play the existing file.
    if (existing && existing.path && (existing.status === "ready" || existing.status === "played")) {
      console.log(
        `[audio] playEli REPLAY (cache hit, status=${existing.status}) msg=${messageId}`
      );
      startPlayback(messageId, existing.path, set, get);
      return;
    }

    console.log(`[audio] playEli GENERATE msg=${messageId}`);

    // Cache miss: generate. Set currentMessageId here (not just when playback
    // starts) so consumers reading `cache[currentMessageId]` see a defined
    // entry during the generating phase. Without this, Driving Mode's tap
    // gate flickers off between "Eli message lands" and "audio starts
    // playing", letting a tap kick off a new recording mid-TTS.
    set((s) => ({
      cache: {
        ...s.cache,
        [messageId]: {
          messageId,
          status: "generating",
          generatingStartedAt: Date.now(),
        },
      },
      currentMessageId: messageId,
    }));

    // Snapshot the abort-bus generation. If the user trips the ⏹ button
    // while addAudioTags or synthesizeToFile is running, abortPipeline
    // resets the cache entry; the late completion below must not clobber
    // that reset.
    const myGen = currentGeneration();
    const abortSignal = currentAbortSignal();

    try {
      const dialog = extractSpokenText(rawMessage);
      if (!dialog) {
        // Nothing to speak (emote-only message). Mark as error so UI shows it.
        set((s) => ({
          cache: {
            ...s.cache,
            [messageId]: {
              messageId,
              status: "error",
              error: "No dialog to speak (emote-only message)",
            },
          },
          currentMessageId: null,
        }));
        return;
      }

      const emoteContext = extractEmoteContext(rawMessage);
      const tagged = await addAudioTags(dialog, emoteContext, abortSignal);
      if (isStaleGeneration(myGen)) return;
      const path = await synthesizeToFile(tagged, messageId);
      if (isStaleGeneration(myGen)) return;

      set((s) => ({
        cache: { ...s.cache, [messageId]: { messageId, status: "ready", path } },
      }));
      startPlayback(messageId, path, set, get);
      // Success — clear any recovery popup state from a prior synth retry.
      useRecovery.getState().clear();
    } catch (err) {
      // User aborted while synth was in flight — abortPipeline already
      // cleared cache entry and currentMessageId. Don't re-write error,
      // don't open the recovery popup.
      if (isStaleGeneration(myGen)) return;

      const msg = err instanceof Error ? err.message : String(err);
      set((s) => ({
        cache: { ...s.cache, [messageId]: { messageId, status: "error", error: msg } },
        currentMessageId: null,
      }));
      // Transient synth failure (timeout, network) → hand to the recovery
      // popup so Tim can resubmit just the ElevenLabs step or cancel.
      // Non-transient (e.g. emote-only "nothing to speak") stays a quiet
      // cache error — a retry can't fix it.
      if (isTransientAudioError(err)) {
        useRecovery.getState().reportFailure(
          "elevenlabs",
          msg,
          // Resubmit: regenerate from scratch (addAudioTags + synth).
          () => get().playEli(messageId, rawMessage),
          // Cancel: drop the error cache entry — the Eli message itself
          // stays in the chat, just without audio.
          () => {
            set((s) => {
              const next = { ...s.cache };
              delete next[messageId];
              return { cache: next };
            });
          }
        );
      }
    }
  },
}));

/**
 * True for synth failures a retry could plausibly fix — timeouts, network
 * drops, upstream 5xx. False for permanent problems (bad key, 4xx) where
 * resubmitting just fails the same way.
 */
function isTransientAudioError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("network") ||
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("aborted") ||
    m.includes("connection") ||
    /http\s*5\d\d/.test(m)
  );
}

function startPlayback(
  messageId: string,
  path: string,
  set: (
    partial:
      | Partial<AudioState>
      | ((state: AudioState) => Partial<AudioState>)
  ) => void,
  get: () => AudioState
) {
  teardownPlayer();
  const player = createAudioPlayer({ uri: path });
  currentPlayer = player;
  currentListener = player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) {
      const cur = get();
      const entry = cur.cache[messageId];
      if (entry) {
        set({
          cache: { ...cur.cache, [messageId]: { ...entry, status: "played" } },
          currentMessageId: null,
        });
      }
      teardownPlayer();
    }
  });

  set((s) => {
    const entry = s.cache[messageId];
    return {
      cache: {
        ...s.cache,
        [messageId]: { messageId, status: "playing", path: entry?.path ?? path },
      },
      currentMessageId: messageId,
    };
  });
  player.play();
}
