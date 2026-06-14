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
 * Map the discrete Activity Recognition vocabulary to a stock prose
 * verb-phrase. Tweaked slightly for indoors-vs-outdoors when STILL:
 * "sitting still" reads naturally at home/restaurant, "standing still"
 * reads naturally outdoors. Returns "" for UNKNOWN so the anchor just
 * drops the sentence rather than guessing.
 */
function describeActivity(sensors: SensorSnapshot): string {
  const activity = sensors.activity;
  if (!activity) return "";

  switch (activity) {
    case "walking":
      return "You are walking.";
    case "running":
      return "You are running.";
    case "bicycle":
      return "You are riding a bike.";
    case "car":
      return "You are in the car.";
    case "bus":
      return "You are on the bus.";
    case "train":
      return "You are on the train.";
    case "subway":
      return "You are on the subway.";
    case "still":
      return isIndoor(sensors.location?.placeType)
        ? "You are sitting still."
        : "You are standing still.";
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
