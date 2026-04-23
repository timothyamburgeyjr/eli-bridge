import { readNote, isVaultConfigured } from "@/services/obsidian";
import { condensePersonContext } from "@/services/gemini";
import type { Person } from "./PeopleStore";
import type { SensorSnapshot } from "@/types";

interface CacheEntry {
  text: string;
  sessionKey: string;
  builtAt: number;
}

const sessionCache = new Map<string, CacheEntry>();

/**
 * Reset the per-session person-context cache. Call on session start and on
 * significant context shifts (big location change, long gap).
 */
export function resetPersonContextCache() {
  sessionCache.clear();
}

/**
 * Build a short, cache-friendly key representing the CURRENT session context
 * so we refresh the condensed summary if Tim's situation shifts enough that
 * different facts about the person become relevant.
 *
 * Coarse on purpose — we don't want to re-call Gemini on every message.
 */
function sessionKeyFor(snapshot: SensorSnapshot): string {
  const place =
    snapshot.location?.placeName ?? snapshot.location?.placeType ?? "unknown-loc";
  const activity = snapshot.activity ?? "unknown-act";
  return `${place}|${activity}`;
}

function describeSession(snapshot: SensorSnapshot): string {
  const parts: string[] = [];
  if (snapshot.location?.placeName) {
    parts.push(`at ${snapshot.location.placeName}`);
  } else if (snapshot.location?.placeType) {
    parts.push(`at a ${snapshot.location.placeType}`);
  }
  if (snapshot.activity) parts.push(snapshot.activity);
  const companionNames: string[] = [];
  if (snapshot.speakerLabels) {
    for (const l of snapshot.speakerLabels) {
      if (l.speaker && l.speaker !== "Unknown") companionNames.push(l.speaker);
    }
  }
  if (snapshot.faceLabels) {
    for (const f of snapshot.faceLabels) {
      if (f.person && f.person !== "Unknown" && !companionNames.includes(f.person)) {
        companionNames.push(f.person);
      }
    }
  }
  if (companionNames.length) parts.push(`with ${companionNames.join(", ")}`);
  if (snapshot.weather?.conditions) parts.push(snapshot.weather.conditions);
  return parts.length ? parts.join(", ") : "no specific context";
}

/**
 * Return a short (≤180 char) context blurb for this person, relevant to the
 * current session. Cached per-session-key-per-person so the Obsidian + Gemini
 * round-trip only happens once per session per person (and refreshes if the
 * session context coarsely shifts).
 *
 * Returns null if Obsidian isn't configured, the person has no obsidianPath,
 * or the fetch/condense fails (caller should fall back to person.notes /
 * relationship).
 */
export async function getPersonContext(
  person: Person,
  snapshot: SensorSnapshot
): Promise<string | null> {
  if (!person.obsidianPath) {
    console.log(`[personContext] skip ${person.name}: no obsidianPath`);
    return null;
  }
  if (!isVaultConfigured()) {
    console.log(`[personContext] skip ${person.name}: vault not configured`);
    return null;
  }

  const sessionKey = sessionKeyFor(snapshot);
  const cacheKey = person.id;
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.sessionKey === sessionKey) {
    console.log(`[personContext] cache hit ${person.name}: ${cached.text.slice(0, 80)}`);
    return cached.text;
  }

  try {
    console.log(`[personContext] fetching ${person.name} from ${person.obsidianPath}`);
    const pageMarkdown = await readNote(person.obsidianPath);
    console.log(`[personContext] ${person.name}: page length=${pageMarkdown.length} chars`);
    if (pageMarkdown.trim().length < 40) {
      console.log(`[personContext] ${person.name}: page is near-empty, no useful context to extract`);
      return null;
    }
    const condensed = await condensePersonContext({
      name: person.name,
      relationship: person.relationship,
      pageMarkdown,
      sessionContext: describeSession(snapshot),
    });
    console.log(`[personContext] ${person.name}: condensed → "${condensed}"`);
    sessionCache.set(cacheKey, {
      text: condensed,
      sessionKey,
      builtAt: Date.now(),
    });
    return condensed;
  } catch (err) {
    console.warn(`[personContext] failed for ${person.name}:`, err);
    return null;
  }
}
