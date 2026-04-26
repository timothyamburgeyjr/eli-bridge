import type { LocationData } from "@/types";
import { distanceMeters, isAtHome } from "@/services/location";
import { reverseGeocode } from "@/services/places";
import { useChat } from "@/stores/chatStore";
import { pushArrivalScene } from "./sceneUpdater";

/**
 * Arrival detection for LocationCards. Sits on top of the same GPS poller
 * tick as drivingPoller — when the latest fix is at a recognizable POI that
 * Tim has dwelled at for ~2 min, emits a `from: "location"` system card.
 *
 * Why dwell-gated: a 30-second drive-through past a restaurant shouldn't
 * fire an "Arrived" card. Tim has to actually be there.
 *
 * Why a separate type set from places.ts's PLACE_TYPES_TO_PREFER: that set
 * controls what reverseGeocode prefers for emote text ("Yellow Springs"
 * vs. a street address). The arrival set controls what's worth showing
 * Tim a card about — broader, includes things like hospitals and gas
 * stations that you wouldn't want to literally show as the place name in
 * an emote but absolutely want a card for arriving at.
 */

const REGEOCODE_DISTANCE_M = 50;
const ARRIVAL_DWELL_MS = 2 * 60 * 1000;

// Place types that warrant an arrival card. Broader than PLACE_TYPES_TO_PREFER
// to capture medical, transit, and lodging destinations Tim asks about.
const ARRIVAL_PLACE_TYPES = new Set([
  "amusement_park",
  "stadium",
  "shopping_mall",
  "airport",
  "university",
  "fairground",
  "museum",
  "restaurant",
  "cafe",
  "bar",
  "store",
  "park",
  "tourist_attraction",
  "place_of_worship",
  "point_of_interest",
  "hospital",
  "doctor",
  "pharmacy",
  "school",
  "library",
  "gas_station",
  "lodging",
  "transit_station",
  "train_station",
  "bus_station",
  "subway_station",
]);

interface PlaceFix {
  placeId: string;
  name: string;
  placeType?: string;
  address?: string;
}

interface ArrivalState {
  lastGeocodedFix: { lat: number; lon: number } | null;
  /**
   * Most recent successful reverseGeocode result, regardless of whether
   * it triggered an arrival card. Used by the live-context banner so it
   * shows where Tim is right now, not where he last "arrived."
   */
  lastGeocodeResult: PlaceFix | null;
  lastPlace: PlaceFix | null;
  candidate: (PlaceFix & { firstSeenAt: number }) | null;
  emittedThisSession: Set<string>;
}

const state: ArrivalState = {
  lastGeocodedFix: null,
  lastGeocodeResult: null,
  lastPlace: null,
  candidate: null,
  emittedThisSession: new Set(),
};

/**
 * Feed a fresh GPS fix in. Called from drivingPoller's tick. Idempotent and
 * cheap when nothing has changed (only re-geocodes when the fix has moved
 * meaningfully from the last geocoded point).
 */
export async function processArrivalTick(loc: LocationData): Promise<void> {
  // No arrival cards at home — that's the SessionJournal's territory.
  if (isAtHome({ latitude: loc.latitude, longitude: loc.longitude })) {
    state.candidate = null;
    return;
  }

  // Skip the geocode call if Tim hasn't moved meaningfully — but still let
  // the candidate dwell timer tick (we may now have crossed the 2-min mark
  // for a place we noticed earlier).
  let needsGeocode = !state.lastGeocodedFix;
  if (state.lastGeocodedFix) {
    const moved = distanceMeters(
      { lat: loc.latitude, lon: loc.longitude },
      { lat: state.lastGeocodedFix.lat, lon: state.lastGeocodedFix.lon }
    );
    if (moved > REGEOCODE_DISTANCE_M) needsGeocode = true;
  }

  if (!needsGeocode) {
    promoteCandidateIfReady();
    return;
  }

  let place: Awaited<ReturnType<typeof reverseGeocode>> = null;
  try {
    place = await reverseGeocode(loc.latitude, loc.longitude);
  } catch {
    place = null;
  }
  state.lastGeocodedFix = { lat: loc.latitude, lon: loc.longitude };

  if (!place || !place.placeId) {
    // Lost POI context (or geocode failed) — clear any pending candidate so
    // the dwell counter restarts cleanly the next time we land somewhere.
    state.candidate = null;
    state.lastGeocodeResult = null;
    return;
  }

  // Always track the latest geocode for the live-context banner, even when
  // it's not arrival-worthy — Tim wants to see where he is now, not where
  // he last "arrived" by the dwell rules.
  state.lastGeocodeResult = {
    placeId: place.placeId,
    name: place.name,
    placeType: place.placeType,
    address: place.address,
  };

  // Don't card things like raw street addresses or political boundaries.
  if (!place.placeType || !ARRIVAL_PLACE_TYPES.has(place.placeType)) {
    state.candidate = null;
    state.lastPlace = {
      placeId: place.placeId,
      name: place.name,
      placeType: place.placeType,
      address: place.address,
    };
    return;
  }

  // Already settled here — nothing to do.
  if (state.lastPlace?.placeId === place.placeId) {
    state.candidate = null;
    return;
  }

  // Already arrived here once this session — record but don't re-emit.
  if (state.emittedThisSession.has(place.placeId)) {
    state.lastPlace = {
      placeId: place.placeId,
      name: place.name,
      placeType: place.placeType,
      address: place.address,
    };
    state.candidate = null;
    return;
  }

  // Same candidate as last tick — let the dwell timer keep running.
  if (state.candidate?.placeId === place.placeId) {
    promoteCandidateIfReady();
    return;
  }

  // New candidate — start dwell timer.
  state.candidate = {
    placeId: place.placeId,
    name: place.name,
    placeType: place.placeType,
    address: place.address,
    firstSeenAt: Date.now(),
  };
  console.log(
    `[arrival] candidate set: ${place.name} (${place.placeType}) — dwelling`
  );
}

function promoteCandidateIfReady(): void {
  if (!state.candidate) return;
  if (Date.now() - state.candidate.firstSeenAt < ARRIVAL_DWELL_MS) return;

  const c = state.candidate;
  emitArrivalCard(c);
  state.lastPlace = {
    placeId: c.placeId,
    name: c.name,
    placeType: c.placeType,
    address: c.address,
  };
  state.emittedThisSession.add(c.placeId);
  state.candidate = null;
}

function emitArrivalCard(p: PlaceFix): void {
  const now = new Date();
  const time = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  // The rendered LocationCard component reads `name`, `category`, `address`
  // (note: drift from the type interface in types/index.ts which uses
  // `type` and `arrivalBrief` — component is the source of truth).
  const card = {
    id: `loc-${p.placeId}-${now.getTime()}`,
    from: "location" as const,
    time,
    timestamp: now.getTime(),
    name: p.name,
    category: prettyCategory(p.placeType),
    address: p.address,
  };
  console.log(`[arrival] emitting LocationCard: ${p.name}`);
  useChat.getState().appendSystemCard(card);
  // Also push an Eli-centric scene update so Kindroid's persistent backdrop
  // reflects where Tim is now. Fire-and-forget — the LocationCard renders
  // regardless of whether the scene push succeeds.
  pushArrivalScene({ name: p.name, placeType: p.placeType });
}

function prettyCategory(t?: string): string {
  if (!t) return "";
  return t.replace(/_/g, " ");
}

/**
 * Clear all arrival state. Call on session start so emittedThisSession and
 * lastPlace don't carry across sessions.
 */
export function resetArrivalWatcher(): void {
  state.lastGeocodedFix = null;
  state.lastGeocodeResult = null;
  state.lastPlace = null;
  state.candidate = null;
  state.emittedThisSession.clear();
}

/**
 * Latest known place from the most recent successful reverse-geocode,
 * regardless of arrival-worthy filtering. Returns null when the latest fix
 * didn't resolve to a place (or geocode failed). Used by the live-context
 * banner to avoid double-geocoding — the watcher already does the work.
 */
export function getLastKnownPlace(): {
  name: string;
  placeType?: string;
} | null {
  if (!state.lastGeocodeResult) return null;
  return {
    name: state.lastGeocodeResult.name,
    placeType: state.lastGeocodeResult.placeType,
  };
}
