import { getEnv } from "./env";
import type { SensorSnapshot } from "@/types";

type WeatherShape = NonNullable<SensorSnapshot["weather"]>;

interface CacheEntry {
  fetchedAt: number;
  coords: { lat: number; lon: number };
  data: WeatherShape;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_DISTANCE_M = 500; // invalidate if we've moved > 500m

let cache: CacheEntry | null = null;

function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Fetch current weather for the given coords. Caches for 5 min; invalidates
 * early if Tim has moved > 500m. Returns null on API failure so the caller
 * can gracefully omit weather from the sensor snapshot.
 */
export async function getCurrentWeather(
  lat: number,
  lon: number
): Promise<WeatherShape | null> {
  const key = getEnv("OPENWEATHER_API_KEY");
  if (!key) return null;

  const now = Date.now();
  if (
    cache &&
    now - cache.fetchedAt < CACHE_TTL_MS &&
    distanceMeters(cache.coords, { lat, lon }) < CACHE_DISTANCE_M
  ) {
    return cache.data;
  }

  try {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=imperial&exclude=minutely,hourly,daily&appid=${key}`;
    const res = await fetch(url);
    if (!res.ok) return cache?.data ?? null;
    const json = (await res.json()) as {
      current?: {
        temp: number;
        humidity: number;
        wind_speed: number;
        uvi?: number;
        weather: { main: string; description: string }[];
      };
      alerts?: { event: string; description: string }[];
    };
    if (!json.current) return cache?.data ?? null;

    const w: WeatherShape = {
      temp: json.current.temp,
      conditions: json.current.weather?.[0]?.main?.toLowerCase() ?? "",
      humidity: json.current.humidity,
      windSpeed: json.current.wind_speed,
      uvIndex: json.current.uvi,
      alerts: json.alerts?.map((a) => a.event),
    };

    cache = { fetchedAt: now, coords: { lat, lon }, data: w };
    return w;
  } catch {
    return cache?.data ?? null;
  }
}

export function clearWeatherCache(): void {
  cache = null;
}
