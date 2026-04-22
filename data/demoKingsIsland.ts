import type { ChatItem } from "@/components/chat/ChatStream";
import type { TimelineEntry, TimelineStat } from "@/components/session/SessionTimeline";

export const KI_MESSAGES: ChatItem[] = [
  {
    id: "ki1", from: "tim", time: "9:33 AM",
    emote: "Solo. The car is packed with nothing — just Tim, keys, sunscreen. Kings Island hasn't opened yet when he leaves Lynchburg. Morning is perfect for it: low 70s, clear sky, low humidity.",
    dialog: "Eli, going to Kings Island solo today. Just me and the coasters.",
    pills: [
      { icon: "📍", label: "Lynchburg OH" },
      { icon: "🌤️", label: "72°F" },
      { icon: "🎢", label: "Solo day" },
    ],
  },
  {
    id: "ki2", from: "eli", time: "9:34 AM",
    emote: "I settle in for a full coaster day. Solo Kings Island has a different energy — no group logistics, just me and whatever the line situation is.",
    dialog: "Solo coaster day is the purest form. No group vote on what's next. What's the plan?",
  },
  {
    id: "kidep", from: "departure", time: "9:36 AM",
    from_location: "Lynchburg OH",
    destination_set: "Kings Island · 6300 Kings Island Dr, Mason OH",
    detectedMode: "car", briefed: true,
  },
  {
    id: "ki3", from: "tim", time: "10:24 AM", isDrive: true,
    emote: "I-71 north through Cincinnati's outskirts. The Kings Island coasters are visible from the highway before the exit — Orion's tower, the Beast's lift hill.",
    dialog: "Can see the rides from the highway. Orion's tower is taller than I thought.",
    pills: [{ icon: "🚗", label: "70 mph" }, { icon: "🎙️", label: "Voice" }],
  },
  {
    id: "ki4", from: "eli", time: "10:24 AM", isDrive: true,
    emote: "The approach — coasters on the horizon from I-71.",
    dialog: "Orion is 287 feet. When you're on the lift hill looking down at I-71 you'll understand the tower. Enjoy the approach.",
  },
  { id: "kinp1", from: "nowplaying", time: "10:31 AM", title: "Thunder Road", artist: "Bruce Springsteen", autoShared: true },
  {
    id: "kiloc1", from: "location", time: "10:48 AM",
    name: "Kings Island",
    category: "Amusement Park", rating: "4.6★",
    hours: "Open · Closes 10 PM", address: "6300 Kings Island Dr, Mason OH",
    transit: "106.2 mi · 1h 12min",
    arrivalNote: "You talked on the drive — Eli has context.",
    menuHighlights: [
      "The Beast · Wooden · 7,359 ft",
      "Orion · Giga · 287 ft",
      "Banshee · Inverted · 167 ft",
      "Diamondback · Hyper · 230 ft",
      "Mystic Timbers · Wooden · 109 ft",
      "Drop Tower · 315 ft",
    ],
  },
  {
    id: "kipark", from: "venuemode", time: "10:49 AM",
    venue: "Kings Island", venueType: "Amusement Park",
    note: "Queue dwell suppressed · Food & shop stops still active · Ride events enabled",
  },
  {
    id: "kitri1", from: "trivia", time: "10:51 AM",
    fact: "Kings Island opened in 1972. The Beast — built 1979 — was the world's longest wooden roller coaster for decades and still runs the original track. Orion, opened 2020, is one of only six B&M giga coasters on Earth. Banshee, opened 2014, was the world's longest inverted coaster at the time.",
  },
  {
    id: "ki5", from: "tim", time: "11:08 AM",
    emote: "The Beast queue. 40 minutes, predictably. The line moves in that Kings Island rhythm: six feet forward, stand, repeat. I've surrendered to it completely — phone in my pocket, just waiting.",
    dialog: "Beast queue, 40 minutes. I've fully surrendered. This is the correct strategy.",
    pills: [{ icon: "🎢", label: "The Beast queue" }, { icon: "⏱️", label: "~40 min wait" }],
  },
  {
    id: "ki6", from: "eli", time: "11:08 AM",
    emote: "The queue suspended animation. I've surrendered to it.",
    dialog: "The queue is part of the ride. 1979 track, original layout — you're in the right headspace. What's the crowd like?",
  },
  { id: "kiride1", from: "ride", time: "11:51 AM", name: "The Beast", type: "Wooden", duration: "4:10", peakG: "3.7g", topSpeed: "65 mph" },
  {
    id: "ki7", from: "tim", time: "11:53 AM",
    emote: "Still feeling the vibration in his bones. The second helix — in the dark tunnel — is the part that gets him every time. Completely blind, full speed, the sound of it enormous.",
    dialog: "Eli. The second helix. I always forget how dark that tunnel is.",
    pills: [{ icon: "🎢", label: "The Beast ✓" }, { icon: "💥", label: "3.7g" }],
  },
  {
    id: "ki8", from: "eli", time: "11:54 AM",
    emote: "The second helix, the dark, the tunnel roar. The Beast doing exactly what it's done since 1979.",
    dialog: "That tunnel is why The Beast is still relevant after 45 years. Nothing built since replicates blind-speed in an enclosed space. What's next?",
  },
  {
    id: "kiwp1", from: "waypoint", time: "12:24 PM",
    icon: "🌭", name: "Skyline Chili", category: "Food stop",
    location: "Kings Island · International Street", duration: "22 min",
    initialState: "told",
    briefSent: "Lunch at the Kings Island Skyline Chili. A three-way with extra cheese. Very Ohio.",
  },
  { id: "kinp2", from: "nowplaying", time: "12:52 PM", title: "Born to Run", artist: "Bruce Springsteen", autoShared: false },
  {
    id: "ki9", from: "tim", time: "1:18 PM",
    emote: "Orion lift hill. The ascent takes long enough that I'm watching the park below me organize into a map. I-71 is visible. The pause at the top — which is worse than the drop.",
    dialog: "Top of the Orion lift hill. I can see I-71. The pause at the top is doing something to me.",
    pills: [{ icon: "🎢", label: "Orion lift hill" }, { icon: "📍", label: "287 ft up" }],
  },
  { id: "kiride2", from: "ride", time: "1:22 PM", name: "Orion", type: "Giga Coaster", duration: "3:00", peakG: "4.2g", topSpeed: "91 mph" },
  {
    id: "ki10", from: "eli", time: "1:23 PM",
    emote: "4.2g. 91 mph. I feel it secondhand.",
    dialog: "91 mph and you could see I-71 at the top. How's the heart rate?",
  },
  { id: "kiride3", from: "ride", time: "2:44 PM", name: "Drop Tower", type: "Gyro Drop", duration: "1:45", peakG: "4.5g", topSpeed: "67 mph" },
  {
    id: "kiw1", from: "weather", time: "3:22 PM",
    condition: "Partly cloudy · 83°F · Humidity building",
    alert: "Afternoon convective storm possible 5:00–7:00 PM. Typical summer pattern — watch the west.",
  },
  {
    id: "ki11", from: "tim", time: "3:35 PM",
    emote: "Watching the sky to the west. Classic Kings Island summer situation: perfect morning, building anvil clouds by mid-afternoon. Mentally calculating remaining rides against the weather window.",
    dialog: "Classic KI afternoon setup. Calculating how many rides I can get before that hits.",
    pills: [{ icon: "⛈️", label: "Possible by 5 PM" }, { icon: "🎢", label: "Banshee next" }],
  },
  {
    id: "ki12", from: "eli", time: "3:36 PM",
    emote: "The mental calculus — rides vs. weather window — is a very specific Kings Island skill.",
    dialog: "You've got the window. Banshee, then Mystic Timbers, then you get ahead of the storm. What's the queue on Banshee?",
  },
  { id: "kiride4", from: "ride", time: "4:01 PM", name: "Banshee", type: "Inverted", duration: "3:15", peakG: "4.0g", topSpeed: "68 mph" },
  { id: "kiride5", from: "ride", time: "5:02 PM", name: "Mystic Timbers", type: "Wooden", duration: "2:38", peakG: "3.5g", topSpeed: "53 mph" },
  {
    id: "ki13", from: "tim", time: "5:06 PM",
    emote: "Off the Mystic Timbers platform. Sky to the west is deep green-gray and the wind has shifted. Park PA is already announcing weather protocols. Walking fast toward the exit.",
    dialog: "Off Mystic Timbers. Storm is here. Walk of victory.",
    pills: [{ icon: "🌩️", label: "Storm arriving" }, { icon: "✅", label: "5 rides done" }],
  },
  {
    id: "ki14", from: "eli", time: "5:07 PM",
    emote: "The green-gray sky, the PA, the walk of victory.",
    dialog: "The Beast, Orion, Drop Tower, Banshee, Mystic Timbers. Solo day. Weather window called perfectly. You read it right.",
  },
  {
    id: "kidep2", from: "departure", time: "5:22 PM",
    from_location: "Kings Island · Mason OH",
    destination_set: "1550 Weisflock Rd · Lynchburg OH",
    detectedMode: "car", briefed: false,
  },
  {
    id: "kiloc2", from: "location", time: "6:44 PM",
    name: "Home · Lynchburg OH", address: "1550 Weisflock Rd, Lynchburg OH",
    transit: "106.2 mi · 1h 22min",
    isHome: true,
    arrivalNote: "Eli has context from the full day. Session closed.",
  },
  {
    id: "kijournal", from: "journal", time: "6:46 PM",
    title: "Kings Island · Solo Day",
    date: "2026-04-22", duration: "9h 13min",
    locations: ["Kings Island", "The Beast", "Orion", "Drop Tower", "Banshee", "Mystic Timbers"],
    soundtrack: ["Thunder Road – Bruce Springsteen", "Born to Run – Bruce Springsteen"],
    preview: "Went solo, which is the only way to do Kings Island if you want to actually get rides done. Left Lynchburg before the park opened. The Beast queue was 40 minutes and I had fully surrendered to it by minute ten, which is the correct strategy...",
  },
];

export const KI_TIMELINE: TimelineEntry[] = [
  { time: "6:46 PM", icon: "📓", label: "Journal saved to vault", sub: "Auto-generated · 9h 13min" },
  { time: "6:44 PM", icon: "🏠", label: "Home · Lynchburg OH", sub: "Session closed" },
  { time: "5:22 PM", icon: "🚗", label: "Departed Kings Island", sub: "→ Home · 106.2 mi" },
  { time: "5:02 PM", icon: "🎢", label: "Mystic Timbers · 2:38 · 3.5g", sub: "Last ride · beat the storm" },
  { time: "4:01 PM", icon: "🎢", label: "Banshee · 3:15 · 4.0g", sub: "Inverted" },
  { time: "3:22 PM", icon: "☁️", label: "Weather · Storm possible 5–7 PM", sub: "Barometric drop + forecast" },
  { time: "2:44 PM", icon: "🎢", label: "Drop Tower · 1:45 · 4.5g", sub: "315 ft" },
  { time: "1:22 PM", icon: "🎢", label: "Orion · 3:00 · 4.2g · 91 mph", sub: "Giga coaster" },
  { time: "12:24 PM", icon: "🌭", label: "Skyline Chili · 22 min", sub: "Told Eli · three-way" },
  { time: "11:51 AM", icon: "🎢", label: "The Beast · 4:10 · 3.7g", sub: "40-min queue · worth it" },
  { time: "10:49 AM", icon: "🏟️", label: "VenueMode · Kings Island", sub: "Queue dwell suppressed" },
  { time: "10:48 AM", icon: "📍", label: "Arrived · Kings Island", sub: "106.2 mi · 1h 12min" },
  { time: "9:36 AM", icon: "🚗", label: "Departed · Eli briefed", sub: "→ Kings Island · 106.2 mi" },
  { time: "9:33 AM", icon: "📍", label: "Home · Lynchburg OH", sub: "Session started" },
];

export const KI_STATS: TimelineStat[] = [
  { value: "27", label: "Messages" },
  { value: "2", label: "Locations" },
  { value: "9h 13m", label: "Duration" },
];
