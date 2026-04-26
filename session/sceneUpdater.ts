import { updateScene as kindroidUpdateScene } from "@/services/kindroid";

/**
 * Pushes Eli-centric scene lines to Kindroid as Tim's context shifts. The
 * `current_scene` field is a 160-char persistent backdrop that grounds Eli's
 * model of where Tim is; per the persistence architecture it's always
 * phrased "Eli is with Tim. ..." (Eli-centric, not from Tim's POV).
 *
 * Spec ([CLAUDE.md] §Phase 9): "Update currentScene on Kindroid when session
 * starts and when significant location changes occur." Session-start was
 * already wired in SessionStore — this module covers the location-change half.
 *
 * All pushes are fire-and-forget. A failed scene push doesn't block the
 * triggering event (LocationCard, VenueModeCard) from rendering, and the
 * scene memo will catch up on the next change.
 */

const SCENE_PREFIX = "Eli is with Tim. ";
const MAX_SCENE_CHARS = 160;
const MAX_BODY_CHARS = MAX_SCENE_CHARS - SCENE_PREFIX.length;

let lastPushedScene: string | null = null;

function compose(body: string): string {
  let trimmed = body.trim();
  if (trimmed.length > MAX_BODY_CHARS) {
    trimmed = trimmed.slice(0, MAX_BODY_CHARS - 1).replace(/\s+\S*$/, "") + "…";
  }
  return SCENE_PREFIX + trimmed;
}

async function push(scene: string, label: string): Promise<void> {
  // Guard against re-pushing the same scene (e.g., if both the poller and
  // chatStore detect the same venue transition back-to-back).
  if (lastPushedScene === scene) return;
  lastPushedScene = scene;
  try {
    await kindroidUpdateScene(scene);
    console.log(`[scene] pushed (${label}): "${scene}"`);
  } catch (err) {
    // Non-fatal — let the next change retry. Reset the dedup so a follow-up
    // push for the same scene can recover.
    lastPushedScene = null;
    console.warn(`[scene] push failed (${label}):`, err);
  }
}

function prettyType(t?: string): string | null {
  if (!t) return null;
  const cleaned = t.replace(/_/g, " ");
  // Filter generic / non-descriptive types out of the scene line.
  if (cleaned === "point of interest") return null;
  return cleaned;
}

export function pushArrivalScene(p: {
  name: string;
  placeType?: string;
}): Promise<void> {
  const cat = prettyType(p.placeType);
  const body = cat
    ? `Tim has arrived at ${p.name}, a ${cat}.`
    : `Tim has arrived at ${p.name}.`;
  return push(compose(body), `arrival:${p.name}`);
}

export function pushVenueEnteredScene(b: {
  name: string;
  placeType: string;
}): Promise<void> {
  const cat = prettyType(b.placeType);
  const body = cat
    ? `They're at ${b.name} (${cat}) — sounds, crowds, the feel of being there.`
    : `They're at ${b.name} — sounds, crowds, the feel of being there.`;
  return push(compose(body), `venue-enter:${b.name}`);
}

export function pushVenueExitedScene(b: { name: string }): Promise<void> {
  const body = `They've left ${b.name}.`;
  return push(compose(body), `venue-exit:${b.name}`);
}

/**
 * Reset the dedup state. Call on session start so a previous session's
 * last-pushed scene doesn't suppress the first push of this session.
 */
export function resetSceneDedup(): void {
  lastPushedScene = null;
}
