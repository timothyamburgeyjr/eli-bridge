import "dotenv/config";
import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    name: "Eli Bridge",
    slug: "eli-bridge",
    version: "0.1.0",
    orientation: "portrait",
    scheme: "elibridge",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    android: {
      package: "dev.amburgey.elibridge",
      predictiveBackGestureEnabled: false,
      edgeToEdgeEnabled: true,
    },
    ios: {
      bundleIdentifier: "dev.amburgey.elibridge",
      supportsTablet: false,
    },
    plugins: ["expo-router", "expo-secure-store"],
    experiments: {
      typedRoutes: true,
    },
    // Env vars are consumed via process.env.EXPO_PUBLIC_* in services/env.ts,
    // which Metro's babel transform inlines at bundle time. We do not rely on
    // `extra` for API keys because it's unreliable in dev builds with new-arch.
  } as ExpoConfig);
