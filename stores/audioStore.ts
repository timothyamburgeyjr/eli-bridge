import { create } from "zustand";
import { createAudioPlayer, AudioPlayer } from "expo-audio";
import { extractSpokenText, extractEmoteContext } from "@/components/chat/FormattedBody";
import { addAudioTags } from "@/services/gemini";
import { synthesizeToFile } from "@/services/elevenlabs";

export type AudioStatus = "idle" | "generating" | "ready" | "playing" | "played" | "error";

interface AudioCacheEntry {
  messageId: string;
  status: AudioStatus;
  path?: string;
  error?: string;
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
      get().stop();
      return;
    }

    // Always stop whatever else is playing first.
    if (state.currentMessageId && state.currentMessageId !== messageId) {
      get().stop();
    }

    // Cache hit: play the existing file.
    if (existing && existing.path && (existing.status === "ready" || existing.status === "played")) {
      startPlayback(messageId, existing.path, set, get);
      return;
    }

    // Cache miss: generate.
    set((s) => ({
      cache: { ...s.cache, [messageId]: { messageId, status: "generating" } },
    }));

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
        }));
        return;
      }

      const emoteContext = extractEmoteContext(rawMessage);
      const tagged = await addAudioTags(dialog, emoteContext);
      const path = await synthesizeToFile(tagged, messageId);

      set((s) => ({
        cache: { ...s.cache, [messageId]: { messageId, status: "ready", path } },
      }));
      startPlayback(messageId, path, set, get);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set((s) => ({
        cache: { ...s.cache, [messageId]: { messageId, status: "error", error: msg } },
      }));
    }
  },
}));

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
