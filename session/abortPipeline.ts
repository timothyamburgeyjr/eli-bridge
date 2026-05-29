/**
 * User-facing pipeline abort. Wired up to the ⏹ button in SessionHeader.
 *
 * Tearing down a running pipeline cleanly is a coordinated job across four
 * stores plus the in-flight fetches themselves:
 *
 *   1. Trip the abort bus  → fetches that honor AbortSignal die immediately;
 *                            the generation counter bumps so any late
 *                            completions are dropped by the stale-gen guards
 *                            in chatStore.sendMessage and audioStore.playEli.
 *   2. chatStore cleanup   → remove the trailing pending Tim bubble (the one
 *                            that hasn't received an Eli reply yet), reset
 *                            status to idle, clear sendStartedAt, reset
 *                            sceneStatus if a scene capture was in flight.
 *   3. audioStore cleanup  → drop the "generating" cache entry for whatever
 *                            message was mid-synth, stop in-progress
 *                            playback so Eli quiets immediately.
 *   4. recoveryStore clear → dismiss the timeout-recovery popup if it was up.
 *
 * The bus trip happens FIRST so that in-flight code which races with this
 * cleanup (Gemini SDK in particular has no AbortSignal hook) sees the new
 * generation when it tries to commit and bails out silently.
 */

import { useChat } from "@/stores/chatStore";
import { useAudio } from "@/stores/audioStore";
import { useRecovery } from "@/stores/recoveryStore";
import { useTimeline } from "@/stores/timelineStore";
import { tripAbortBus } from "./abortBus";
import type { ChatItem } from "@/components/chat/ChatStream";

/**
 * Returns true if there's anything worth aborting — used by the UI to
 * decide whether the ⏹ button should be visible. Covers every state the
 * orchestrator below knows how to tear down.
 */
export function isPipelineBusy(): boolean {
  const chat = useChat.getState();
  if (chat.status === "assembling" || chat.status === "sending") return true;
  if (chat.sceneStatus === "analyzing") return true;
  const audio = useAudio.getState();
  if (audio.currentMessageId) {
    const entry = audio.cache[audio.currentMessageId];
    if (entry?.status === "generating" || entry?.status === "playing") return true;
  }
  if (useRecovery.getState().failure !== null) return true;
  return false;
}

/**
 * Tear down everything in flight and ready the app for a fresh message.
 * Safe to call when nothing is in flight (no-op cleanup). Preserves the
 * chat history — only the trailing pending Tim bubble is removed; every
 * Tim/Eli pair, system card, and saved-place card stays put.
 */
export function abortPipeline(reason = "user-aborted"): void {
  console.log(`[abort] tearing down pipeline — ${reason}`);

  // 1. Trip the bus FIRST so the generation counter increments before any
  // store writes below. Late-arriving fetch results will compare against
  // the bumped generation and silently exit.
  tripAbortBus(reason);

  // 2. chatStore — remove a trailing Tim bubble that never got its Eli
  // reply, reset all in-flight status flags.
  const chat = useChat.getState();
  const trimmedMessages = trimTrailingUnpairedTim(chat.messages);
  useChat.setState({
    messages: trimmedMessages,
    status: "idle",
    sendStartedAt: null,
    errorMessage: null,
    // Scene capture sits on its own status flag; reset that too in case the
    // user aborted while Gemini Pro was analyzing photos.
    sceneStatus: chat.sceneStatus === "analyzing" ? "idle" : chat.sceneStatus,
    sceneError: chat.sceneStatus === "analyzing" ? null : chat.sceneError,
  });

  // 3. audioStore — kill any in-flight synth + stop playback so Eli falls
  // silent immediately on tap. Use the store's own `stop()` for playback
  // so its expo-audio teardown runs cleanly.
  const audio = useAudio.getState();
  if (audio.currentMessageId) {
    const entry = audio.cache[audio.currentMessageId];
    if (entry?.status === "generating") {
      const next = { ...audio.cache };
      delete next[audio.currentMessageId];
      useAudio.setState({ cache: next, currentMessageId: null });
    } else if (entry?.status === "playing") {
      audio.stop();
    } else {
      useAudio.setState({ currentMessageId: null });
    }
  }

  // 4. recoveryStore — dismiss the timeout popup if it's open. The
  // continuations stored there belong to the now-aborted pipeline run;
  // running them after abort would resurrect what we just killed.
  useRecovery.getState().clear();

  // 5. Log to the timeline so the diagnostic export has a marker for
  // every user-initiated abort.
  useTimeline.getState().append({
    kind: "abort",
    icon: "⏹",
    level: "warn",
    label: "Pipeline aborted by user",
    detail: reason,
  });
}

/**
 * Strip the trailing Tim bubble if it has no Eli reply after it. A "pending"
 * Tim bubble looks the same as a delivered one in the messages array; the
 * tell is whether anything Eli-shaped follows. Anything else (system cards,
 * saved-place cards, scene cards, briefbundle, Eli bubbles) stays untouched.
 */
function trimTrailingUnpairedTim(messages: ChatItem[]): ChatItem[] {
  if (messages.length === 0) return messages;
  // Walk back from the end. Skip non-conversational cards (they don't
  // disqualify a preceding Tim bubble from being "unpaired"). Stop at the
  // first Tim or Eli bubble — if it's Tim and there was no Eli after it,
  // drop that Tim bubble.
  let lastConvIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.from === "tim" || m.from === "eli") {
      lastConvIdx = i;
      break;
    }
  }
  if (lastConvIdx === -1) return messages;
  const last = messages[lastConvIdx];
  if (last.from !== "tim") return messages;
  // It's a Tim bubble with no following Eli reply — drop it (and any
  // trailing non-conversational cards that came after it, since they were
  // dropped into the stream as part of the same in-flight send).
  return messages.slice(0, lastConvIdx);
}
