import "dotenv/config";
import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    name: "Eli Bridge",
    slug: "eli-bridge",
    // User-facing version string. Bump this manually when cutting a new
    // release (0.1.0-alpha.2, 0.1.0-alpha.3, etc.). The Android versionCode
    // is managed automatically by EAS because eas.json sets
    // `cli.appVersionSource = "remote"` — EAS increments it on every build.
    version: "0.1.0-alpha.1",
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
