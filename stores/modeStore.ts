import { create } from "zustand";
import type { SensorSnapshot } from "@/types";
import { useTimeline } from "@/stores/timelineStore";

/**
 * Mode store — tracks Conversation Mode and Venue Mode.
 *
 * Conversation Mode is the full-screen tap-PTT overlay with image attachments
 * disabled and ElevenLabs forced on. It is entered/exited MANUALLY from the
 * header button only — the previous auto-engagement on sustained IN_VEHICLE
 * was removed because (a) it flapped in the field on the GPS-speed heuristic
 * and (b) Tim uses Conversation Mode in many non-driving situations now.
 * Activity Recognition (the replacement for that heuristic) is intentionally
 * NOT wired to mode transitions — it feeds the emote layer as context only.
 */

export interface VenueBoundary {
  /** Center coordinates of the venue. */
  latitude: number;
  longitude: number;
  /** Radius in meters — Tim leaving past this triggers venue exit. */
  radiusM: number;
  /** Display name for UI ("Kings Island", "Cincinnati Zoo"). */
  name: string;
  /** Underlying placeType from the Places API ("amusement_park", etc.). */
  placeType: string;
}

interface ModeState {
  /** Conversation Mode active — full-screen tap-PTT overlay, image attachments
   *  disabled, ElevenLabs forced on. */
  conversation: boolean;

  /** VenueMode active — queue Waypoints suppressed, RideCards enabled. */
  venue: boolean;
  /** Current venue's boundary — used to auto-exit when Tim walks off the property. */
  venueBoundary: VenueBoundary | null;

  /** Enter Conversation Mode (from the header button). */
  enterConversationManual: () => void;
  /** Exit Conversation Mode. */
  exitConversation: () => void;

  /** Enter VenueMode with a specific boundary. */
  enterVenue: (boundary: VenueBoundary) => void;
  /** Exit VenueMode (call when Tim leaves the boundary). */
  exitVenue: () => void;

  /**
   * Feed a fresh sensor snapshot into the store to evaluate venue transitions.
   * Safe to call on every tick — idempotent when the state is already correct.
   * Returns a diff describing any transitions that fired this tick.
   */
  evaluateTransitions: (snapshot: SensorSnapshot) => ModeTransitions;
}

export interface ModeTransitions {
  venueEntered?: VenueBoundary;
  venueExited?: VenueBoundary;
}

// Place types that trigger VenueMode auto-entry.
const VENUE_TYPES = new Set([
  "amusement_park",
  "stadium",
  "mall",
  "airport",
  "campus",
  "fairground",
]);

function defaultVenueRadiusM(placeType: string): number {
  if (placeType === "amusement_park" || placeType === "fairground") return 800;
  if (placeType === "airport") return 2000;
  if (placeType === "campus") return 1200;
  if (placeType === "stadium") return 400;
  if (placeType === "mall") return 300;
  return 500;
}

/** Haversine distance in meters. */
function distanceM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const la1 = toRad(aLat);
  const la2 = toRad(bLat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const useMode = create<ModeState>((set, get) => ({
  conversation: false,
  venue: false,
  venueBoundary: null,

  enterConversationManual: () => {
    if (get().conversation) return;
    set({ conversation: true });
    useTimeline.getState().append({
      kind: "drive-enter",
      icon: "🎙",
      label: "Conversation Mode entered (manual)",
    });
  },

  exitConversation: () => {
    if (!get().conversation) return;
    set({ conversation: false });
    useTimeline.getState().append({
      kind: "drive-exit",
      icon: "🔇",
      label: "Conversation Mode exited",
    });
  },

  enterVenue: (boundary) => {
    const s = get();
    if (s.venue && s.venueBoundary?.name === boundary.name) return;
    set({ venue: true, venueBoundary: boundary });
  },

  exitVenue: () => {
    if (!get().venue) return;
    set({ venue: false, venueBoundary: null });
  },

  evaluateTransitions: (snapshot) => {
    const transitions: ModeTransitions = {};
    const s = get();

    const place = snapshot.location;
    if (!place) return transitions;

    if (!s.venue) {
      // Enter check
      if (place.placeType && VENUE_TYPES.has(place.placeType) && place.placeName) {
        const boundary: VenueBoundary = {
          latitude: place.latitude,
          longitude: place.longitude,
          radiusM: defaultVenueRadiusM(place.placeType),
          name: place.placeName,
          placeType: place.placeType,
        };
        set({ venue: true, venueBoundary: boundary });
        transitions.venueEntered = boundary;
      }
    } else if (s.venueBoundary) {
      // Exit check — Tim has walked past the radius
      const d = distanceM(
        place.latitude,
        place.longitude,
        s.venueBoundary.latitude,
        s.venueBoundary.longitude
      );
      if (d > s.venueBoundary.radiusM) {
        transitions.venueExited = s.venueBoundary;
        set({ venue: false, venueBoundary: null });
      }
    }

    return transitions;
  },
}));
