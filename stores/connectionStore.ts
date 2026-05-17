import { create } from "zustand";
import * as Network from "expo-network";
import { AppState, AppStateStatus } from "react-native";

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

/**
 * Real reachability probe. expo-network's `isInternetReachable` flag gives
 * false negatives on Android — Tim saw "Disconnected" while Eli was
 * actively responding. Instead of trusting that flag, we hit a tiny
 * known-good endpoint (Google's generate_204 — 0-byte 204 response,
 * purpose-built for connectivity checks, extremely available) and treat
 * a successful response as ground truth that the network works.
 *
 * 8s timeout — generous for a degraded cellular link but short enough that
 * a genuine outage resolves to "offline" reasonably fast.
 */
async function probeReachability(): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch("https://www.gstatic.com/generate_204", {
      method: "GET",
      signal: ctl.signal,
      cache: "no-store",
    });
    // 204 is the expected response; accept any 2xx as "the network works".
    return res.status === 204 || res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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
      const previous = get().state;

      // Radio genuinely off → trust it, skip the probe (no point).
      // Radio on → the OS thinks there's a link, but isInternetReachable
      // is unreliable, so confirm with an actual reachability probe.
      let next: ReachabilityState;
      let reachable: boolean;
      if (!isConnected) {
        next = "offline";
        reachable = false;
      } else {
        reachable = await probeReachability();
        next = reachable ? "online" : "offline";
      }

      set({
        state: next,
        isConnected,
        isInternetReachable: reachable,
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
        // The OS event tells us the radio state changed. Trust an
        // "off" reading immediately; for "on", run the full refresh()
        // which probes actual reachability rather than trusting the
        // unreliable isInternetReachable flag.
        if (!s.isConnected) {
          set({
            state: "offline",
            isConnected: false,
            isInternetReachable: false,
            lastCheckedAt: Date.now(),
          });
        } else {
          get().refresh();
        }
      });
    }

    // Foreground-return refresh. Android sometimes suspends delivery of
    // network state events when the app is deep-backgrounded (screen off
    // for a while). If wifi drops → comes back while backgrounded, the
    // app resumes with stale "offline" state and no trigger to re-check.
    // This listener does a definitive getNetworkStateAsync probe every
    // time the user returns to the foreground.
    AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        get().refresh();
      }
    });
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
