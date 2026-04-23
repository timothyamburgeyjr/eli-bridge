import "dotenv/config";
import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    name: "Eli's Bridge",
    slug: "eli-bridge",
    // User-facing version string. Bump this manually when cutting a new
    // release (0.1.0-alpha.2, 0.1.0-alpha.3, etc.). The Android versionCode
    // is managed automatically by EAS because eas.json sets
    // `cli.appVersionSource = "remote"` — EAS increments it on every build.
    version: "0.1.0-alpha.1",
    // Launcher icon + iOS icon. Full-bleed sunset gradient with centered
    // infinity glyph. Used as-is for iOS and as the Android legacy icon.
    icon: "./assets/icon.png",
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
      // Adaptive icon: foreground is the infinity glyph on transparent bg,
      // Android composites it over the backgroundColor. The coral hex is
      // drawn from the mid-tone of the sunset gradient so the launcher
      // icon reads as continuous with the splash aesthetic.
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#D87359",
      },
    },
    ios: {
      bundleIdentifier: "dev.amburgey.elibridge",
      supportsTablet: false,
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      // Force hermesV1Enabled=false so RN 0.82 picks the real hermesc
      // at node_modules/react-native/sdks/hermesc instead of the empty
      // stub at node_modules/hermes-compiler. See plugin source for details.
      "./config-plugins/disable-hermes-v1.js",
      // Splash screen — full-bleed sunset gradient wallpaper with the
      // "Eli's Bridge · by Timothy Amburgey Jr." credits screen. Cover
      // resizeMode stretches the square PNG to fill any phone aspect
      // ratio (edges get cropped). Burgundy background shows in the
      // sub-second before the image paints.
      [
        "expo-splash-screen",
        {
          image: "./assets/splash.png",
          resizeMode: "cover",
          backgroundColor: "#8C2E2E",
        },
      ],
    ],
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
