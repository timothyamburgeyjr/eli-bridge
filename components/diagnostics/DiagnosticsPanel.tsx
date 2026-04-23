import React, { useEffect, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { C } from "@/constants/theme";
import { getEnv } from "@/services/env";
import { getCurrentLocation, isAtHome, inferActivityFromSpeed } from "@/services/location";
import { reverseGeocode } from "@/services/places";
import { getCurrentWeather } from "@/services/weather";
import { readBarometer, isBarometerAvailable } from "@/services/sensors";

type Status = "pending" | "pass" | "fail" | "warn";

interface CheckRow {
  name: string;
  status: Status;
  detail: string;
  subdetail?: string;
  tookMs?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DiagnosticsPanel({ visible, onClose }: Props) {
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [running, setRunning] = useState(false);

  const runAll = useCallback(async () => {
    setRunning(true);
    const results: CheckRow[] = [];

    // Network (fetch anything small)
    results.push(await probeNetwork());

    // Env keys (non-network, fast)
    results.push(checkEnvKey("Gemini key", "GEMINI_API_KEY"));
    results.push(checkEnvKey("Kindroid key", "KINDROID_API_KEY"));
    results.push(checkEnvKey("Kindroid AI ID", "KINDROID_AI_ID"));
    results.push(checkEnvKey("ElevenLabs key", "ELEVENLABS_API_KEY"));
    results.push(checkEnvKey("ElevenLabs voice", "ELEVENLABS_VOICE_ID"));
    results.push(checkEnvKey("Google Maps key", "GOOGLE_MAPS_API_KEY"));
    results.push(checkEnvKey("OpenWeather key", "OPENWEATHER_API_KEY"));
    results.push(checkEnvKey("Image server URL", "IMAGE_SERVER_URL"));
    results.push(checkEnvKey("Image upload key", "IMAGE_UPLOAD_KEY"));

    setRows([...results]);

    // GPS
    const gpsStart = Date.now();
    const loc = await getCurrentLocation();
    const gpsMs = Date.now() - gpsStart;
    if (!loc) {
      results.push({
        name: "GPS fix",
        status: "fail",
        detail: "No location — permission denied or GPS off",
        tookMs: gpsMs,
      });
      setRows([...results]);
    } else {
      const atHome = isAtHome(loc);
      const activity = inferActivityFromSpeed(loc.speed);
      results.push({
        name: "GPS fix",
        status: "pass",
        detail: `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`,
        subdetail: `accuracy ${Math.round(loc.accuracy)}m · ${atHome ? "at home" : "elsewhere"} · activity: ${activity}${loc.speed ? ` (${loc.speed.toFixed(1)} m/s)` : ""}`,
        tookMs: gpsMs,
      });
      setRows([...results]);

      // Places (skip when home — we short-circuit in production too)
      if (atHome) {
        results.push({
          name: "Places (reverse geocode)",
          status: "warn",
          detail: "Skipped — home geofence short-circuits this",
        });
      } else {
        const placesStart = Date.now();
        const place = await reverseGeocode(loc.latitude, loc.longitude);
        const placesMs = Date.now() - placesStart;
        if (place) {
          results.push({
            name: "Places (reverse geocode)",
            status: "pass",
            detail: place.name,
            subdetail: place.placeType ?? undefined,
            tookMs: placesMs,
          });
        } else {
          results.push({
            name: "Places (reverse geocode)",
            status: "fail",
            detail: "API call failed or returned no results",
            tookMs: placesMs,
          });
        }
      }
      setRows([...results]);

      // Weather
      const weatherStart = Date.now();
      const weather = await getCurrentWeather(loc.latitude, loc.longitude);
      const weatherMs = Date.now() - weatherStart;
      if (weather) {
        results.push({
          name: "Weather",
          status: "pass",
          detail: `${Math.round(weather.temp)}°F, ${weather.conditions}`,
          subdetail: `humidity ${weather.humidity}% · wind ${Math.round(weather.windSpeed)} mph${weather.uvIndex !== undefined ? ` · UV ${weather.uvIndex}` : ""}${weather.alerts?.length ? ` · alerts: ${weather.alerts.join(", ")}` : ""}`,
          tookMs: weatherMs,
        });
      } else {
        results.push({
          name: "Weather",
          status: "fail",
          detail: "OpenWeather call failed — check key or network",
          tookMs: weatherMs,
        });
      }
      setRows([...results]);
    }

    // Barometer
    const baroAvail = await isBarometerAvailable();
    const baro = readBarometer();
    if (!baroAvail) {
      results.push({
        name: "Barometer",
        status: "warn",
        detail: "Sensor not available on device",
      });
    } else if (!baro) {
      results.push({
        name: "Barometer",
        status: "warn",
        detail: "No samples yet — needs ~1 minute of runtime",
      });
    } else {
      results.push({
        name: "Barometer",
        status: "pass",
        detail: `${baro.pressure.toFixed(1)} hPa`,
        subdetail: `Δ30min: ${baro.delta30min >= 0 ? "+" : ""}${baro.delta30min.toFixed(1)} hPa`,
      });
    }
    setRows([...results]);

    // Image server
    const imgStart = Date.now();
    const serverUrl = getEnv("IMAGE_SERVER_URL");
    if (!serverUrl) {
      results.push({
        name: "Image server",
        status: "fail",
        detail: "EXPO_PUBLIC_IMAGE_SERVER_URL not set",
      });
    } else {
      try {
        const res = await fetch(`${serverUrl.replace(/\/+$/, "")}/health`, {
          method: "GET",
        });
        const body = (await res.text()).trim();
        const imgMs = Date.now() - imgStart;
        if (res.ok && body === "ok") {
          results.push({
            name: "Image server",
            status: "pass",
            detail: "reachable, health ok",
            subdetail: serverUrl,
            tookMs: imgMs,
          });
        } else {
          results.push({
            name: "Image server",
            status: "fail",
            detail: `HTTP ${res.status}: ${body.slice(0, 60)}`,
            tookMs: imgMs,
          });
        }
      } catch (err) {
        results.push({
          name: "Image server",
          status: "fail",
          detail: err instanceof Error ? err.message : String(err),
          tookMs: Date.now() - imgStart,
        });
      }
    }
    setRows([...results]);
    setRunning(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setRows([]);
      runAll();
    }
  }, [visible, runAll]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: C.muted, fontSize: 20 }}>✕</Text>
          </Pressable>
          <Text style={styles.title}>Service Diagnostics</Text>
          <Pressable
            onPress={runAll}
            disabled={running}
            style={[styles.rerunBtn, running ? { opacity: 0.5 } : null]}
          >
            {running ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Text style={{ color: C.accent, fontSize: 13, fontWeight: "600" }}>Rerun</Text>
            )}
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {rows.length === 0 && running ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 10 }}>Probing services…</Text>
            </View>
          ) : (
            rows.map((r, i) => <Row key={i} row={r} />)
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({ row }: { row: CheckRow }) {
  return (
    <View style={styles.row}>
      <Text style={styles.statusIcon}>{iconFor(row.status)}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.nameLine}>
          <Text style={styles.name}>{row.name}</Text>
          {row.tookMs !== undefined ? (
            <Text style={styles.timing}>{row.tookMs}ms</Text>
          ) : null}
        </View>
        <Text style={[styles.detail, { color: colorFor(row.status) }]}>{row.detail}</Text>
        {row.subdetail ? <Text style={styles.subdetail}>{row.subdetail}</Text> : null}
      </View>
    </View>
  );
}

function iconFor(s: Status): string {
  if (s === "pass") return "✅";
  if (s === "fail") return "❌";
  if (s === "warn") return "⚠️";
  return "⋯";
}

function colorFor(s: Status): string {
  if (s === "pass") return C.green;
  if (s === "fail") return C.red;
  if (s === "warn") return C.amber;
  return C.muted;
}

function checkEnvKey(
  name: string,
  key: Parameters<typeof getEnv>[0]
): CheckRow {
  const v = getEnv(key);
  if (!v) return { name, status: "fail", detail: "not set" };
  return { name, status: "pass", detail: `set (${v.length} chars)` };
}

async function probeNetwork(): Promise<CheckRow> {
  const start = Date.now();
  try {
    const res = await fetch("https://www.google.com/generate_204", { method: "GET" });
    const ms = Date.now() - start;
    if (res.ok || res.status === 204) {
      return { name: "Network", status: "pass", detail: "online", tookMs: ms };
    }
    return { name: "Network", status: "fail", detail: `HTTP ${res.status}`, tookMs: ms };
  } catch {
    return { name: "Network", status: "fail", detail: "offline or DNS fail", tookMs: Date.now() - start };
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "700", color: C.text },
  rerunBtn: {
    width: 60,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: C.accent + "14",
    borderWidth: 1,
    borderColor: C.accent + "44",
  },
  centered: { alignItems: "center", paddingVertical: 60 },
  row: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  statusIcon: { fontSize: 18, width: 26, textAlign: "center" },
  nameLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  name: { fontSize: 13, color: C.text, fontWeight: "600" },
  timing: { fontSize: 10, color: C.muted },
  detail: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  subdetail: { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 16 },
});
