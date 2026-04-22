import { requireEnv } from "./env";
import { CONFIG } from "@/constants/config";

const BASE_URL = "https://api.kindroid.ai/v1";

// Per CLAUDE.md: send-message waits up to 300s, other endpoints 30s.
const TIMEOUT_SEND = 300_000;
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
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), opts.timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}${opts.path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(opts.body),
        signal: ctl.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "(no body)");
        throw new Error(`Kindroid ${opts.path} → HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      return await res.text();
    } finally {
      clearTimeout(t);
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
