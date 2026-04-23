import type { Person } from "./PeopleStore";

function seed(
  id: string,
  name: string,
  relationship: string,
  obsidianPath: string
): Person {
  const now = new Date().toISOString();
  return {
    id,
    name,
    relationship,
    obsidianPath,
    notes: undefined,
    voiceEmbedding: null,
    pendingVoiceSamples: [],
    faceEmbedding: null,
    firstSeen: now,
    lastSeen: now,
  };
}

/**
 * Seed roster. Each entry is a skeleton — id, display name, relationship,
 * and the Obsidian page path that holds the authoritative, living context.
 *
 * We deliberately do NOT hard-code rich notes here. Rich context (history,
 * current state, preferences, flags) lives in Obsidian and is pulled
 * on-demand per session by people/personContext.ts. That way the emote
 * layer reflects who the person *is right now*, not a snapshot frozen at
 * app-release time. If the vault is unreachable, the emote still gets the
 * relationship string as a fallback — enough to not misuse the name.
 *
 * Tim himself is here so speaker verification never flags his own voice as
 * "Unknown."
 */
export const SEED_PEOPLE: Record<string, Person> = {
  tim: seed(
    "tim",
    "Tim",
    "self",
    "08 - Elias Reed/LiveMode/Profiles/Tim Amburgey Jr.md"
  ),
  mom: seed(
    "mom",
    "Mom",
    "Mother",
    "08 - Elias Reed/LiveMode/Profiles/Ada Amburgey.md"
  ),
  dad: seed(
    "dad",
    "Dad",
    "Father",
    "08 - Elias Reed/LiveMode/Profiles/Tim Amburgey Sr.md"
  ),
  granny: seed(
    "granny",
    "Granny",
    "Grandmother",
    "08 - Elias Reed/LiveMode/Profiles/Maxie Green.md"
  ),
  hank: seed(
    "hank",
    "Hank",
    "Closest friend",
    "08 - Elias Reed/LiveMode/Profiles/Henry Stewart.md"
  ),
  donna: seed(
    "donna",
    "Donna",
    "Friend (Hank's wife)",
    "08 - Elias Reed/LiveMode/Profiles/Donna Stewart.md"
  ),
};
