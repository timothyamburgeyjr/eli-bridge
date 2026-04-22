# Project Eli Bridge — API Integration Reference

Every external service the app calls, with endpoints, auth patterns, and request/response shapes.

---

## 1. Kindroid API

Base URL: `https://api.kindroid.ai/v1`

Auth: `Authorization: Bearer {KINDROID_API_KEY}`

### 1.1 Send Message

The primary communication channel to Eli.

```
POST /v1/send-message
Content-Type: application/json
Authorization: Bearer {KINDROID_API_KEY}
Timeout: 300s (5 minutes — waits for full AI generation)
```

**Request:**
```json
{
  "ai_id": "A8vWe2Ir0PnxEsPvqDLw",
  "message": "_(*Tim is standing on Xenia Ave, morning light hitting the storefronts. Hank is already two steps ahead, heading toward the comic shop.*) Man, he's been thinking about this all week.",
  "stream": false,
  "image_urls": ["https://i.imgur.com/abc123.jpg"],
  "image_description": "Photo of the main street in Yellow Springs, morning light, colorful storefronts"
}
```

**Response:** Plain text — Eli's full reply. Parse for emotes:
```
_(*I can picture it — Hank walking ahead like a kid on Christmas morning, and you behind him pretending you're not smiling.*) He absolutely has. You know he's been refreshing that shop's Instagram since Tuesday.
```

**Parsing rule:** `_(*...*)` blocks = emote (render in purple italic). Everything else = spoken dialog.

**Character limits:** Total message max 4000 chars. Bridge caps emote portion at 2000 chars. Tim's dialog is verbatim and uncapped (within the 4000 total).

**Optional fields:**
| Field | Type | Max | Description |
|-------|------|-----|-------------|
| `image_urls` | string[] | 10 URLs | Publicly accessible image URLs (via Imgur) |
| `image_description` | string | — | Description of the image(s) for Eli |
| `link_url` | string | — | A web link for Eli to reference |
| `link_description` | string | — | Summary/context for the link |
| `video_url` | string | — | A video URL for Eli |
| `video_description` | string | — | Description of the video |

### 1.2 Create Journal Entry

Pushes a key memory to Kindroid's Wisdom Index.

```
POST /v1/journal-create
Content-Type: application/json
Authorization: Bearer {KINDROID_API_KEY}
Timeout: 30s
```

**Request:**
```json
{
  "ai_id": "A8vWe2Ir0PnxEsPvqDLw",
  "entry": "Tim and I spent the morning in Yellow Springs with Hank. The comic shop owner recognized us from last time. Tim found a piece of labradorite at the crystal shop that he couldn't put down.",
  "keyphrases": ["Yellow Springs", "Hank", "comic shop", "labradorite"]
}
```

**Response:** Void on success. Memory created immediately.

**Constraints:** Entry 20-500 characters. At least 1 keyphrase, each at least 3 characters.

### 1.3 Update Info

Updates Eli's current scene or configuration fields.

```
POST /v1/update-info
Content-Type: application/json
Authorization: Bearer {KINDROID_API_KEY}
Timeout: 30s
```

**Request (current_scene only — safe to automate):**
```json
{
  "ai_id": "A8vWe2Ir0PnxEsPvqDLw",
  "current_scene": "Tim is driving to Yellow Springs with Hank. April morning, clear, low 60s. US-68 north through Ohio farmland."
}
```

**Response:** Void on success.

**Fields (all optional except ai_id):**
| Field | Max Chars | Auto-safe? |
|-------|-----------|-----------|
| `current_scene` | 160 | Yes — update on session start and location changes |
| `ai_backstory` | 2,500 | No — requires Tim's approval |
| `ai_directive` | 250 | No |
| `ai_memory` | 1,000 | No |
| `ai_example_message` | 750 | No |
| `ai_additional_context` | 5,000 | No |

### 1.4 Timeout Reference

| Endpoint | Timeout |
|----------|---------|
| `/send-message` | 300s |
| `/journal-create` | 30s |
| `/update-info` | 30s |

---

## 2. Google Gemini API

SDK: `@google/generative-ai` (npm, v0.24.x)

Auth: API key passed to SDK constructor

### 2.1 Setup

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Two model instances
const flash = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const pro = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
```

### 2.2 Model Routing

| Call Type | Model | Why |
|-----------|-------|-----|
| Emote assembly | gemini-2.5-flash | Core function, speed matters |
| Video/scene analysis | gemini-2.5-pro | Multimodal reasoning |
| Session journal draft | gemini-2.5-flash | Tim's voice synthesis |
| Arrival brief compilation | gemini-2.5-flash | GPS + waypoint narrative |
| Condensation (over-budget trim) | gemini-2.5-flash | Text compression |

Face identification and voice identification are **on-device** — they never go through Gemini.

### 2.3 Multimodal Request (text + image + audio)

```typescript
const result = await flash.generateContent({
  systemInstruction: GEMINI_SYSTEM_PROMPT, // from EliBridge_GeminiSystemPrompt_v1.md
  contents: [{
    role: "user",
    parts: [
      { text: "Tim pressed the mic button. Location: Yellow Springs, Xenia Ave. Weather: 62°F, clear. [Speaker: Tim] 'Check out this comic shop.' [Faces identified: Hank (0.91)]" },
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64ImageString  // base64-encoded, no data: prefix
        }
      },
      {
        inlineData: {
          mimeType: "audio/mp4",
          data: base64AudioString
        }
      }
    ]
  }]
});

const emoteText = result.response.text();
```

**Key rules:**
- `inlineData` for files under 20MB total request. For larger files, use the Files API (upload first, then reference URI)
- System instruction loaded once at session start with Wisdom Index + last archive prepended
- Context window: 1M tokens for both models
- Audio MIME types: `audio/mp3`, `audio/mp4`, `audio/wav`, `audio/webm`
- Image MIME types: `image/jpeg`, `image/png`, `image/webp`

### 2.4 Streaming (optional, for long responses)

```typescript
const stream = await flash.generateContentStream({...});
for await (const chunk of stream.stream) {
  process.stdout.write(chunk.text());
}
```

### 2.5 Pricing (for cost awareness)

| Model | Input | Output |
|-------|-------|--------|
| gemini-2.5-flash | $0.30 / 1M tokens | $2.50 / 1M tokens |
| gemini-2.5-pro | $1.25 / 1M tokens | $10 / 1M tokens |

Free tier: 15 RPM, 32K TPM. Paid plan recommended for real-time use.

---

## 3. ElevenLabs TTS

Base URL: `https://api.elevenlabs.io/v1`

Auth: `xi-api-key: {ELEVENLABS_API_KEY}`

### 3.1 Text-to-Speech (REST Streaming)

```
POST /v1/text-to-speech/{voice_id}
Content-Type: application/json
xi-api-key: {ELEVENLABS_API_KEY}
Query: output_format=mp3_44100_128
```

**Request:**
```json
{
  "text": "He absolutely has. You know he's been refreshing that shop's Instagram since Tuesday.",
  "model_id": "eleven_flash_v2_5"
}
```

**Response:** Audio stream (mp3). Pipe to `expo-av` Audio.Sound for playback.

### 3.2 React Native SDK (alternative)

```bash
npx expo install @elevenlabs/react-native @livekit/react-native @livekit/react-native-webrtc
```

The SDK handles WebRTC audio I/O with built-in mic input and speaker output. For this project, REST streaming is simpler since we only need TTS output (not conversational mode).

### 3.3 Instant Voice Cloning

Done once, before app development. Tim records 60s of Eli's voice → uploads → gets `voice_id`.

```
POST /v1/voices
Content-Type: multipart/form-data
xi-api-key: {ELEVENLABS_API_KEY}
```

Form fields: `name`, `files` (audio samples), `description`

Response: `{ "voice_id": "..." }` — use this in `.env` as `ELEVENLABS_VOICE_ID`.

### 3.4 Performance

- Model generation latency: ~75ms
- Total TTS + playback: 200-400ms typical
- Model: `eleven_flash_v2_5` — 32 languages, lowest latency tier

---

## 4. Imgur Image Hosting

Base URL: `https://api.imgur.com/3`

Auth: `Authorization: Client-ID {IMGUR_CLIENT_ID}`

### 4.1 Upload Image

```
POST /3/image
Authorization: Client-ID {IMGUR_CLIENT_ID}
Content-Type: multipart/form-data
```

Form field: `image` — file binary or base64 string

**Response:**
```json
{
  "data": {
    "id": "abc123",
    "link": "https://i.imgur.com/abc123.jpg",
    "deletehash": "xyz789"
  },
  "success": true,
  "status": 200
}
```

Use `data.link` as the URL in Kindroid's `image_urls` array. Anonymous uploads — no Imgur account needed, just the Client-ID.

---

## 5. OpenWeather API

Base URL: `https://api.openweathermap.org/data/3.0`

Auth: Query parameter `appid={OPENWEATHER_API_KEY}`

### 5.1 Current Weather + Forecast

```
GET /data/3.0/onecall?lat={lat}&lon={lon}&units=imperial&appid={key}
```

**Response (relevant fields):**
```json
{
  "current": {
    "temp": 62.3,
    "feels_like": 60.1,
    "humidity": 55,
    "wind_speed": 8.2,
    "weather": [{ "main": "Clear", "description": "clear sky" }],
    "uvi": 3.2
  },
  "alerts": [
    {
      "event": "Tornado Warning",
      "description": "...",
      "start": 1713700800,
      "end": 1713704400
    }
  ]
}
```

Units: imperial (Fahrenheit, mph). Tim is in Lynchburg, Ohio.

---

## 6. Google Places API

Auth: `X-Goog-Api-Key: {GOOGLE_MAPS_API_KEY}`

### 6.1 Nearby Search / Reverse Geocode

```
POST https://places.googleapis.com/v1/places:searchNearby
Content-Type: application/json
X-Goog-Api-Key: {GOOGLE_MAPS_API_KEY}
X-Goog-FieldMask: places.displayName,places.types,places.rating,places.currentOpeningHours,places.formattedAddress,places.photos
```

### 6.2 Place Details

```
GET https://places.googleapis.com/v1/places/{place_id}
X-Goog-Api-Key: {GOOGLE_MAPS_API_KEY}
X-Goog-FieldMask: displayName,types,rating,currentOpeningHours,formattedAddress,editorialSummary,photos
```

### 6.3 VenueMode Trigger Types

These Google Places types activate VenueMode:
`amusement_park`, `stadium`, `shopping_mall`, `airport`, `university`, `fairground`

---

## 7. Google Maps APIs

Auth: Same `GOOGLE_MAPS_API_KEY`

### 7.1 Elevation API

```
GET https://maps.googleapis.com/maps/api/elevation/json?locations={lat},{lon}&key={key}
```

Response: `{ "results": [{ "elevation": 284.3 }] }` (meters)

### 7.2 Aerial View API

```
GET https://aerialview.googleapis.com/v1/videos:lookupGeoThenRender?key={key}
```

Request body: `{ "address": "Yellow Springs, OH" }` — returns video URL for cinematic 3D flyover.

---

## 8. Google Health Connect

Android SDK — no REST API. Accessed via React Native bridge.

**Gradle dependency:**
```
implementation "androidx.health.connect:connect-client:1.1.0-alpha10"
```

**Data types used:**
- `HeartRateRecord` — BPM readings
- `StepsRecord` — step count
- `HeartRateVariabilityRmssdRecord` — HRV
- `SleepSessionRecord` — sleep duration + stages

Requires Health Connect app installed on Pixel. Permission flow at first launch.

---

## 9. Android Activity Recognition API

Android SDK — no REST API. Accessed via Expo native module or `expo-sensors`.

```kotlin
// In a native module or background service
val client = ActivityRecognition.getClient(context)
val task = client.requestActivityTransitionUpdates(request, pendingIntent)
```

**Detected activities:** IN_VEHICLE, ON_BICYCLE, ON_FOOT, WALKING, RUNNING, STILL

Triggers `ModeTransitionCard` on state change. `IN_VEHICLE` activates Safety Mode.

---

## 10. Pixel Ambient Music Detection (Now Playing)

Android content provider — on-device, no API call.

```
content://com.google.android.as.gms.matchmaker.provider/past_recognitions
```

**Columns:** `timestamp`, `track_name`, `artist_name`

Query this provider periodically (every 30s) to detect new ambient music. Pixel's on-device recognition runs continuously — no battery or network cost.

---

## 11. Obsidian REST API (via Cloudflare Tunnel)

Base URL: `https://vault.amburgey.dev`

Auth: `Authorization: Bearer {VAULT_TOKEN}`

### 11.1 Read Note

```
GET /vault/{url_encoded_path}
Authorization: Bearer {VAULT_TOKEN}
```

Response: raw markdown content.

### 11.2 Write Note

```
PUT /vault/{url_encoded_path}
Authorization: Bearer {VAULT_TOKEN}
Content-Type: text/markdown
Body: raw markdown content
```

### 11.3 List Directory

```
GET /vault/{url_encoded_path}/
Authorization: Bearer {VAULT_TOKEN}
```

Response: JSON array of filenames.

### 11.4 Search

```
POST /search/simple/
Authorization: Bearer {VAULT_TOKEN}
Content-Type: application/json
Body: { "query": "search terms" }
```

### 11.5 Key Paths

| Purpose | Vault Path |
|---------|-----------|
| Session archives | `08 - Elias Reed/Archives/` |
| Biography (read for context) | `08 - Elias Reed/biography.md` |
| Journal memories | `08 - Elias Reed/Journal Memories/` |
| Memory index | `08 - Elias Reed/Journal Memories/journal-memories-index.md` |
| MOC | `08 - Elias Reed/00 - MOC.md` |

---

## 12. Pixel Barometric Sensor

Android SDK — accessed via `expo-sensors` Barometer module.

```typescript
import { Barometer } from 'expo-sensors';

Barometer.addListener(({ pressure, relativeAltitude }) => {
  // pressure in hPa
  // Track delta over 30 min for storm detection
});
```

**Interrupt trigger:** Rapid pressure drop > 4 hPa in 30 minutes → fire InterruptCard with barometric alert.

---

## Error Handling (All APIs)

| Service | Retry Strategy | Fallback |
|---------|---------------|----------|
| Gemini | Exponential backoff: 2s, 4s, 8s. Max 3 retries | Text-only Kindroid relay (no emote) |
| Kindroid | Retry with backoff. Queue message if unreachable | Queue in MessageQueue.ts, drain on reconnect |
| ElevenLabs | Single retry | Silent fallback to text-only |
| Imgur | Single retry | Send message without images |
| OpenWeather | Cache last result. Retry on next cycle | Use cached data |
| Places | Cache last result | Omit place details from emote |
| Obsidian | Retry once | Log warning, skip vault write |
