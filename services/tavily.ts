import { getEnv, requireEnv } from "./env";

/**
 * Tavily search wrapper for the "🔍 Look this up" feature. Tavily is an
 * AI-friendly search API — returns clean snippets per result, no scraping
 * required. Free tier covers 1000 searches/month which is plenty for the
 * "Tim taps a photo and asks about the okapi" use case.
 *
 * API docs: https://docs.tavily.com/
 */

const ENDPOINT = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 30_000;

export interface LookupResult {
  title: string;
  url: string;
  /** Clean text snippet (already extracted by Tavily — no HTML). */
  content: string;
}

export function isLookupConfigured(): boolean {
  return !!getEnv("TAVILY_API_KEY");
}

export async function lookup(
  query: string,
  maxResults: number = 3
): Promise<LookupResult[]> {
  const apiKey = requireEnv("TAVILY_API_KEY");
  const trimmed = query.trim();
  if (!trimmed) return [];

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: trimmed,
        max_results: maxResults,
        // Basic depth is fast and cheap — good enough for "what is this animal"
        // style lookups. Advanced is for deep research.
        search_depth: "basic",
      }),
      signal: ctl.signal,
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" &&
        err !== null &&
        (err as { name?: string }).name === "AbortError");
    if (aborted) {
      throw new Error(`Tavily search timed out after ${SEARCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Tavily search → HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (json.results ?? [])
    .filter((r) => r.title && r.content)
    .map((r) => ({
      title: r.title!,
      url: r.url ?? "",
      content: r.content!,
    }));
}
