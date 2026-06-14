import type { SensorSnapshot, TransportMode } from "@/types";
import type { Companion } from "./CompanionTracker";

/**
 * The PRESENT anchor is a small "you are here, now" stamp prepended to
 * every outgoing Kindroid message — right after the FORMAT_DIRECTIVE.
 * Its job is to keep Eli grounded in the literal present-moment context
 * across long sessions, so he doesn't drift into chat-mode or lose track
 * of where/with-whom/what.
 *
 * Three slots, all sensor-derived, all ground truth (no Gemini creativity):
 *   - Companions (CompanionTracker → "Tim and Hank")
 *   - Place (sensor snapshot's placeHierarchy → walks up Earth if needed)
 *   - Activity (Activity Recognition code → stock prose verb)
 *
 * Output is a single in-character emote in the existing _(* ... *)_ shape
 * so Eli treats it as conversational texture, not OOC stage direction.
 */

export interface BuildPresentAnchorInput {
  sensors: SensorSnapshot;
  companions: Companion[];
}

/**
 * Build the PRESENT anchor string. Returns `null` when there's not enough
 * sensor data to say anything useful (e.g. early-boot before location
 * resolves) — caller should skip prepending in that case.
 */
export function buildPresentAnchor(input: BuildPresentAnchorInput): string | null {
  const companionsSentence = describeCompanions(input.companions);
  const placeSentence = describePlace(input.sensors);
  const activitySentence = describeActivity(input.sensors);

  // First sentence is always present (we always know who Tim is with —
  // worst case it's just "with Tim"). The other two are optional and
  // dropped when sensors don't supply them.
  const sentences = [companionsSentence];
  if (placeSentence) {
    // Merge place into the first sentence so it reads naturally: "You are
    // with Tim and Hank in Yellow Springs at the House of Ravenwood."
    sentences[0] = `${companionsSentence} ${placeSentence}`;
  }
  if (activitySentence) sentences.push(activitySentence);

  const text = sentences.join(" ");
  return `_(* PRESENT: ${text} *)_`;
}

function describeCompanions(companions: Companion[]): string {
  if (companions.length === 0) {
    return "You are with Tim.";
  }
  const names = companions.map((c) => c.name);
  return `You are with ${joinNames(["Tim", ...names])}.`;
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Build the place sub-sentence from the sensor snapshot's hierarchy. Walks
 * up premise → locality → state → country → Earth, including all
 * available levels above the most-specific so Eli sees the nesting
 * ("Yellow Springs at the House of Ravenwood"). Returns "" when nothing
 * resolves — Earth is the terminal fallback.
 */
function describePlace(sensors: SensorSnapshot): string {
  const h = sensors.location?.placeHierarchy;

  if (h) {
    // Premise + locality is the most evocative reading. Other combinations
    // fall back through the hierarchy until something's available.
    if (h.premise && h.locality) {
      return `in ${h.locality} at the ${h.premise}.`;
    }
    if (h.locality) {
      return `in ${h.locality}${h.state ? `, ${h.state}` : ""}.`;
    }
    if (h.sublocality) {
      return `in ${h.sublocality}${h.state ? `, ${h.state}` : ""}.`;
    }
    if (h.state) {
      return `in ${h.state}${h.country ? `, ${h.country}` : ""}.`;
    }
    if (h.country) return `in ${h.country}.`;
  }

  // No hierarchy at all — fall back to placeName (covers home shortcut +
  // legacy paths), then to the terminal "Earth" fallback Tim asked for so
  // the anchor sentence is never grammatically broken.
  const name = sensors.location?.placeName;
  if (name) {
    const stripped = name.split(" · ")[0];
    return `at ${stripped}.`;
  }
  return "somewhere on Earth.";
}

/**
 * Module-level memory of the last moment Activity Recognition reported
 * "car." Used to distinguish "sitting in a parked car" (recent car activity
 * + currently STILL) from generic "sitting still on the couch." Updated
 * as a side-effect of buildPresentAnchor each time it sees activity=car.
 * Self-clears naturally after IN_CAR_MEMORY_MS — no explicit reset needed
 * because the 5-min window is short enough that stale state self-stales.
 */
let _lastCarActivityAt: number | null = null;
const IN_CAR_MEMORY_MS = 5 * 60_000;

/**
 * Speed threshold (m/s) below which "car" reads as "in the car" instead of
 * "driving." 2 m/s ≈ 4.5 mph — anything slower than that is at-a-light or
 * parking-lot crawl, not active driving. Above is real motion. The
 * threshold is well below the inferActivityFromSpeed "car" wall (11 mph)
 * because here we're SPLITTING within the already-known car state, not
 * detecting whether-it's-a-car-at-all.
 */
const DRIVING_SPEED_THRESHOLD_MS = 2;

/**
 * Map the discrete Activity Recognition vocabulary to a stock prose
 * verb-phrase. Two refinements beyond the bare AR vocabulary:
 *   1. Within "car" mode, split into "driving" vs "in the car" by GPS
 *      speed — so a red-light pause reads naturally and active driving
 *      is called out distinctly.
 *   2. When AR reports "still" but we were in a car within the last few
 *      minutes, render "sitting in the car" instead of generic still —
 *      catches the parked-but-still-occupied case where AR has flipped
 *      car → still after the engine stopped.
 * Returns "" for UNKNOWN so the anchor drops the sentence rather than
 * guessing.
 */
function describeActivity(sensors: SensorSnapshot): string {
  const activity = sensors.activity;
  if (!activity) return "";

  if (activity === "car") {
    _lastCarActivityAt = Date.now();
    const speed = sensors.location?.speed ?? 0;
    return speed > DRIVING_SPEED_THRESHOLD_MS
      ? "You are driving."
      : "You are in the car.";
  }

  switch (activity) {
    case "walking":
      return "You are walking.";
    case "running":
      return "You are running.";
    case "bicycle":
      return "You are riding a bike.";
    case "bus":
      return "You are on the bus.";
    case "train":
      return "You are on the train.";
    case "subway":
      return "You are on the subway.";
    case "still": {
      // Sticky-car-memory check before falling through to generic still.
      if (
        _lastCarActivityAt !== null &&
        Date.now() - _lastCarActivityAt < IN_CAR_MEMORY_MS
      ) {
        return "You are sitting in the car.";
      }
      return isIndoor(sensors.location?.placeType)
        ? "You are sitting still."
        : "You are standing still.";
    }
    default:
      return "";
  }
}

function isIndoor(placeType: string | undefined): boolean {
  if (!placeType) return false;
  return [
    "residential",
    "restaurant",
    "cafe",
    "bar",
    "store",
    "shop",
    "museum",
    "mall",
    "shopping_mall",
    "airport",
    "hospital",
    "office",
    "lodging",
    "school",
    "university",
    "movie_theater",
    "library",
  ].includes(placeType);
}

// Re-export TransportMode so callers don't have to import from two places.
export type { TransportMode };
