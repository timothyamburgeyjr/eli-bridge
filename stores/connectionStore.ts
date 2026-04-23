import { create } from "zustand";
import * as Network from "expo-network";

export type ReachabilityState = "online" | "offline" | "unknown";

interface ConnectionState {
  /** Coarse online/offline state. "unknown" before the first probe. */
  state: ReachabilityState;
  /** True if the device has ANY network connection (wifi, cell, etc.) — even a dodgy one. */
  isConnected: boolean;
  /** True if internet is reachable (may be false on captive portals / offline wifi). */
  isInternetReachable: boolean;
  /** Timestamp of the last state update (ms epoch). */
  lastCheckedAt: number | null;

  /** Callers can subscribe to "came back online" transitions — used by the queue drainer. */
  onReconnect: (handler: () => void) => () => void;

  /**
   * One-shot refresh of the current state. Rarely needed — the listener
   * keeps state current automatically.
   */
  refresh: () => Promise<void>;

  /**
   * Install the native-state listener. Called once at app boot from the
   * layout root. Idempotent.
   */
  install: () => void;
}

let installed = false;
let subscription: { remove(): void } | null = null;
const reconnectHandlers = new Set<() => void>();

function deriveState(
  isConnected: boolean,
  isInternetReachable: boolean | undefined | null
): ReachabilityState {
  if (!isConnected) return "offline";
  // expo-network sometimes reports isInternetReachable as undefined on
  // Android — treat unknown as online so we don't false-alarm with amber.
  if (isInternetReachable === false) return "offline";
  return "online";
}

export const useConnection = create<ConnectionState>((set, get) => ({
  state: "unknown",
  isConnected: true,
  isInternetReachable: true,
  lastCheckedAt: null,

  onReconnect: (handler) => {
    reconnectHandlers.add(handler);
    return () => {
      reconnectHandlers.delete(handler);
    };
  },

  refresh: async () => {
    try {
      const s = await Network.getNetworkStateAsync();
      const isConnected = !!s.isConnected;
      const isReach = s.isInternetReachable ?? true;
      const previous = get().state;
      const next = deriveState(isConnected, isReach);
      set({
        state: next,
        isConnected,
        isInternetReachable: isReach,
        lastCheckedAt: Date.now(),
      });
      if (previous === "offline" && next === "online") {
        fireReconnect();
      }
    } catch {
      // best-effort
    }
  },

  install: () => {
    if (installed) return;
    installed = true;

    // Prime state with a one-shot probe.
    get().refresh();

    // Subscribe to reactive changes. Different Expo versions expose
    // the listener under slightly different names; probe for both.
    const api: any = Network as unknown as {
      addNetworkStateListener?: (
        listener: (s: Network.NetworkState) => void
      ) => { remove(): void };
    };
    if (typeof api.addNetworkStateListener === "function") {
      subscription = api.addNetworkStateListener((s: Network.NetworkState) => {
        const isConnected = !!s.isConnected;
        const isReach = s.isInternetReachable ?? true;
        const previous = get().state;
        const next = deriveState(isConnected, isReach);
        set({
          state: next,
          isConnected,
          isInternetReachable: isReach,
          lastCheckedAt: Date.now(),
        });
        if (previous === "offline" && next === "online") {
          fireReconnect();
        }
      });
    }
  },
}));

function fireReconnect() {
  for (const handler of reconnectHandlers) {
    try {
      handler();
    } catch (err) {
      console.warn("[connection] reconnect handler threw:", err);
    }
  }
}

/** Convenience selector — are we currently offline? */
export function isOffline(): boolean {
  return useConnection.getState().state === "offline";
}
