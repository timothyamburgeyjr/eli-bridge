import type { SensorSnapshot } from "@/types";
import {
  getCurrentLocation,
  isAtHome,
  inferActivityFromSpeed,
} from "@/services/location";
import { reverseGeocode } from "@/services/places";
import { getCurrentWeather } from "@/services/weather";
import { readBarometer, startBarometerWatch } from "@/services/sensors";
import { STUB_SENSOR_SNAPSHOT } from "./sensorStub";

// Start the barometer at module load — it's cheap and the 30-min delta needs
// history built up over time anyway.
startBarometerWatch();

/**
 * Gather a live sensor snapshot by querying location, places, weather, and
 * on-device sensors. Each call is one-shot — no background polling happens
 * at this layer.
 *
 * Graceful on failure: if GPS is off or permission denied, falls back to the
 * stub (dev-at-desk defaults). If weather or places fail, just omits those
 * fields rather than blowing up the whole send.
 */
export async function gatherSensorSnapshot(): Promise<SensorSnapshot> {
  const loc = await getCurrentLocation();

  // GPS unavailable → fall back to the stub entirely (dev-at-desk testing)
  if (!loc) {
    return STUB_SENSOR_SNAPSHOT;
  }

  const snapshot: SensorSnapshot = {
    location: loc,
    activity: inferActivityFromSpeed(loc.speed),
  };

  // Home shortcut — if within the geofence, don't burn a Places API call
  if (isAtHome(loc)) {
    snapshot.location = {
      ...loc,
      placeName: "Home · 1550 Weisflock Rd, Lynchburg OH",
      placeType: "residential",
    };
  } else {
    // Elsewhere — resolve a human-friendly place name + type
    const place = await reverseGeocode(loc.latitude, loc.longitude);
    if (place) {
      snapshot.location = {
        ...loc,
        placeName: place.name,
        placeType: place.placeType,
      };
    }
  }

  // Weather (cached 5 min or until Tim moves > 500m)
  const weather = await getCurrentWeather(loc.latitude, loc.longitude);
  if (weather) snapshot.weather = weather;

  // Barometer — only present if the device has the sensor and we've got
  // enough history for a delta
  const baro = readBarometer();
  if (baro) snapshot.barometer = baro;

  return snapshot;
}
