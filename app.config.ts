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
    // OTA update channel — JS-only fixes get pushed via `eas update
    // --channel preview` and picked up by installed APKs on next launch.
    // runtimeVersion.policy "appVersion" keys compatibility to the user-
    // facing version string, so bumping version (e.g. alpha.2) means the
    // old alpha.1 APK stops receiving new JS updates until rebuilt.
    updates: {
      url: "https://u.expo.dev/dd4e5e3d-753a-482d-bf5a-d8ed9b83f217",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    orientation: "portrait",
    scheme: "elibridge",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    android: {
      package: "dev.amburgey.elibridge",
      predictiveBackGestureEnabled: false,
      edgeToEdgeEnabled: true,
      // JSC instead of Hermes — Hermes compiler on EAS Linux builds keeps
      // failing at `:app:createBundleReleaseJsAndAssets` with
      // "A problem occurred starting process '.../hermesc'" even with the
      // chmod post-install fix. Using JSC skips hermesc entirely. Cost:
      // slightly slower cold start (~100-200ms) and larger APK (~3MB),
      // which is fine for an alpha build.
      jsEngine: "jsc",
    },
    ios: {
      bundleIdentifier: "dev.amburgey.elibridge",
      supportsTablet: false,
    },
    plugins: ["expo-router", "expo-secure-store"],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "dd4e5e3d-753a-482d-bf5a-d8ed9b83f217",
      },
    },
    // Env vars are consumed via process.env.EXPO_PUBLIC_* in services/env.ts,
    // which Metro's babel transform inlines at bundle time. We do not rely on
    // `extra` for API keys because it's unreliable in dev builds with new-arch
    // — but the EAS projectId IS read from here.
  } as ExpoConfig);
