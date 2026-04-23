import { getEnv } from "./env";

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
    const res = await fetch(url);
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
