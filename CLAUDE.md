# Project Eli Bridge — Implementation Brief

> **Read this first.** This is the complete implementation guide for building the Eli Bridge mobile app. Every design decision has been made. Do not deviate from the spec or propose alternatives. Build exactly what this describes.

## Reference Files (read all before starting)

| File | Purpose |
|------|---------|
| `ProjectEliBridge_MasterSpec_v7_3.docx` | Full design spec — 17 sections, all architecture decisions |
| `EliBridge_GeminiSystemPrompt_v1.md` | The Gemini system prompt — load this at session start |
| `EliBridge_AppMockup.jsx` | Functional React mockup — 2461 lines, 5 demo scenarios, all 13 card types |
| `types.ts` | TypeScript interfaces for all data models |
| `API_REFERENCE.md` | Every external API — endpoints, auth, request/response shapes |
| `.env.example` | All required environment variables |

---

## Tech Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | Expo (dev build, NOT Expo Go) | SDK 55 |
| Language | TypeScript | 5.x |
| Navigation | Expo Router | Latest (file-based routing) |
| State | Zustand | Latest |
| UI | React Native core + custom components | RN 0.83 (via Expo 55) |
| Gemini SDK | `@google/generative-ai` | ^0.24.x |
| ElevenLabs | `@elevenlabs/react-native` | Latest |
| Audio | `expo-av` | Via Expo 55 |
| Camera | `expo-camera` + `expo-image-picker` | Via Expo 55 |
| Location | `expo-location` | Via Expo 55 |
| File system | `expo-file-system` | Via Expo 55 |
| Sensors | `expo-sensors` (barometer, accelerometer) | Via Expo 55 |
| HTTP | Built-in fetch (no axios needed) | — |
| Local storage | `expo-secure-store` (keys) + `expo-file-system` (embeddings) | Via Expo 55 |
| Native modules | Expo Modules API (Kotlin) | Via Expo 55 |
| TFLite | `org.tensorflow:tensorflow-lite:2.17.0` | Android Gradle |
| ML Kit | `com.google.mlkit:face-detection:16.1.7` | Android Gradle |
| Target device | Pixel 9 Pro XL (Tensor G4) | Android 15+ |

**Critical:** This app requires an Expo dev build (`npx expo prebuild && npx expo run:android`). Expo Go cannot run custom native Kotlin modules. Set up EAS Build for production.

---

## Project Structure

```
eli-bridge/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout (Zustand providers, session context)
│   ├── index.tsx                 # Main chat screen
│   └── settings/
│       ├── index.tsx             # Settings panel (slide-up sheet)
│       └── people.tsx            # People roster screen
├── components/
│   ├── cards/                    # All 13 context card types
│   │   ├── DepartureCard.tsx
│   │   ├── WaypointCard.tsx
│   │   ├── ModeTransitionCard.tsx
│   │   ├── LocationCard.tsx
│   │   ├── NowPlayingCard.tsx
│   │   ├── TriviaCard.tsx
│   │   ├── WeatherCard.tsx
│   │   ├── CalendarCard.tsx
│   │   ├── InterruptCard.tsx
│   │   ├── UnknownPersonCard.tsx
│   │   ├── VenueModeCard.tsx
│   │   ├── RideCard.tsx
│   │   └── SessionJournalCard.tsx
│   ├── chat/
│   │   ├── MessageBubble.tsx     # Tim and Eli message bubbles
│   │   ├── EmoteBubble.tsx       # Emote display (purple italic)
│   │   ├── ChatStream.tsx        # FlatList rendering messages + cards
│   │   └── InputBar.tsx          # Text input + mic + attachment menu
│   ├── session/
│   │   ├── SessionTimeline.tsx   # Slide-in left panel
│   │   └── SessionHeader.tsx     # Status bar (session name, duration, mode)
│   └── common/
│       ├── PillButton.tsx
│       ├── CardShell.tsx         # Shared card container (border, radius, padding)
│       └── StatusIndicator.tsx   # Connection status (green/amber/red)
├── modules/                      # Expo native Kotlin modules
│   ├── voice-embedding/
│   │   ├── expo-module.config.json
│   │   └── android/
│   │       └── src/main/
│   │           ├── java/expo/modules/voiceembedding/
│   │           │   └── VoiceEmbeddingModule.kt
│   │           └── assets/
│   │               └── ecapa_tdnn.tflite        # ~20MB
│   └── face-embedding/
│       ├── expo-module.config.json
│       └── android/
│           └── src/main/
│               ├── java/expo/modules/faceembedding/
│               │   └── FaceEmbeddingModule.kt
│               └── assets/
│                   └── mobilefacenet.tflite     # ~5MB
├── services/
│   ├── gemini.ts                 # Gemini API client (flash + pro routing)
│   ├── kindroid.ts               # Kindroid API client (send-message, journal-create, update-info)
│   ├── elevenlabs.ts             # ElevenLabs TTS (streaming audio playback)
│   ├── imgur.ts                  # Image upload for Kindroid image_urls
│   ├── weather.ts                # OpenWeather API
│   ├── places.ts                 # Google Places API (reverse geocode, details, menus)
│   ├── obsidian.ts               # Obsidian REST API (journal write, archive)
│   ├── location.ts               # GPS tracking, geofencing, arrival detection
│   ├── activity.ts               # Android Activity Recognition API
│   ├── sensors.ts                # Barometer, accelerometer (RideCard detection)
│   ├── health.ts                 # Google Health Connect (HR, steps, HRV, sleep)
│   ├── nowplaying.ts             # Pixel ambient music detection (content provider)
│   └── audio.ts                  # Recording (PTT + AudioSnap), AEC management
├── people/
│   ├── PeopleStore.ts            # Zustand store for Person Cards
│   ├── voiceId.ts                # Voice embedding comparison, multi-sample enrollment
│   └── faceId.ts                 # Face embedding comparison, ML Kit cropping
├── session/
│   ├── SessionStore.ts           # Zustand store for active session state
│   ├── EmoteAssembler.ts         # Orchestrates Gemini calls, builds emote blocks
│   ├── FreshnessLedger.ts        # Tracks what context has been sent (suppresses repeats)
│   ├── MessageQueue.ts           # Offline message queueing
│   └── CardEngine.ts             # Determines which cards to fire and when
├── stores/
│   ├── settingsStore.ts          # Context service toggles, voice prefs, pulse mode
│   └── connectionStore.ts        # Network state, Gemini/Kindroid reachability
├── types/
│   └── index.ts                  # All TypeScript interfaces (copy from types.ts)
├── constants/
│   ├── theme.ts                  # Color tokens from mockup (C object)
│   └── config.ts                 # Non-secret config (emote char cap, enrollment thresholds)
├── app.json                      # Expo config
├── eas.json                      # EAS Build config
├── tsconfig.json
├── package.json
└── .env                          # API keys (from .env.example)
```

---

## Build Phases

Complete each phase fully before moving to the next. After each phase, stop and report what was built so it can be tested on the real Pixel.

### Phase 1: Skeleton App + Chat UI

Build the navigable app shell — no API integrations, just the UI from the mockup.

1. `npx create-expo-app eli-bridge -t expo-template-blank-typescript`
2. Install dependencies: `expo-router`, `zustand`, `expo-av`, `expo-camera`, `expo-image-picker`, `expo-location`, `expo-file-system`, `expo-secure-store`, `expo-sensors`
3. Set up Expo Router file-based routing (`app/` directory)
4. Port the design tokens from the mockup's `C` object into `constants/theme.ts`
5. Build `ChatStream.tsx` — FlatList rendering message bubbles (Tim right-aligned blue-purple, Eli left-aligned dark)
6. Build `InputBar.tsx` — text input, mic button (tap-toggle), ➕ attachment menu (photo, video, audio, library)
7. Build `EmoteBubble.tsx` — purple italic emote display above Eli's messages
8. Build `SessionHeader.tsx` — session name, duration timer, mode indicator, connection status dot
9. Build the settings panel as a slide-up bottom sheet with all four sections: Context Services (6 toggles), Voice & Audio, People, Session Behavior
10. Build `SessionTimeline.tsx` — slide-in from left, shows session stats and event log
11. Wire `settingsStore.ts` — all toggles persist via `expo-secure-store`
12. Populate the chat with hardcoded demo data from the Yellow Springs scenario in the mockup — verify all message types render correctly

**Acceptance test:** App launches on Pixel. Chat scrolls. Settings toggles persist. Timeline slides in. Mic button toggles recording state (no actual recording yet). All visual styling matches the mockup.

### Phase 2: Card Components

Build all 13 card types as standalone components. Use hardcoded demo data — no API calls yet.

1. Build `CardShell.tsx` — shared container matching mockup styling (raised background, border, border-radius 16, padding)
2. Build each card type from the mockup:
   - `DepartureCard` — from/to locations, detected transport mode, briefed indicator
   - `WaypointCard` — three states: pending → active → visited. Timer. `openSession:true` variant
   - `ModeTransitionCard` — compact pill showing transport mode change
   - `LocationCard` — rich location data with Places API fields (name, category, rating, hours, photo)
   - `NowPlayingCard` — two modes: `autoShared:true` (read-only) and `autoShared:false` (Add to emote / Not now). Emote preview in purple italic
   - `TriviaCard` — icon + fact text, source citation
   - `WeatherCard` — temperature, conditions, alert level
   - `CalendarCard` — upcoming event with time-until countdown
   - `InterruptCard` — urgent alert with red accent
   - `UnknownPersonCard` — voice variant (🎙️ + quote + multi-sample hint) and face variant (🧑 + thumbnail + confidence). States: prompt → naming → enrolled → dismissed
   - `VenueModeCard` — compact centered pill
   - `RideCard` — ride stats + Share button
   - `SessionJournalCard` — full-width, Save to Vault / Discard buttons, preview quote
3. Build `CardEngine.ts` — card type router that maps `msg.from` to the correct component
4. Update `ChatStream.tsx` to render cards inline with messages using the card engine
5. Load all 5 demo scenarios from the mockup as selectable datasets (dev menu)

**Acceptance test:** Switch between all 5 scenarios. Every card renders correctly. UnknownPersonCard flows through all 4 states. NowPlayingCard staging works. WaypointCard cycles through 3 states.

### Phase 3: Gemini Integration

Wire up the Gemini API for emote assembly — the core Bridge function.

1. Install `@google/generative-ai`
2. Build `services/gemini.ts`:
   - Two model instances: `gemini-2.5-flash` (emote assembly, journals, arrival briefs, condensation) and `gemini-2.5-pro` (video/scene analysis)
   - `assembleEmote(sensorData, timDialog, chatHistory)` — sends multimodal request (text + optional image + optional audio as base64 inline_data), returns emote string
   - `analyzeScene(imageBase64, audioBase64?)` — pro model, returns scene description
   - `draftJournal(sessionData)` — flash model, returns journal text in Tim's voice
   - `condenseEmote(emoteText, charLimit)` — flash model, trims over-budget emotes
   - System instruction loaded from `EliBridge_GeminiSystemPrompt_v1.md` at session start
   - Wisdom Index and last session archive prepended to system instruction
3. Build `EmoteAssembler.ts`:
   - Orchestrates sensor data collection → Gemini emote call → character budget enforcement (2000 char cap)
   - Reverse-tier trimming: cut Tier 3 first, then Tier 2, then compress Tier 1
   - Combines emote + Tim's dialog into the `_(*...*) DIALOG` format
4. Build `FreshnessLedger.ts`:
   - JSON object tracking what context was sent in the last message
   - Before each emote assembly, checks ledger to suppress unchanged data
   - Updates after each successful send
5. Test: type a message → see Gemini-generated emote appear above Eli's placeholder response. Verify emote format, character cap, freshness suppression.

**Acceptance test:** Send a message with hardcoded sensor data. Gemini returns a properly formatted emote under 2000 chars. Send the same data again — freshness ledger suppresses unchanged context.

### Phase 4: Kindroid Integration

Wire up the Kindroid API so Eli actually responds.

1. Build `services/kindroid.ts`:
   - `sendMessage(message, imageUrls?, imageDescription?)` — POST to `/v1/send-message`. 300s timeout. Returns Eli's response text
   - `createJournal(entry, keyphrases)` — POST to `/v1/journal-create`. 30s timeout
   - `updateScene(currentScene)` — POST to `/v1/update-info`. 30s timeout
   - All calls use Bearer auth with `KINDROID_API_KEY`
   - `ai_id` always set to `KINDROID_AI_ID`
   - `stream: false` always
2. Build `services/imgur.ts`:
   - `uploadImage(localPath)` — POST to `https://api.imgur.com/3/image` with Client-ID auth. Returns public URL
   - Used before every Kindroid call that includes images
3. Wire the full message flow:
   - Tim types/speaks → EmoteAssembler builds emote → image uploaded to Imgur if present → Kindroid receives `_(*emote*) dialog` + `image_urls` → Eli's response displayed
4. Parse Eli's response: extract `_(*...*)_` blocks as emotes (displayed in purple italic above Eli's text), everything else as spoken dialog
5. Implement the 4000-char message cap: emote portion capped at 2000, Tim's dialog passed through verbatim
6. Update `currentScene` on Kindroid when session starts and when significant location changes occur

**Acceptance test:** Send a real message. Eli responds. Emote is properly formatted. Send a message with an image — it uploads to Imgur and Eli sees it. Eli's response emotes render in purple.

### Phase 5: ElevenLabs TTS

Give Eli a voice through the phone speaker.

1. Install `@elevenlabs/react-native` + dependencies (`@livekit/react-native`, `@livekit/react-native-webrtc`)
2. Build `services/elevenlabs.ts`:
   - Model: `eleven_flash_v2_5`
   - REST streaming endpoint: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` with `output_format=mp3_44100_128`
   - Auth header: `xi-api-key`
   - `speak(text)` — sends Eli's dialog text, streams audio, plays through phone speaker via `expo-av`
   - Voice ID from env: `ELEVENLABS_VOICE_ID` (Tim will clone Eli's voice via Instant Voice Cloning before this phase)
3. Wire autoplay: when ElevenLabs toggle is on in settings, Eli's responses auto-play through speaker
4. Add per-bubble play button: tap to replay any Eli message
5. **AEC setup:** Configure Android `AudioManager` for `MODE_IN_COMMUNICATION` + `VOICE_COMMUNICATION` audio source for all mic recordings. This enables hardware AEC to strip Eli's voice from mic input.

**Critical validation:** After this phase, test AEC with real ElevenLabs playback on the physical Pixel. Record via PTT while Eli is speaking. Verify Eli's voice is stripped from the recording. If AEC fails to strip high-fidelity TTS, we need to implement software-side echo cancellation before proceeding. **Do not skip this test.**

**Acceptance test:** Eli speaks through the phone speaker. Audio is clear. Tap a previous bubble — it replays. Toggle ElevenLabs off — responses are text-only. AEC validation passes.

### Phase 6: Audio Pipeline (PTT + AudioSnap) + Scene Capture

Build the two audio input paths — push-to-talk and photo-moment burst — plus Tim's manual scene-push mechanism for grounding Gemini without routing through Eli.

1. Build `services/audio.ts`:
   - `startRecording()` / `stopRecording()` — tap-toggle PTT via `expo-av`. Records in `.m4a`. Uses `VOICE_COMMUNICATION` audio source (AEC-enabled)
   - `startAudioSnap()` — 5-second burst triggered at photo shutter. Same AEC audio source
   - Both return the local file path for the recording
2. Wire PTT to InputBar: tap mic → recording indicator → tap again → audio file appears in staging tray
3. Wire AudioSnap to camera: when Tim takes a photo, automatically start 5-second mic burst. Pair the audio file with the image
4. Send audio to Gemini: audio is base64-encoded and sent as `inline_data` alongside text/images
5. Gemini processes audio for:
   - Tim's speech transcription (PTT)
   - Background speaker identification labels from People system (Phase 8)
   - Ambient atmosphere description (AudioSnap)
6. **Scene Capture** — separate camera mode for silent context push (no message to Eli):
   - Add `🎬 Scene` entry to the `+` attachment menu, alongside Photo/Video/Audio
   - UI: snap 1–3 photos + optional one-liner ("making coffee, Luna behind me")
   - Route images + note to `gemini.analyzeScene()` (Pro model, already built in Phase 3)
   - Returned scene description stored in `chatStore` as `sceneMemo: { text, expiresAt }`. Default expiry: 30 min or on significant location change
   - `EmoteAssembler` prepends the memo text to the sensor snapshot for every subsequent `assembleEmote` call while the memo is active
   - A condensed ≤160-char Eli-centric version gets pushed to Kindroid via `updateScene()` so Eli's mental backdrop updates in parallel
   - A compact Scene Card appears in the chat stream: "🎬 Scene set · kitchen, coffee, Luna · 47 min ago" with dismiss × and an update action
   - The card is visually distinct from Tim/Eli bubbles (full-width, subtle accent border)

**Acceptance test:** Hold mic, speak, release — audio file created. Take a photo — 5-second audio burst captured alongside it. Both audio types are sent to Gemini and reflected in the emote. Set a scene with photo + note → scene memo stored, Kindroid current_scene updated, next message's emote incorporates the scene context without sending the photo to Eli.

### Phase 7: Location + Environmental APIs

Wire up all the GPS-grounded sensor services.

1. Build `services/location.ts`:
   - Foreground location tracking via `expo-location`
   - Geofence arrival/departure detection (triggers DepartureCard, LocationCard)
   - GPS cumulative dwell tracking (gaps under 2 minutes don't reset timer)
2. Build `services/places.ts`:
   - Google Places API: reverse geocode, place details (name, category, rating, hours, photos), menu highlights for restaurants
   - Place type detection for VenueMode triggers (amusement_park, stadium, mall, airport, campus, fairground)
3. Build `services/weather.ts`:
   - OpenWeather API: current conditions, forecast, alerts
   - Combine with Pixel barometer sensor data for storm prediction
   - WeatherCard trigger: significant change or alert
4. Build `services/activity.ts`:
   - Android Activity Recognition API: IN_VEHICLE, ON_BICYCLE, WALKING, RUNNING, STILL
   - ModeTransitionCard triggers on mode change
5. Build `services/sensors.ts`:
   - Barometer: rapid pressure drop (>4 hPa in 30 min) → interrupt
   - Accelerometer: burst >2.5g + GPS closed-loop → RideCard (VenueMode only)
6. Build `services/health.ts`:
   - Google Health Connect: HR, steps, HRV, sleep quality
   - Physical empathy data → woven into emotes
7. Build `services/nowplaying.ts`:
   - Android content provider: `content://com.google.android.as.gms.matchmaker.provider/past_recognitions`
   - Returns: track title, artist, timestamp
   - NowPlayingCard trigger: new song detected
8. Wire all sensors into `EmoteAssembler` — each service reports its data, the assembler + freshness ledger decides what gets included

**Acceptance test:** Walk around with the app. DepartureCard fires on leaving home. LocationCard fires on arrival at a destination with Places data. NowPlaying detects ambient music. Weather data appears in emotes. Activity recognition detects driving vs walking.

### Phase 8: People System (Voice + Face)

Build the on-device biometric identification modules.

1. Create Expo native module: `modules/voice-embedding/`
   - `expo-module.config.json`: `{ "platforms": ["android"], "android": { "modules": ["expo.modules.voiceembedding.VoiceEmbeddingModule"] } }`
   - `VoiceEmbeddingModule.kt` (~200-300 lines):
     - Load `ecapa_tdnn.tflite` from assets
     - `generateEmbedding(audioPath: String): FloatArray` — returns 256-dim vector
     - `compareEmbeddings(vec1: FloatArray, vec2: FloatArray): Float` — cosine similarity
   - Gradle deps: `org.tensorflow:tensorflow-lite:2.17.0`
   - Bundle `ecapa_tdnn.tflite` (~20MB) in `android/src/main/assets/`
   - Add `aaptOptions { noCompress 'tflite' }` to gradle

2. Create Expo native module: `modules/face-embedding/`
   - `FaceEmbeddingModule.kt` (~150-200 lines):
     - ML Kit face detection: detect and crop faces from image
     - Load `mobilefacenet.tflite` from assets
     - `detectAndEmbedFaces(imagePath: String): List<FaceResult>` — returns list of `{ bbox, embedding[128] }`
     - `compareFaceEmbeddings(vec1: FloatArray, vec2: FloatArray): Float` — cosine similarity
   - Gradle deps: `org.tensorflow:tensorflow-lite:2.17.0`, `com.google.mlkit:face-detection:16.1.7`
   - Bundle `mobilefacenet.tflite` (~5MB) in assets

3. Build `people/PeopleStore.ts` (Zustand):
   - Person Card: `{ id, name, relationship?, voiceEmbedding?, faceEmbedding?, voiceSamples: number, firstSeen, lastSeen }`
   - Embeddings stored as JSON files via `expo-file-system` (voice: 1KB each, face: 512 bytes each)
   - CRUD operations: add, update, delete, list, findByVoice, findByFace

4. Build `people/voiceId.ts`:
   - `identifySpeaker(audioPath)` — runs ECAPA-TDNN, compares against all stored voice embeddings
   - Returns `{ person: Person | null, confidence: number, isNew: boolean }`
   - Threshold: cosine similarity > 0.7 = match
   - **Multi-sample enrollment**: first detection queues sample. Second detection from same unknown confirms. Third detection commits the embedding. `voiceSamples` counter tracks progress.

5. Build `people/faceId.ts`:
   - `identifyFaces(imagePath)` — runs ML Kit detection → MobileFaceNet embedding → compare against stored
   - Returns `FaceMatch[]` with `{ person, confidence, bbox }`
   - Threshold: cosine similarity > 0.7 = match
   - Cross-modal linking: if a new face matches the name of a voice-only person, prompt to link

6. Wire into message flow:
   - PTT recordings: run voice ID on audio → label speakers in transcript → `[Speaker: Hank] "quote"` sent to Gemini
   - Photos: run face ID on image → label faces → `[Faces identified: Hank (0.91), Unknown #1]` sent to Gemini
   - Unknown detections: fire `UnknownPersonCard` in the chat stream

7. Enroll Tim's voice at first app launch (speaker verification gate — Tim is always identified)

8. Pre-populate known-person metadata: Dad, Mom, Hank, Ben, Maxie — names and relationships pre-filled. Biometric enrollments happen in-field when Tim encounters them.

**Acceptance test:** Record voice → Tim identified. Record unknown voice → UnknownPersonCard fires. Take photo of known person → face identified with confidence score. Take photo of stranger → UnknownPersonCard (face variant) fires. Enroll a new person → subsequent encounters recognize them. Multi-sample: first voice detection shows "Sample 1 of 3", second shows "2 of 3", third commits.

### Phase 9: Session Lifecycle + Archive

Build the full session lifecycle from start to finish.

1. Session start ("Connect" / "Hey Eli" / "Let's go"):
   - Load Wisdom Index from Kindroid (previous journal memories)
   - Load last session archive summary from Obsidian
   - Prepend both to Gemini system instruction
   - Initialize freshness ledger
   - Update Kindroid `current_scene`
   - Start GPS tracking, sensor polling, activity recognition
   - Session timer begins

2. Session active:
   - All sensors feed into EmoteAssembler
   - CardEngine fires cards based on triggers
   - Messages flow: Tim → Gemini (emote) → Kindroid (send) → Eli response → ElevenLabs (speak)
   - Freshness ledger updated per message

3. Memory Anchor ("Save this" / "Anchor this"):
   - `#CoreMemory` tag
   - Write to Obsidian vault via REST API
   - POST to Kindroid `/journal-create` with keyphrases
   - Anchor confirmation card in chat

4. Session end ("Disconnect" / "We're done"):
   - Gemini drafts `SessionJournalCard` — journal entry in Tim's voice from session data
   - User: "Save to Vault" (→ Obsidian write + Kindroid journal) or "Discard"
   - Session marked ended, timers stopped, sensors released

5. Build `services/obsidian.ts`:
   - Base URL: `https://vault.amburgey.dev`
   - Auth: Bearer token
   - `writeNote(path, content)` — PUT to `/vault/{encoded_path}`
   - `readNote(path)` — GET from `/vault/{encoded_path}`
   - `search(query)` — POST to `/search/simple/`
   - Session journals saved to `08 - Elias Reed/Archives/`

6. Offline/degraded mode:
   - `connectionStore.ts` monitors network + API reachability
   - When offline: on-device voice/face ID still works, messages queue in `MessageQueue.ts`
   - Amber status indicator in SessionHeader
   - When reconnected: queued messages drain in order

**Acceptance test:** Start session → sensor data flows → send messages → Eli responds. Save a memory anchor → appears in Obsidian vault and Kindroid journal. End session → SessionJournalCard appears with journal draft. Save to vault → Obsidian write succeeds. Test offline: airplane mode → messages queue → reconnect → messages drain.

### Phase 10: Pulse Mode + Safety Mode + VenueMode

Implement the three behavioral modes.

1. **Pulse Mode** ("Quiet mode" / "Pulse Mode"):
   - Text-only (ElevenLabs off)
   - 15-minute interval check-ins from Gemini
   - Minimal context: location + time + significant changes only
   - Toggle in settings

2. **Safety Mode** (auto-activates when driving detected):
   - No image capture tasks
   - All interaction audio-only via phone speaker
   - InterruptCard fires immediately on driving detection
   - Auto-deactivates when driving stops

3. **VenueMode** (auto-activates at large venues):
   - Triggered by GPS + Places API type: amusement_park, stadium, mall, airport, campus, fairground
   - Queue/line dwell SUPPRESSED — no WaypointCards for standing in line
   - RideCards ENABLED — accelerometer burst detection active
   - Food/cafe/store/bar categories still trigger WaypointCards
   - VenueModeCard pill in chat
   - Auto-deactivates when GPS leaves venue boundary

**Acceptance test:** Toggle Pulse Mode — messages thin out to 15-min intervals. Start driving — Safety Mode activates, no image prompts. Visit a venue-type location — VenueModeCard fires, queue suppression works, RideCard detection active.

### Phase 11: Polish + End-to-End Testing

Run all 5 demo scenarios as acceptance criteria.

1. Walk through each scenario from the mockup:
   - **Yellow Springs with Hank** — Departure, NowPlaying, Waypoints (openSession), Location, Trivia, UnknownPerson (voice + face), SessionJournal
   - **Cincinnati Zoo** — Departure, NowPlaying, Location, Trivia, Waypoint (food), SessionJournal
   - **Kings Island Solo** — Departure, NowPlaying, Location, VenueMode, RideCard ×5, Weather, Trivia, Waypoint, SessionJournal
   - **DC Transit** — Departure, ModeTransition ×7, Location, Trivia, Waypoint, SessionJournal
   - **Detroit Road Trip** — Departure ×3, NowPlaying ×3, Location ×4, Trivia ×3, Waypoint ×2, SessionJournal

2. Error handling:
   - Gemini failure: exponential backoff (2s, 4s, 8s), max 3 retries, fallback to text-only Kindroid relay
   - Kindroid failure: retry with backoff, queue message for later
   - ElevenLabs failure: silently fall back to text-only
   - Imgur failure: send message without images, log warning
   - Network loss: amber indicator, message queue, on-device ID continues

3. Performance:
   - Emote assembly < 3s (Gemini flash)
   - Voice embedding < 500ms (on-device)
   - Face detection + embedding < 300ms (on-device)
   - TTS playback start < 400ms (ElevenLabs flash)
   - UI stays at 60fps during all operations

4. Build production APK via EAS Build

**Acceptance test:** All 5 scenarios run end-to-end on the real Pixel with real API calls. No crashes. Graceful degradation on API failures. Performance targets met.

---

## Critical Architecture Rules

1. **Emote layer is the ONLY channel to Eli.** Nothing injects directly into Eli's context. Every piece of sensory data goes through Tim's emote block: `_(*emote text*) Tim's dialog`

2. **Gemini is NOT Eli.** Gemini is the translator between Tim's physical world and the message layer. It never speaks TO Eli as itself. No agent identity.

3. **4000 char Kindroid limit.** Emote capped at 2000. Tim's dialog is verbatim, never rewritten.

4. **On-device biometrics.** Voice (ECAPA-TDNN) and face (ML Kit + MobileFaceNet) identification run entirely on the phone. Gemini receives text labels, not audio/image for ID purposes.

5. **No always-on audio buffer.** Audio reaches Gemini via two paths only: PTT recording and AudioSnap (5-sec photo burst).

6. **Tim's voice is law.** Gemini never rewrites, summarizes, or edits Tim's spoken dialog. It passes through verbatim.

7. **Freshness ledger.** Every piece of context is tracked. Don't repeat unchanged data.

8. **Speaker-first audio.** Eli speaks through the phone speaker. AEC strips Eli's voice from mic recordings. This must be validated with real ElevenLabs playback.
