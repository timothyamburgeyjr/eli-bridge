// Env vars reach the app via Expo's `EXPO_PUBLIC_*` prefix convention — Metro's
// babel transform inlines `process.env.EXPO_PUBLIC_FOO` at bundle time, so this
// works in both dev-client and production builds without depending on
// `Constants.expoConfig.extra` (which is unreliable for custom extras in SDK 55).

type EnvKey =
  | "GEMINI_API_KEY"
  | "KINDROID_API_KEY"
  | "KINDROID_AI_ID"
  | "ELEVENLABS_API_KEY"
  | "ELEVENLABS_VOICE_ID"
  | "IMAGE_SERVER_URL"
  | "IMAGE_UPLOAD_KEY"
  | "GOOGLE_MAPS_API_KEY"
  | "OPENWEATHER_API_KEY"
  | "VAULT_URL"
  | "VAULT_TOKEN"
  | "FITBIT_CLIENT_ID"
  | "FITBIT_CLIENT_SECRET"
  | "FITBIT_USER_ID"
  | "PLEX_URL"
  | "PLEX_TOKEN";

const PLACEHOLDER_PATTERNS = [/^your-.*-here$/, /^FILL_ME/i, /^kn_your-/];

// Explicit switch so Metro's static inliner can resolve each EXPO_PUBLIC_* reference
// at bundle time. Dynamic property access (`process.env["EXPO_PUBLIC_" + k]`) is NOT
// inlined and would resolve to undefined on the device.
function rawValue(key: EnvKey): string | undefined {
  switch (key) {
    case "GEMINI_API_KEY":       return process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    case "KINDROID_API_KEY":     return process.env.EXPO_PUBLIC_KINDROID_API_KEY;
    case "KINDROID_AI_ID":       return process.env.EXPO_PUBLIC_KINDROID_AI_ID;
    case "ELEVENLABS_API_KEY":   return process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
    case "ELEVENLABS_VOICE_ID":  return process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID;
    case "IMAGE_SERVER_URL":     return process.env.EXPO_PUBLIC_IMAGE_SERVER_URL;
    case "IMAGE_UPLOAD_KEY":     return process.env.EXPO_PUBLIC_IMAGE_UPLOAD_KEY;
    case "GOOGLE_MAPS_API_KEY":  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    case "OPENWEATHER_API_KEY":  return process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
    case "VAULT_URL":            return process.env.EXPO_PUBLIC_VAULT_URL;
    case "VAULT_TOKEN":          return process.env.EXPO_PUBLIC_VAULT_TOKEN;
    case "FITBIT_CLIENT_ID":     return process.env.EXPO_PUBLIC_FITBIT_CLIENT_ID;
    case "FITBIT_CLIENT_SECRET": return process.env.EXPO_PUBLIC_FITBIT_CLIENT_SECRET;
    case "FITBIT_USER_ID":       return process.env.EXPO_PUBLIC_FITBIT_USER_ID;
    case "PLEX_URL":             return process.env.EXPO_PUBLIC_PLEX_URL;
    case "PLEX_TOKEN":           return process.env.EXPO_PUBLIC_PLEX_TOKEN;
  }
}

export function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

export function getEnv(key: EnvKey): string | undefined {
  const v = rawValue(key);
  return isPlaceholder(v) ? undefined : v;
}

export function requireEnv(key: EnvKey): string {
  const v = getEnv(key);
  if (!v) {
    const raw = rawValue(key);
    const diag =
      raw === undefined
        ? `not inlined — ensure .env has EXPO_PUBLIC_${key}=... and restart Metro with --clear.`
        : `matches placeholder pattern (starts with "${raw.slice(0, 4)}...", len ${raw.length}).`;
    throw new Error(`${key} is missing — ${diag}`);
  }
  return v;
}
