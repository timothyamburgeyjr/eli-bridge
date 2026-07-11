import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";

export type SettingsToggleKey =
  | "locationEnabled"
  | "weatherEnabled"
  | "fitbitEnabled"
  | "ambientAudioEnabled"
  | "calendarEnabled"
  | "nowPlayingEnabled"
  | "voiceVerification"
  | "moodEnabled"
  | "moodTintsEmotes";

export interface SettingsState {
  locationEnabled: boolean;
  weatherEnabled: boolean;
  fitbitEnabled: boolean;
  ambientAudioEnabled: boolean;
  calendarEnabled: boolean;
  nowPlayingEnabled: boolean;

  voiceVerification: boolean;

  /** Moment Mood: the pulsing border + badge. */
  moodEnabled: boolean;
  /** Let the mood color emote text as well as the chrome. */
  moodTintsEmotes: boolean;

  toggle: (key: SettingsToggleKey) => void;
  set: <K extends SettingsToggleKey>(key: K, value: boolean) => void;
}

const secureStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch {
      // best-effort
    }
  },
  removeItem: async (name) => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      // best-effort
    }
  },
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locationEnabled: true,
      weatherEnabled: true,
      fitbitEnabled: true,
      ambientAudioEnabled: true,
      calendarEnabled: true,
      nowPlayingEnabled: true,

      voiceVerification: true,

      moodEnabled: true,
      moodTintsEmotes: true,

      toggle: (key) => set((s) => ({ [key]: !s[key] } as Partial<SettingsState>)),
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: "elibridge.settings.v1",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s): Omit<SettingsState, "toggle" | "set"> => ({
        locationEnabled: s.locationEnabled,
        weatherEnabled: s.weatherEnabled,
        fitbitEnabled: s.fitbitEnabled,
        ambientAudioEnabled: s.ambientAudioEnabled,
        calendarEnabled: s.calendarEnabled,
        nowPlayingEnabled: s.nowPlayingEnabled,
        voiceVerification: s.voiceVerification,
        moodEnabled: s.moodEnabled,
        moodTintsEmotes: s.moodTintsEmotes,
      }),
    }
  )
);
