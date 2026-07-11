import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import {
  findNearbyPlaces,
  prettyPlaceType,
  bestPlaceType,
  NearbyPlace,
  NEARBY_PLACES_WIDE_RADIUS_M,
} from "@/services/places";
import { getCurrentLocation } from "@/services/location";
import { useCompanionName } from "@/session/SessionStore";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called when Tim picks a place. Includes the snapped Tim coords so the
   *  card can record distance-at-save accurately. */
  onPick: (
    place: NearbyPlace,
    timCoords: { latitude: number; longitude: number }
  ) => void;
}

/**
 * Bottom-sheet modal listing the nearest POIs to Tim's current location for
 * the "📍 Save place" flow. Drives Google Places Nearby Search; sorts by
 * haversine distance client-side. Shows up to 10 places, with a refresh
 * button if the list looks wrong.
 */
export function PlacePickerModal({ visible, onClose, onPick }: Props) {
  const who = useCompanionName();
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [widened, setWidened] = useState(false);
  const [origin, setOrigin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const fetchPlaces = async (wider: boolean = false) => {
    setLoading(true);
    setError(null);
    setWidened(wider);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        setError("Couldn't get your location — check GPS permission");
        setPlaces([]);
        return;
      }
      setOrigin({ latitude: loc.latitude, longitude: loc.longitude });
      const result = await findNearbyPlaces(
        loc.latitude,
        loc.longitude,
        wider ? NEARBY_PLACES_WIDE_RADIUS_M : undefined
      );
      setPlaces(result.places);
      if (result.error) {
        // Surface the actual API error — usually "REQUEST_DENIED" with a
        // message about the Places API not being enabled on the key, or
        // a key-restriction issue. Far more useful than the old generic
        // "no places found" empty state.
        setError(result.error);
      } else if (result.places.length === 0) {
        setError(
          wider
            ? "No places at 1.5km radius. Genuinely sparse area, or pick somewhere by name later."
            : "No places found nearby. Try the wider search."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load places");
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchPlaces(false);
    } else {
      // Reset state when closed so reopening starts fresh
      setPlaces([]);
      setError(null);
      setOrigin(null);
      setWidened(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.backdrop} />
      <SafeAreaView style={styles.sheetWrap} edges={["bottom"]}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>📍 Save a place</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: C.muted, fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            {`Tap the place you're at — ${who} won't see it until you brief.`}
          </Text>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.centerLabel}>Looking around…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <Text style={styles.errorLabel}>{error}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => fetchPlaces(false)}
                  style={styles.retryBtn}
                >
                  <Text style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}>
                    Try again
                  </Text>
                </Pressable>
                {!widened ? (
                  <Pressable
                    onPress={() => fetchPlaces(true)}
                    style={styles.retryBtn}
                  >
                    <Text style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}>
                      🔍 Widen to 1.5km
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 360 }}>
              {places.map((p) => (
                <Pressable
                  key={p.placeId}
                  onPress={() => origin && onPick(p, origin)}
                  style={styles.row}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.meta}>
                      {[
                        prettyPlaceType(bestPlaceType(p.types)),
                        p.rating ? `⭐ ${p.rating.toFixed(1)}` : null,
                        p.openNow === false ? "closed" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {p.vicinity ? (
                      <Text style={styles.vicinity}>{p.vicinity}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.distance}>
                    {formatDistance(p.distanceM)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {!loading && !error && places.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 14, justifyContent: "center" }}>
              <Pressable onPress={() => fetchPlaces(false)} style={styles.refreshBtn}>
                <Text style={{ color: C.muted, fontSize: 11 }}>
                  ↻ Refresh
                </Text>
              </Pressable>
              {!widened ? (
                <Pressable onPress={() => fetchPlaces(true)} style={styles.refreshBtn}>
                  <Text style={{ color: C.muted, fontSize: 11 }}>
                    🔍 Widen to 1.5km
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.refreshBtn, { color: C.muted, fontSize: 11, paddingVertical: 10 }]}>
                  (1.5km radius)
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheetWrap: {
    backgroundColor: C.raised,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { color: C.text, fontSize: 16, fontWeight: "700" },
  subtitle: {
    color: C.muted,
    fontSize: 11,
    marginBottom: 10,
  },
  centerState: {
    paddingVertical: 30,
    alignItems: "center",
    gap: 10,
  },
  centerLabel: { color: C.muted, fontSize: 12 },
  errorLabel: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  name: { color: C.text, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  meta: { color: C.textDim, fontSize: 11, marginBottom: 1 },
  vicinity: { color: C.muted, fontSize: 10 },
  distance: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 12,
  },
  refreshBtn: {
    alignSelf: "center",
    paddingVertical: 10,
  },
});
