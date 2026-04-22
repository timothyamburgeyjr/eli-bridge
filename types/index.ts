/**
 * Project Eli Bridge — TypeScript Data Models
 * Drop this file into src/types/index.ts
 *
 * All interfaces match the v7.3 spec and Gemini system prompt.
 */

// ════════════════════════════════════════════════════════════════
// PEOPLE SYSTEM
// ════════════════════════════════════════════════════════════════

export interface PersonCard {
  id: string;
  name: string;
  relationship?: string; // "Dad", "Best friend", "Coworker", etc.
  voiceEmbedding?: Float32Array; // 256-dim ECAPA-TDNN vector (~1KB)
  faceEmbedding?: Float32Array; // 128-dim MobileFaceNet vector (~512 bytes)
  voiceSamples: number; // 0-3; embedding committed at 3
  pendingVoiceSamples?: Float32Array[]; // queued before commitment
  firstSeen: string; // ISO 8601
  lastSeen: string; // ISO 8601
}

export interface VoiceIdResult {
  person: PersonCard | null;
  confidence: number; // cosine similarity 0-1
  isNew: boolean;
  sampleNumber?: number; // 1, 2, or 3 for multi-sample enrollment
}

export interface FaceMatch {
  person: PersonCard | null;
  confidence: number; // cosine similarity 0-1
  bbox: BoundingBox;
  isNew: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ════════════════════════════════════════════════════════════════
// MESSAGES
// ════════════════════════════════════════════════════════════════

export type MessageFrom =
  | "tim"
  | "eli"
  | "departure"
  | "waypoint"
  | "modetransition"
  | "location"
  | "nowplaying"
  | "trivia"
  | "weather"
  | "calendar"
  | "interrupt"
  | "unknownperson"
  | "venuemode"
  | "ride"
  | "sessionjournal"
  | "audiosnap";

export interface BaseMessage {
  id: string;
  from: MessageFrom;
  time: string; // display time "11:08 AM"
  timestamp: number; // unix ms for ordering
}

// ── Chat Messages ────────────────────────────────────────────

export interface TimMessage extends BaseMessage {
  from: "tim";
  emote: string; // Gemini-assembled emote text (without _(*...*) wrapper)
  dialog: string; // Tim's spoken/typed words (verbatim, never rewritten)
  pills?: ContextPill[];
  isDrive?: boolean; // true when sent during driving (safety mode context)
  attachments?: Attachment[];
}

export interface EliMessage extends BaseMessage {
  from: "eli";
  emote?: string; // parsed from _(*...*) in Kindroid response
  dialog: string; // everything outside the emote wrapper
  audioUrl?: string; // local path to ElevenLabs TTS audio file
}

export interface ContextPill {
  icon: string; // emoji
  label: string;
}

export interface Attachment {
  type: "image" | "video" | "audio" | "file";
  localPath: string;
  mimeType: string;
  publicUrl?: string; // populated after upload to self-hosted image server
  duration?: number; // seconds, for audio/video
}

// ── AudioSnap ────────────────────────────────────────────────

export interface AudioSnapMessage extends BaseMessage {
  from: "audiosnap";
  description: string; // Gemini's ambient audio description
  audioPath: string; // local .m4a path
  pairedImageId?: string; // linked photo message ID
}

// ── Context Cards ────────────────────────────────────────────

export interface DepartureCard extends BaseMessage {
  from: "departure";
  from_location: string;
  destination_set?: string; // null for open-ended walks
  detectedMode: TransportMode;
  briefed: boolean;
}

export interface WaypointCard extends BaseMessage {
  from: "waypoint";
  icon: string;
  name: string;
  category: string;
  location: string;
  duration?: string; // populated after visit
  openSession?: boolean; // true = no fixed destination (browsing)
  initialState: "pending" | "active" | "visited";
}

export interface ModeTransitionCard extends BaseMessage {
  from: "modetransition";
  fromMode: TransportMode;
  toMode: TransportMode;
  note?: string; // "Boarding Red Line at Metro Center"
}

export interface LocationCard extends BaseMessage {
  from: "location";
  name: string;
  type: string; // Google Places type
  rating?: number;
  hours?: string;
  address?: string;
  menuHighlights?: string[];
  photoUrl?: string;
  arrivalBrief?: string; // Gemini-generated narrative
}

export interface NowPlayingCard extends BaseMessage {
  from: "nowplaying";
  track: string;
  artist: string;
  autoShared: boolean;
  emotePreview: string; // the exact emote line that would be added
  staged?: boolean; // true after user taps "Add to emote"
}

export interface TriviaCard extends BaseMessage {
  from: "trivia";
  icon: string;
  fact: string;
  source?: string;
}

export interface WeatherCard extends BaseMessage {
  from: "weather";
  temperature: number; // Fahrenheit
  conditions: string;
  alert?: string; // severe weather alert text
  barometerDelta?: number; // hPa change in last 30 min
}

export interface CalendarCard extends BaseMessage {
  from: "calendar";
  eventName: string;
  eventTime: string;
  timeUntil: string; // "in 45 min"
  location?: string;
}

export interface InterruptCard extends BaseMessage {
  from: "interrupt";
  level: "info" | "warning" | "urgent";
  title: string;
  body: string;
}

export interface UnknownPersonCard extends BaseMessage {
  from: "unknownperson";
  variant: "voice" | "face";
  // Voice variant fields
  quote?: string; // detected speech
  // Face variant fields
  faceNote?: string; // "Person in your photo at Dark Star Comics"
  confidence?: string; // "0.91"
  faceBbox?: BoundingBox;
  // Cross-modal linking
  suggestion?: string; // "Hank" — existing person name that might match
}

export interface VenueModeCard extends BaseMessage {
  from: "venuemode";
  venueName: string;
  venueType: string; // Places API type
  note: string;
}

export interface RideCard extends BaseMessage {
  from: "ride";
  rideName: string;
  rideType?: string; // "Wooden", "Giga", "Inverted", "Gyro Drop"
  duration?: string;
  peakG?: number;
  topSpeed?: string;
}

export interface SessionJournalCard extends BaseMessage {
  from: "sessionjournal";
  title: string;
  date: string;
  duration: string;
  locations: string[];
  soundtrack?: string[];
  previewQuote: string;
  fullText: string; // Gemini-drafted journal in Tim's voice
}

export type AnyMessage =
  | TimMessage
  | EliMessage
  | AudioSnapMessage
  | DepartureCard
  | WaypointCard
  | ModeTransitionCard
  | LocationCard
  | NowPlayingCard
  | TriviaCard
  | WeatherCard
  | CalendarCard
  | InterruptCard
  | UnknownPersonCard
  | VenueModeCard
  | RideCard
  | SessionJournalCard;

// ════════════════════════════════════════════════════════════════
// TRANSPORT MODES
// ════════════════════════════════════════════════════════════════

export type TransportMode =
  | "car"
  | "walking"
  | "bicycle"
  | "bus"
  | "train"
  | "subway"
  | "running"
  | "still";

// ════════════════════════════════════════════════════════════════
// SESSION STATE
// ════════════════════════════════════════════════════════════════

export interface SessionState {
  id: string;
  status: "idle" | "active" | "ending";
  mode: "session" | "quicksend";
  startTime?: number; // unix ms
  messages: AnyMessage[];
  currentLocation?: LocationData;
  currentTransport?: TransportMode;
  venueMode?: {
    active: boolean;
    venueName: string;
    venueType: string;
  };
  pulseMode: boolean;
  safetyMode: boolean;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  accuracy: number;
  timestamp: number;
  placeName?: string;
  placeType?: string;
}

// ════════════════════════════════════════════════════════════════
// SETTINGS STATE
// ════════════════════════════════════════════════════════════════

export interface SettingsState {
  // Context Services
  locationEnabled: boolean;
  weatherEnabled: boolean;
  fitbitEnabled: boolean;
  ambientAudioEnabled: boolean;
  calendarEnabled: boolean;
  nowPlayingEnabled: boolean;

  // Voice & Audio
  elevenLabsAutoplay: boolean;
  voiceVerification: boolean; // require Tim's voice to send

  // Session Behavior
  pulseMode: boolean;
  safetyModeAuto: boolean; // auto-activate when driving

  // People
  // (People roster is in PeopleStore, not here)
}

// ════════════════════════════════════════════════════════════════
// FRESHNESS LEDGER
// ════════════════════════════════════════════════════════════════

export interface LedgerEntry {
  messageId: string;
  timestamp: string; // ISO 8601
  contextSent: {
    location?: string;
    weather?: string;
    companions?: string[];
    songsMentioned?: string[];
    lastHr?: number;
    uvIndex?: number;
    elevation?: number;
    activity?: TransportMode;
    [key: string]: unknown; // extensible
  };
}

// ════════════════════════════════════════════════════════════════
// GEMINI API TYPES
// ════════════════════════════════════════════════════════════════

export interface GeminiEmoteRequest {
  sensorData: SensorSnapshot;
  timDialog: string;
  chatHistory: GeminiHistoryEntry[];
  attachments?: {
    image?: string; // base64
    audio?: string; // base64
    video?: string; // base64
  };
}

export interface SensorSnapshot {
  location?: LocationData;
  weather?: {
    temp: number;
    conditions: string;
    humidity: number;
    windSpeed: number;
    uvIndex?: number;
    alerts?: string[];
  };
  health?: {
    heartRate?: number;
    steps?: number;
    hrv?: number;
    sleepQuality?: string;
  };
  barometer?: {
    pressure: number; // hPa
    delta30min: number; // change in last 30 minutes
  };
  activity?: TransportMode;
  companions?: string[]; // identified people present
  nowPlaying?: {
    track: string;
    artist: string;
  };
  calendar?: {
    nextEvent?: string;
    timeUntil?: string;
  };
  ambientAudio?: string; // Gemini's description of AudioSnap
  speakerLabels?: SpeakerLabel[]; // from People system voice ID
  faceLabels?: FaceLabel[]; // from People system face ID
}

export interface SpeakerLabel {
  speaker: string; // "Hank" or "Unknown #1"
  quote: string;
  confidence: number;
}

export interface FaceLabel {
  person: string; // "Hank" or "Unknown #1"
  confidence: number;
}

export interface GeminiHistoryEntry {
  role: "user" | "model";
  parts: Array<{
    text?: string;
    inline_data?: {
      mime_type: string;
      data: string; // base64
    };
  }>;
}

// ════════════════════════════════════════════════════════════════
// KINDROID API TYPES
// ════════════════════════════════════════════════════════════════

export interface KindroidSendRequest {
  ai_id: string;
  message: string; // _(*emote*) dialog — max 4000 chars
  stream: false;
  image_urls?: string[]; // Public URLs — uploaded to the self-hosted image server
  image_description?: string;
  link_url?: string;
  link_description?: string;
  video_url?: string;
  video_description?: string;
}

export interface KindroidJournalRequest {
  ai_id: string;
  entry: string; // 20-500 chars
  keyphrases: string[]; // at least 1, each at least 3 chars
}

export interface KindroidUpdateRequest {
  ai_id: string;
  current_scene?: string; // max 160 chars
  ai_backstory?: string; // max 2500 chars
  ai_directive?: string; // max 250 chars
  ai_memory?: string; // max 1000 chars
  ai_example_message?: string; // max 750 chars
  ai_additional_context?: string; // max 5000 chars
}

// ════════════════════════════════════════════════════════════════
// ELEVENLABS TYPES
// ════════════════════════════════════════════════════════════════

export interface ElevenLabsTTSRequest {
  text: string;
  model_id: "eleven_flash_v2_5";
  voice_settings?: {
    stability?: number; // 0-1
    similarity_boost?: number; // 0-1
    style?: number; // 0-1
    use_speaker_boost?: boolean;
  };
}

// ════════════════════════════════════════════════════════════════
// CONNECTION STATE
// ════════════════════════════════════════════════════════════════

export interface ConnectionState {
  network: "online" | "offline";
  gemini: "connected" | "degraded" | "unreachable";
  kindroid: "connected" | "degraded" | "unreachable";
  elevenlabs: "connected" | "unavailable";
  overallStatus: "green" | "amber" | "red";
  queuedMessages: number;
}

// ════════════════════════════════════════════════════════════════
// OBSIDIAN VAULT API
// ════════════════════════════════════════════════════════════════

export interface VaultWriteRequest {
  path: string; // e.g. "08 - Elias Reed/Archives/2026-04-21-yellow-springs.md"
  content: string; // markdown
}

export interface VaultSearchRequest {
  query: string;
}

export interface VaultSearchResult {
  filename: string;
  score: number;
  matches: Array<{
    match: { start: number; end: number };
    context: string;
  }>;
}

// ════════════════════════════════════════════════════════════════
// SELF-HOSTED IMAGE SERVER
// ════════════════════════════════════════════════════════════════

export interface ImageUploadResponse {
  /** Server-returned path, e.g. "/images/{sessionId}/{filename}" */
  url: string;
}
