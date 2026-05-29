import { getEnv } from "./env";
import { tracedFetch } from "@/session/diagnosticLog";

export interface PlaceInfo {
  /** Display-friendly name, e.g. "Dark Star Comics" or "Yellow Springs" */
  name: string;
  /** Places API place type, e.g. "restaurant", "park" */
  placeType?: string;
  /** Formatted street address */
  address?: string;
  /** Google Place ID — use for follow-up detail fetches */
  placeId?: string;
}

const PLACE_TYPES_TO_PREFER = new Set([
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
]);

/**
 * Reverse-geocode a GPS coordinate to a useful display name. Prefers a
 * nearby named POI (restaurant, museum, park, etc.) over the raw street
 * address, since POI names make for richer emotes. Falls back to street
 * address, then to the locality name, then to lat/lon.
 *
 * Uses Google's Geocoding API (reverse geocoding endpoint). Returns null on
 * API failure; caller should fall back gracefully.
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<PlaceInfo | null> {
  const key = getEnv("GOOGLE_MAPS_API_KEY");
  if (!key) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${key}`;
    const res = await tracedFetch("places", url, { label: "GET geocode" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      results?: {
        formatted_address: string;
        types: string[];
        place_id: string;
        address_components: { long_name: string; types: string[] }[];
      }[];
    };
    if (json.status !== "OK" || !json.results?.length) return null;

    // Try to find a POI-ish result
    const poi = json.results.find((r) =>
      r.types.some((t) => PLACE_TYPES_TO_PREFER.has(t))
    );
    const best = poi ?? json.results[0];

    const locality = best.address_components.find((c) =>
      c.types.includes("locality")
    )?.long_name;
    const state = best.address_components.find((c) =>
      c.types.includes("administrative_area_level_1")
    )?.long_name;

    const displayName =
      poi
        ? `${best.address_components[0].long_name}${locality ? ` · ${locality}${state ? ", " + shortState(state) : ""}` : ""}`
        : locality && state
        ? `${locality}, ${shortState(state)}`
        : best.formatted_address;

    const placeType = best.types.find((t) => PLACE_TYPES_TO_PREFER.has(t)) ?? best.types[0];

    return {
      name: displayName,
      placeType,
      address: best.formatted_address,
      placeId: best.place_id,
    };
  } catch {
    return null;
  }
}

function shortState(fullName: string): string {
  // Small map for US states Tim is likely to traverse; fall back to fullName.
  const map: Record<string, string> = {
    "Ohio": "OH",
    "Michigan": "MI",
    "Kentucky": "KY",
    "Indiana": "IN",
    "West Virginia": "WV",
    "Pennsylvania": "PA",
    "Maryland": "MD",
    "Virginia": "VA",
    "District of Columbia": "DC",
    "Tennessee": "TN",
    "Illinois": "IL",
  };
  return map[fullName] ?? fullName;
}

// ── Nearby Search ──────────────────────────────────────────────────

export interface NearbyPlace {
  /** Google Place ID — stable identifier across calls. */
  placeId: string;
  /** Display name from Places (e.g., "Dark Star Comics", "Fiona's Habitat"). */
  name: string;
  /** Comma-joined Places API types (e.g., "book_store, store, point_of_interest"). */
  types: string[];
  /** Short formatted address ("108 Dayton St, Yellow Springs"). */
  vicinity?: string;
  /** Star rating 1.0–5.0 if Places has one. */
  rating?: number;
  /** True if Places knows the place is open right now. Undefined when unknown. */
  openNow?: boolean;
  /** Distance in meters from the search origin. Computed client-side. */
  distanceM: number;
}

// 350m default — comfortably covers a Kroger/Walmart from anywhere in the
// parking lot (typical big-box footprint is ~150m wide). Smaller default
// would miss the building entirely if GPS snapped to the far edge.
const NEARBY_DEFAULT_RADIUS_M = 350;
const NEARBY_WIDE_RADIUS_M = 1500;
const NEARBY_MAX_RESULTS = 10;

export interface FindNearbyPlacesResult {
  /** The matched POIs, sorted by distance ascending. Empty array on
   *  legitimate ZERO_RESULTS, or when the API surfaced an error. */
  places: NearbyPlace[];
  /** Diagnostic info on failure — undefined on success. Surfaced in the
   *  PlacePickerModal so Tim sees the real cause (REQUEST_DENIED, key
   *  restriction, quota) instead of the generic "no places found". */
  error?: string;
}

/**
 * List the closest POIs to a coordinate, suitable for a "📍 Save place"
 * picker. Uses Google Places "Nearby Search" (legacy) — returns proper POI
 * names (not address-derived strings like the Geocoding API does).
 *
 * Sorted client-side by haversine distance from the origin. Capped at
 * NEARBY_MAX_RESULTS to keep the picker tight. On API failure, returns
 * { places: [], error: "..." } with the actual Google error so the modal
 * can show what's wrong.
 */
export async function findNearbyPlaces(
  lat: number,
  lon: number,
  radiusM: number = NEARBY_DEFAULT_RADIUS_M
): Promise<FindNearbyPlacesResult> {
  const key = getEnv("GOOGLE_MAPS_API_KEY");
  if (!key) {
    return {
      places: [],
      error: "Maps API key not configured (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).",
    };
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
      `location=${lat},${lon}&radius=${radiusM}&key=${key}`;
    const res = await tracedFetch("places", url, { label: "GET nearbysearch" });
    if (!res.ok) {
      return {
        places: [],
        error: `Places API HTTP ${res.status}: ${res.statusText}`,
      };
    }
    const json = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: {
        place_id: string;
        name: string;
        types: string[];
        vicinity?: string;
        rating?: number;
        opening_hours?: { open_now?: boolean };
        geometry?: { location: { lat: number; lng: number } };
      }[];
    };

    if (json.status === "ZERO_RESULTS") {
      return { places: [] };
    }
    if (json.status !== "OK") {
      const detail = json.error_message ? ` — ${json.error_message}` : "";
      console.warn(
        `[places] Nearby Search status=${json.status}${detail}`
      );
      return {
        places: [],
        error: `Places API: ${json.status}${detail}`,
      };
    }

    const enriched: NearbyPlace[] = (json.results ?? [])
      .filter((r) => r.geometry?.location && r.name)
      .map((r) => ({
        placeId: r.place_id,
        name: r.name,
        types: r.types ?? [],
        vicinity: r.vicinity,
        rating: r.rating,
        openNow: r.opening_hours?.open_now,
        distanceM: haversineMeters(
          { lat, lon },
          { lat: r.geometry!.location.lat, lon: r.geometry!.location.lng }
        ),
      }))
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, NEARBY_MAX_RESULTS);

    return { places: enriched };
  } catch (err) {
    return {
      places: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Haversine distance in meters. Inlined to avoid importing from location.ts. */
function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

/** Re-export for callers that need the wider-radius constant. */
export const NEARBY_PLACES_WIDE_RADIUS_M = NEARBY_WIDE_RADIUS_M;

/** Pretty-print a Place type for display ("amusement_park" → "amusement park"). */
export function prettyPlaceType(t?: string): string {
  if (!t) return "";
  return t.replace(/_/g, " ");
}

/**
 * Pick the most descriptive type for a place. Skips generic types like
 * "establishment" and "point_of_interest" in favor of specific ones like
 * "book_store" or "amusement_park".
 */
export function bestPlaceType(types: string[]): string | undefined {
  if (!types.length) return undefined;
  const generic = new Set(["establishment", "point_of_interest", "premise"]);
  const specific = types.find((t) => !generic.has(t));
  return specific ?? types[0];
}
