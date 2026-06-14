import { requireEnv } from "./env";
import { combineWithAbortSignal } from "@/session/abortBus";
import { tracedFetch } from "@/session/diagnosticLog";

const BASE_URL = "https://api.kindroid.ai/v1";

// Prepended to every /send-message payload to keep Eli's emote-bracket
// discipline from drifting over long sessions. Ported from MovieMode after
// the same drift pattern (emote text leaking out of _(* *)_ markers and
// breaking the parser) showed up there. The nested _(* TEXT *)_ inside the
// directive is a working demonstration of the format, not just a description
// of it, and the in-character emote wrapping keeps Eli from treating it as
// an OOC stage direction.
const FORMAT_DIRECTIVE =
  "_(* DIRECTIVE: All Emotes have to go inside the _(* TEXT *)_ notation *)_";

// 90s for /send-message — Kindroid's LLM typically replies in 5-30s, so 90s
// is generous headroom. The CLAUDE.md spec called for 300s but in practice
// that left Drive Mode frozen for 5+ min on cellular dead zones (Tim's
// real-world report). 30s for everything else (update-info, journal-create).
//
// Tradeoff: if the request reaches Kindroid but the response gets stuck en
// route, we time out and the queue drainer may replay the send when the
// network returns — Eli would get the message twice. That's an edge-case
// risk; the alternative (locking the whole pipeline for minutes) is worse.
const TIMEOUT_SEND = 90_000;
const TIMEOUT_OTHER = 30_000;

// ── Fetch with timeout + retry ──────────────────────────────────────

interface RequestOpts {
  path: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  /** Kindroid returns text/plain for /send-message, JSON for the others (void on success). */
  expectPlainText: boolean;
}

async function kindroidRequest(opts: RequestOpts): Promise<string> {
  const key = requireEnv("KINDROID_API_KEY");

  // Single-shot. NO auto-retry. All Kindroid endpoints have side effects
  // (send-message writes to Eli's conversation, journal-create creates a
  // journal entry, update-info mutates Eli's scene state) — a transparent
  // retry can silently duplicate state on the Kindroid side when the first
  // request actually succeeded but the response was lost on the wire
  // (HTTP 502/504 from a proxy, transient network blip during response
  // phase, etc.). Tim was hitting this on video sends: ~3-5 min Kindroid
  // processing → response interrupted → auto-retry → Kindroid logs the
  // message twice → only one Eli reply makes it back to the bridge.
  //
  // Errors here bubble straight up to the caller (chatStore), which
  // surfaces transient failures to the recovery popup. The user gets to
  // decide whether to resubmit, having been warned that a duplicate
  // message could land if the first one already reached Eli.
  //
  // timeoutMs=0 means "no timeout" — the request only ends when Kindroid
  // responds or the user trips the abort bus. Used for video sends.
  const ctl = new AbortController();
  const { signal, cleanup } = combineWithAbortSignal(ctl.signal);
  const t =
    opts.timeoutMs > 0 ? setTimeout(() => ctl.abort(), opts.timeoutMs) : null;
  try {
    const res = await tracedFetch("kindroid", `${BASE_URL}${opts.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(opts.body),
      signal,
      label: `POST ${opts.path}`,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      throw new Error(
        `Kindroid ${opts.path} → HTTP ${res.status}: ${errText.slice(0, 200)}`
      );
    }
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Distinguish: we hit our own timeout vs the user tripped abort.
      if (opts.timeoutMs > 0) {
        throw new Error(
          `Kindroid ${opts.path} timed out after ${opts.timeoutMs / 1000}s`
        );
      }
      throw new Error(`Kindroid ${opts.path} aborted`);
    }
    throw err;
  } finally {
    if (t) clearTimeout(t);
    cleanup();
  }
}

// ── sendMessage ─────────────────────────────────────────────────────

export interface SendMessageOptions {
  imageUrls?: string[];
  imageDescription?: string;
  linkUrl?: string;
  linkDescription?: string;
  videoUrl?: string;
  videoDescription?: string;
  /**
   * Override the default Kindroid send timeout. Use this for sends that
   * include a lot of attached context (video → 5 image_urls), where the
   * default 90s sometimes fires before Kindroid finishes processing —
   * causing a recovery popup → resubmit → Kindroid receiving the message
   * twice. Caller passes ms; pass undefined to use the default.
   */
  timeoutMs?: number;
}

/**
 * Send a Kindroid-ready message (`_(*emote*)_ dialog`) to Eli and return his full reply.
 * Total message length must be ≤ 4000 chars; emote portion should already be capped
 * at 2000 chars by the EmoteAssembler.
 */
export async function sendMessage(
  message: string,
  options: SendMessageOptions = {}
): Promise<string> {
  const payload = `${FORMAT_DIRECTIVE}\n${message}`;
  if (payload.length > 4000) {
    throw new Error(`Message is ${payload.length} chars, exceeds Kindroid's 4000-char cap`);
  }
  const aiId = requireEnv("KINDROID_AI_ID");
  const body: Record<string, unknown> = {
    ai_id: aiId,
    message: payload,
    stream: false,
  };
  if (options.imageUrls?.length) {
    body.image_urls = options.imageUrls;
    if (options.imageDescription) body.image_description = options.imageDescription;
  }
  if (options.linkUrl) {
    body.link_url = options.linkUrl;
    if (options.linkDescription) body.link_description = options.linkDescription;
  }
  if (options.videoUrl) {
    body.video_url = options.videoUrl;
    if (options.videoDescription) body.video_description = options.videoDescription;
  }

  const text = await kindroidRequest({
    path: "/send-message",
    body,
    timeoutMs: options.timeoutMs ?? TIMEOUT_SEND,
    expectPlainText: true,
  });
  return text.trim();
}

// ── updateScene ────────────────────────────────────────────────────

export async function updateScene(currentScene: string): Promise<void> {
  if (currentScene.length > 160) {
    throw new Error(`current_scene is ${currentScene.length} chars, max 160`);
  }
  const aiId = requireEnv("KINDROID_AI_ID");
  await kindroidRequest({
    path: "/update-info",
    body: { ai_id: aiId, current_scene: currentScene },
    timeoutMs: TIMEOUT_OTHER,
    expectPlainText: false,
  });
}
