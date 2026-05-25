import { requireEnv } from "./env";
import { CONFIG } from "@/constants/config";
import { combineWithAbortSignal } from "@/session/abortBus";

const BASE_URL = "https://api.kindroid.ai/v1";

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

  const attempt = async (): Promise<string> => {
    // Combine the per-attempt timeout controller with the global abort bus so
    // the user-facing ⏹ Abort button kills this fetch instantly, alongside
    // the normal timeout backstop.
    const ctl = new AbortController();
    const { signal, cleanup } = combineWithAbortSignal(ctl.signal);
    const t = setTimeout(() => ctl.abort(), opts.timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}${opts.path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(opts.body),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "(no body)");
        throw new Error(`Kindroid ${opts.path} → HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      return await res.text();
    } finally {
      clearTimeout(t);
      cleanup();
    }
  };

  let lastErr: unknown;
  for (let i = 0; i < CONFIG.GEMINI_MAX_RETRIES; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && err.name === "AbortError") {
        // Timeout — don't retry a 300s send that already spent the budget
        throw new Error(`Kindroid ${opts.path} timed out after ${opts.timeoutMs / 1000}s`);
      }
      if (i < CONFIG.GEMINI_MAX_RETRIES - 1) {
        const wait = CONFIG.GEMINI_RETRY_BASE_MS * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

// ── sendMessage ─────────────────────────────────────────────────────

export interface SendMessageOptions {
  imageUrls?: string[];
  imageDescription?: string;
  linkUrl?: string;
  linkDescription?: string;
  videoUrl?: string;
  videoDescription?: string;
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
  if (message.length > 4000) {
    throw new Error(`Message is ${message.length} chars, exceeds Kindroid's 4000-char cap`);
  }
  const aiId = requireEnv("KINDROID_AI_ID");
  const body: Record<string, unknown> = {
    ai_id: aiId,
    message,
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
    timeoutMs: TIMEOUT_SEND,
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
