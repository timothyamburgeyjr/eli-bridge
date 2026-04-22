import type { ChatItem } from "@/components/chat/ChatStream";
import type { TimelineEntry, TimelineStat } from "@/components/session/SessionTimeline";

export const DET_MESSAGES: ChatItem[] = [
  {
    id: "det1", from: "tim", time: "7:48 AM",
    emote: "Early. The house is quiet — just me and the car keys and a full tank. Solo road trip energy at 7:48 AM is its own thing: the world not fully awake, the day wide open. Armstrong Museum opens at 11 and I planned the drive to arrive right at opening.",
    dialog: "Eli, solo day. Detroit for Michigan weed, but also — the Neil Armstrong Museum is right on I-75 in Wapakoneta. Stopping there first.",
    pills: [
      { icon: "📍", label: "Lynchburg OH" },
      { icon: "🌤️", label: "58°F" },
      { icon: "🚗", label: "Solo trip" },
    ],
  },
  {
    id: "det2", from: "eli", time: "7:49 AM",
    emote: "Armstrong Museum and Michigan weed in the same day. This is the kind of itinerary that could only make sense to Tim.",
    dialog: "Armstrong Museum at 11, dispensary by late afternoon. That's legitimately the most Ohio-to-Michigan road trip imaginable. I'm in. How far to Wapakoneta?",
  },
  {
    id: "detdep", from: "departure", time: "7:52 AM",
    from_location: "Lynchburg OH",
    destination_set: "Armstrong Air & Space Museum · Wapakoneta OH",
    detectedMode: "car", briefed: true,
  },
  {
    id: "detwp1", from: "waypoint", time: "8:34 AM",
    icon: "⛽", name: "Speedway", category: "Gas stop",
    location: "Bellefontaine OH", duration: "7 min",
    initialState: "saved",
  },
  { id: "detnp1", from: "nowplaying", time: "8:52 AM", title: "Space Oddity", artist: "David Bowie", autoShared: true },
  {
    id: "det3", from: "tim", time: "9:14 AM", isDrive: true,
    emote: "I-75 north. Ohio doing its honest, unapologetic flat thing. I've been quiet — just the music and the road and the anticipation of a museum I've been meaning to visit for years.",
    dialog: "I-75 north. The right kind of flat. Bowie was the correct call.",
    pills: [{ icon: "🚗", label: "72 mph" }, { icon: "🎙️", label: "Voice" }],
  },
  {
    id: "det4", from: "eli", time: "9:14 AM", isDrive: true,
    emote: "I-75 flat Ohio, Bowie, the quiet anticipation of a museum that's been on the list too long.",
    dialog: "Space Oddity on the way to the Armstrong Museum. You didn't plan that — the day just decided. Good sign.",
  },
  {
    id: "dettri1", from: "trivia", time: "10:38 AM",
    fact: "Neil Armstrong grew up in Wapakoneta, Ohio — 8 miles ahead on I-75. He got his student pilot license at 16, before his driver's license. He flew 78 combat missions in Korea before becoming a test pilot. Gemini VIII in 1966 was his first spaceflight — a stuck thruster sent the capsule into a spin of over 550 degrees per second. Armstrong stabilized it in 8 seconds.",
  },
  {
    id: "detloc1", from: "location", time: "10:58 AM",
    name: "Armstrong Air & Space Museum",
    category: "Museum · $", rating: "4.8★",
    hours: "Open · Closes 5 PM", address: "500 Apollo Dr, Wapakoneta OH",
    transit: "80.4 mi · 3h 06min",
    arrivalNote: "You talked on the drive — Eli has full context. Brief adds arrival + exhibit highlights.",
    menuHighlights: [
      "Gemini VIII Capsule · Armstrong's first flight",
      "Moon Rock sample · Apollo 11",
      "F5D Skylancer · Armstrong's NACA test jet",
      "Infinity Room · immersive theater",
      "Armstrong boyhood artifacts · Wapakoneta",
      "Mission control replica",
    ],
  },
  {
    id: "dettri2", from: "trivia", time: "11:01 AM",
    fact: "The Gemini VIII capsule here is the actual spacecraft — the one that nearly killed Armstrong on March 16, 1966. He and David Scott completed the first docking in space, then a stuck thruster sent them into a 550-degree-per-second spin. With vision failing from G-forces, Armstrong used re-entry control thrusters — normally reserved for descent — to stop the spin. That composure is why he walked on the Moon.",
  },
  {
    id: "det5", from: "tim", time: "11:14 AM",
    emote: "The Gemini VIII capsule. Maybe 7 feet across, scorched, real — sitting behind a low rope. I'm leaning over slightly to see the interior. The controls are impossibly dense for the size of the space. Two men fit in here.",
    dialog: "Eli. Gemini VIII. Two men fit in this thing. I'm looking at the controls — there are hundreds of switches.",
    pills: [{ icon: "📍", label: "Gemini VIII capsule" }, { icon: "📷", label: "4 photos" }],
  },
  {
    id: "det6", from: "eli", time: "11:15 AM",
    emote: "The scorched capsule, the hundreds of switches, two men in seven feet.",
    dialog: "The Gemini program was NASA figuring out how to reach the Moon by actually doing it — docking, spacewalks, long-duration flight. VIII nearly ended Armstrong. The capsule survived because he was the right person in the wrong situation and did everything right.",
  },
  {
    id: "det7", from: "tim", time: "11:48 AM",
    emote: "Moon rock display. A small sample behind thick glass — unremarkably gray. A sign reads 3.7 billion years old. I've been standing here longer than seems proportional to its appearance.",
    dialog: "There's a moon rock here. 3.7 billion years old. It looks like gravel. I can't stop looking at it.",
    pills: [{ icon: "🌙", label: "Moon rock · Apollo 11" }, { icon: "📍", label: "Armstrong Museum" }],
  },
  {
    id: "det8", from: "eli", time: "11:49 AM",
    emote: "The moon rock. The unremarkable gray. The billions of years in a case.",
    dialog: "3.7 billion years ago Earth was barely forming. That rock predates complex life on this planet. Armstrong carried a piece of the Wright Brothers' 1903 Flyer to the Moon in his suit pocket.",
  },
  {
    id: "detdep2", from: "departure", time: "12:32 PM",
    from_location: "Armstrong Museum · Wapakoneta OH",
    destination_set: "Gage Cannabis · Detroit MI",
    detectedMode: "car", briefed: false,
  },
  {
    id: "det9", from: "tim", time: "12:38 PM", isDrive: true,
    emote: "Back on I-75 north. The nav just announced the destination change — from 'Armstrong Museum' to 'Gage Cannabis' — which is a sentence that describes a specific kind of Tuesday in Ohio.",
    dialog: "Heading north to Detroit. The navigation just said 'Gage Cannabis' out loud.",
    pills: [{ icon: "🚗", label: "72 mph" }, { icon: "🎙️", label: "Voice" }],
  },
  {
    id: "det10", from: "eli", time: "12:39 PM", isDrive: true,
    emote: "The nav announcing Gage Cannabis on I-75 after three hours at the Armstrong Museum.",
    dialog: "From one giant leap to Gage Cannabis. Your Tuesday is sequential and I respect every step of it. How long to Detroit from here?",
  },
  {
    id: "detwp2", from: "waypoint", time: "1:58 PM",
    icon: "🍔", name: "Tony Packo's", category: "Food stop",
    location: "Toledo OH", duration: "45 min",
    initialState: "told",
    briefSent: "Lunch at Tony Packo's in Toledo — the original Hungarian hot dog place M*A*S*H made famous. Klinger was right about this place.",
  },
  { id: "detnp2", from: "nowplaying", time: "2:51 PM", title: "Detroit Rock City", artist: "KISS", autoShared: true },
  {
    id: "dettri3", from: "trivia", time: "3:18 PM",
    fact: "You just crossed into Michigan — 10th largest state, more than 11,000 inland lakes. Michigan legalized recreational cannabis in 2018 and now has over 800 licensed dispensaries. Detroit is 52 miles ahead. Michigan prices average 30–40% below Ohio's market.",
  },
  {
    id: "det11", from: "tim", time: "3:21 PM", isDrive: true,
    emote: "Michigan. The highway signs changed. Bridge over the state line had a 'Welcome to Michigan' sign that I caught at 72 mph. Lake Erie is out there to the east, invisible but present.",
    dialog: "Michigan. Signs changed. Almost there.",
    pills: [{ icon: "🚗", label: "72 mph" }, { icon: "📍", label: "Michigan · 52 mi to Detroit" }],
  },
  {
    id: "det12", from: "eli", time: "3:22 PM", isDrive: true,
    emote: "The sign change, Michigan, the lake invisible but present to the east.",
    dialog: "52 miles. Gage on East Jefferson is on the Detroit riverfront — you'll see Windsor, Ontario across the water. International weed run.",
  },
  {
    id: "detloc2", from: "location", time: "4:16 PM",
    name: "Gage Cannabis · Detroit",
    category: "Licensed Dispensary · Michigan", rating: "4.7★",
    hours: "Open · Closes 9 PM", address: "13310 E Jefferson Ave, Detroit MI",
    transit: "155.2 mi · 2h 46min from Wapakoneta",
    arrivalNote: "You talked the whole way — Eli has full context. Brief adds arrival.",
    menuHighlights: [
      "Wedding Cake · Hybrid · $32/eighth",
      "Blue Dream · Sativa · $28/eighth",
      "Gelato #33 · Hybrid · $35/eighth",
      "Motor City Kush · Indica · $24/eighth",
      "Live resin · house-made · $38/g",
    ],
  },
  {
    id: "det13", from: "tim", time: "4:24 PM",
    emote: "The shop is clean, well-lit, professionally run. A budtender named Jordan is explaining the difference between two live resins with genuine enthusiasm. Through the window behind the counter: the Detroit River, Windsor, Canada clearly visible across the water.",
    dialog: "Eli, I can see Canada out the dispensary window. Jordan is very knowledgeable about live resin.",
    pills: [{ icon: "📍", label: "Gage Cannabis · Detroit" }, { icon: "🇨🇦", label: "Canada visible" }],
  },
  {
    id: "det14", from: "eli", time: "4:25 PM",
    emote: "The dispensary, Jordan's live resin expertise, Canada across the river.",
    dialog: "You drove past Armstrong's birthplace, ate at Klinger's restaurant, and are now buying weed with Canada as the backdrop. Tim, this is actually a perfect road trip. Trust Jordan on the live resin.",
  },
  {
    id: "detdep3", from: "departure", time: "4:58 PM",
    from_location: "Gage Cannabis · Detroit MI",
    destination_set: "1550 Weisflock Rd · Lynchburg OH",
    detectedMode: "car", briefed: false,
  },
  { id: "detnp3", from: "nowplaying", time: "5:22 PM", title: "Take It Easy", artist: "Eagles", autoShared: true },
  {
    id: "detloc3", from: "location", time: "8:33 PM",
    name: "Home · Lynchburg OH", address: "1550 Weisflock Rd, Lynchburg OH",
    transit: "210.4 mi · 3h 35min (return)",
    arrivalNote: "Long drive home — Eli has full day context. Brief closes the loop.",
    savedWaypoints: ["⛽ Speedway · 7 min · Bellefontaine OH (morning)"],
    isHome: true,
  },
  {
    id: "detjournal", from: "journal", time: "8:36 PM",
    title: "Armstrong Museum → Detroit",
    date: "2026-04-22", duration: "12h 48min",
    locations: ["Wapakoneta OH · Armstrong Museum", "Toledo OH · Tony Packo's", "Detroit MI · Gage Cannabis"],
    soundtrack: ["Space Oddity – David Bowie", "Detroit Rock City – KISS", "Take It Easy – Eagles"],
    preview: "Left before 8 with the Armstrong Museum already on my mind — it's been on the list for too long. I-75 north through flat Ohio, Bowie on shuffle, and that specific satisfaction of a solo road trip with clear purpose...",
  },
];

export const DET_TIMELINE: TimelineEntry[] = [
  { time: "8:36 PM", icon: "📓", label: "Journal saved to vault", sub: "Auto-generated · 12h 48min" },
  { time: "8:33 PM", icon: "🏠", label: "Home · Lynchburg OH", sub: "Session closed" },
  { time: "4:58 PM", icon: "🚗", label: "Departed Detroit", sub: "→ Home · 210.4 mi" },
  { time: "4:16 PM", icon: "🌿", label: "Gage Cannabis · Detroit MI", sub: "Canada visible out the window" },
  { time: "3:18 PM", icon: "📖", label: "Trivia · Crossed into Michigan", sub: "800+ dispensaries · 52 mi to Detroit" },
  { time: "1:58 PM", icon: "🍔", label: "Tony Packo's · Toledo · 45 min", sub: "Told Eli · Klinger was right" },
  { time: "12:32 PM", icon: "🚗", label: "Departed Armstrong Museum", sub: "→ Detroit · 155 mi" },
  { time: "11:48 AM", icon: "🌙", label: "Moon Rock · Apollo 11 · 3.7B years", sub: "2 photos" },
  { time: "11:14 AM", icon: "📍", label: "Gemini VIII Capsule", sub: "4 photos · 8 seconds saved it" },
  { time: "10:58 AM", icon: "📍", label: "Armstrong Air & Space Museum", sub: "80.4 mi · 3h 06min" },
  { time: "8:52 AM", icon: "🎵", label: "Space Oddity – David Bowie", sub: "Auto-shared · unplanned perfection" },
  { time: "8:34 AM", icon: "⛽", label: "Speedway · Bellefontaine · 7 min", sub: "Saved for arrival" },
  { time: "7:52 AM", icon: "🚗", label: "Departed · Eli briefed", sub: "→ Armstrong Museum · 80.4 mi" },
  { time: "7:48 AM", icon: "📍", label: "Home · Lynchburg OH", sub: "Session started" },
];

export const DET_STATS: TimelineStat[] = [
  { value: "26", label: "Messages" },
  { value: "5", label: "Locations" },
  { value: "12h 48m", label: "Duration" },
];
