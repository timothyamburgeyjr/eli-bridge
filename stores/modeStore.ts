import { create } from "zustand";
import type { SensorSnapshot } from "@/types";

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

export type DrivingActivation = "manual" | "auto";

interface ModeState {
  /** Driving Mode active — full-screen tap-PTT overlay, image attachments disabled, ElevenLabs forced on. */
  driving: boolean;
  /** How Driving Mode was activated. "auto" → shows the 10s cancellation banner. */
  drivingSource: DrivingActivation | null;
  /** ISO timestamp of when driving mode auto-entry is pending (banner visible). null when not pending. */
  drivingPendingSince: string | null;
  /**
   * Consecutive non-car ticks seen since the last car tick. Only used for
   * auto-exit hysteresis — we require multiple sustained non-car samples
   * before dropping Driving Mode, so a red light or a 25-mph school zone
   * doesn't flip the mode off mid-drive. Reset to 0 on any car tick.
   */
  nonCarStreak: number;

  /** VenueMode active — queue Waypoints suppressed, RideCards enabled. */
  venue: boolean;
  /** Current venue's boundary — used to auto-exit when Tim walks off the property. */
  venueBoundary: VenueBoundary | null;

  /** Manually enter Driving Mode (from Settings or an in-session button). */
  enterDrivingManual: () => void;
  /**
   * Begin the 10-second auto-entry banner. Call when sustained IN_VEHICLE
   * activity is first detected. After 10s without a cancel, call confirmDrivingAuto().
   */
  beginDrivingAuto: () => void;
  /** Confirm auto-entry after the 10s grace period. */
  confirmDrivingAuto: () => void;
  /** Cancel a pending auto-entry (user tapped "cancel" in the banner). */
  cancelDrivingAuto: () => void;
  /** Exit Driving Mode (manual or auto-stop when activity !== car for 60s). */
  exitDriving: () => void;

  /** Enter VenueMode with a specific boundary. */
  enterVenue: (boundary: VenueBoundary) => void;
  /** Exit VenueMode (call when Tim leaves the boundary). */
  exitVenue: () => void;

  /**
   * Feed a fresh sensor snapshot into the store to let it compute auto
   * transitions. Safe to call on every message send — idempotent when the
   * state is already correct. Returns a diff describing any transitions that
   * fired this tick, so the caller can emit InterruptCard / VenueModeCard etc.
   */
  evaluateTransitions: (
    snapshot: SensorSnapshot,
    opts?: { drivingAutoEnabled?: boolean }
  ) => ModeTransitions;
}

export interface ModeTransitions {
  drivingAutoBanner?: { name: "entering" | "cancelled" | "exited" };
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

/**
 * How many consecutive non-car ticks are required before auto-exit fires.
 * At a 15s polling interval this is ~45s of sustained stop/walk. Long enough
 * to absorb stoplights and school zones; short enough to switch out promptly
 * when Tim parks.
 */
const EXIT_STREAK_THRESHOLD = 3;

export const useMode = create<ModeState>((set, get) => ({
  driving: false,
  drivingSource: null,
  drivingPendingSince: null,
  nonCarStreak: 0,
  venue: false,
  venueBoundary: null,

  enterDrivingManual: () => {
    if (get().driving) return;
    set({
      driving: true,
      drivingSource: "manual",
      drivingPendingSince: null,
      nonCarStreak: 0,
    });
  },

  beginDrivingAuto: () => {
    const s = get();
    if (s.driving || s.drivingPendingSince) return;
    set({ drivingPendingSince: new Date().toISOString() });
  },

  confirmDrivingAuto: () => {
    const s = get();
    if (s.driving) return;
    set({
      driving: true,
      drivingSource: "auto",
      drivingPendingSince: null,
      nonCarStreak: 0,
    });
  },

  cancelDrivingAuto: () => {
    set({ drivingPendingSince: null });
  },

  exitDriving: () => {
    if (!get().driving && !get().drivingPendingSince) return;
    set({
      driving: false,
      drivingSource: null,
      drivingPendingSince: null,
      nonCarStreak: 0,
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

  evaluateTransitions: (snapshot, opts) => {
    const transitions: ModeTransitions = {};
    const s = get();

    // ── VenueMode ────────────────────────────────────────────────────
    const place = snapshot.location;
    if (place) {
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
    }

    // ── Driving Mode (auto) ──────────────────────────────────────────
    const autoAllowed = opts?.drivingAutoEnabled ?? true;
    const isCar = snapshot.activity === "car";

    if (autoAllowed && !s.driving) {
      // Entry path — begin the 10s confirm banner on first car tick.
      if (isCar && !s.drivingPendingSince) {
        set({ drivingPendingSince: new Date().toISOString() });
        transitions.drivingAutoBanner = { name: "entering" };
      }
    } else if (s.driving && s.drivingSource === "auto") {
      // Exit path — require EXIT_STREAK_THRESHOLD consecutive non-car ticks
      // before dropping the mode. Stoplights and slow zones briefly drop GPS
      // speed under the car threshold; a single tick of "not-car" shouldn't
      // flip Driving Mode off mid-drive.
      if (isCar) {
        if (s.nonCarStreak > 0) set({ nonCarStreak: 0 });
      } else {
        const next = s.nonCarStreak + 1;
        if (next >= EXIT_STREAK_THRESHOLD) {
          set({
            driving: false,
            drivingSource: null,
            drivingPendingSince: null,
            nonCarStreak: 0,
          });
          transitions.drivingAutoBanner = { name: "exited" };
        } else {
          set({ nonCarStreak: next });
        }
      }
    }

    return transitions;
  },
}));
