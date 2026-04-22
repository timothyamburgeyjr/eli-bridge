import type { ChatItem } from "@/components/chat/ChatStream";
import type { TimelineEntry, TimelineStat } from "@/components/session/SessionTimeline";

export const CZ_MESSAGES: ChatItem[] = [
  {
    id: "cz1", from: "tim", time: "9:14 AM",
    emote: "Hank's truck, early again. Morning already warm — mid-70s. I've got the camera. Luna gives us her long look from the porch.",
    dialog: "Eli, Hank and I are heading to the Cincinnati Zoo. He's been researching Fiona since last night.",
    pills: [
      { icon: "📍", label: "Lynchburg OH" },
      { icon: "🌤️", label: "74°F" },
      { icon: "📷", label: "Camera" },
      { icon: "🎭", label: "Hank" },
    ],
  },
  {
    id: "cz2", from: "eli", time: "9:15 AM",
    emote: "Fiona research at 9 AM. Hank is in deep preparation mode.",
    dialog: "Fiona prep at 9 AM is very Hank. I hope you're both ready — that hippo has a parasocial relationship with Ohio she is fully committed to.",
  },
  {
    id: "czdep", from: "departure", time: "9:18 AM",
    from_location: "Lynchburg OH",
    destination_set: "Cincinnati Zoo · 3400 Vine St, Cincinnati OH",
    detectedMode: "car", briefed: true,
  },
  {
    id: "cz3", from: "tim", time: "10:02 AM", isDrive: true,
    emote: "I-71 south. Cincinnati skyline starting to show. The zoo exit is close.",
    dialog: "Almost there. Should be a good crowd day — weather is perfect.",
    pills: [{ icon: "🚗", label: "68 mph" }, { icon: "🎙️", label: "Voice" }],
  },
  {
    id: "cz4", from: "eli", time: "10:02 AM", isDrive: true,
    emote: "I-71 and the zoo almost there. Hank beside you with his research ready.",
    dialog: "Fiona will be at Hippo Cove if she's in the mood — she does have moods. The underwater window is worth the wait.",
  },
  { id: "cznp1", from: "nowplaying", time: "10:11 AM", title: "River", artist: "Leon Bridges", autoShared: true },
  {
    id: "czloc1", from: "location", time: "10:48 AM",
    name: "Cincinnati Zoo & Botanical Garden",
    category: "Zoo · $$", rating: "4.8★",
    hours: "Open · Closes 6 PM", address: "3400 Vine St, Cincinnati OH",
    transit: "84.6 mi · 1h 30min",
    arrivalNote: "You talked on the drive — Eli has the Fiona context. Brief adds arrival + highlights.",
    menuHighlights: [
      "Hippo Cove · Fiona",
      "Jungle Trails · Orangutans & Bonobos",
      "Gorilla World",
      "Cheetah Encounter",
      "Night Hunters · Nocturnal",
      "Wings of the World · Aviary",
      "African Safari · Rhinos & Giraffes",
      "Manatee Springs",
      "World of the Insect",
    ],
  },
  {
    id: "cztri1", from: "trivia", time: "10:51 AM",
    fact: "The Cincinnati Zoo is the second oldest in the United States, founded 1875. Fiona — born January 2017, six weeks premature at 29 pounds — became the zoo's greatest ambassador, with 185 million social media impressions in her first year. Jungle Trails, opened 1993, was the first naturalistic great ape habitat built in the United States.",
  },
  {
    id: "cz5", from: "tim", time: "11:06 AM",
    emote: "Hippo Cove. The underwater viewing window is thick glass and Fiona is on the other side — enormous, weightless in the water. Hank has both hands flat on the glass.",
    dialog: "Eli. She's right there. Hank has his hands on the glass.",
    pills: [{ icon: "📷", label: "4 photos" }, { icon: "📍", label: "Hippo Cove" }, { icon: "🦛", label: "Fiona" }],
  },
  {
    id: "cz6", from: "eli", time: "11:07 AM",
    emote: "The glass. Fiona. Hank's hands.",
    dialog: "She weighs 1,700 pounds and moves like she doesn't. Get the shot where she's looking at the camera — she does that on purpose.",
  },
  {
    id: "cz7", from: "tim", time: "11:48 AM",
    emote: "Jungle Trails. Dense humid air. An orangutan is sitting directly above the path, looking down with exactly the expression that makes you feel evaluated.",
    dialog: "Jungle Trails. There's an orangutan directly above us judging every decision we've ever made.",
    pills: [{ icon: "📷", label: "2 photos" }, { icon: "📍", label: "Jungle Trails" }],
  },
  {
    id: "cz8", from: "eli", time: "11:49 AM",
    emote: "The ceiling-level orangutan. The humidity. The judgment.",
    dialog: "Orangutan judgment is the most accurate judgment. Whatever he's decided about you is probably correct.",
  },
  {
    id: "cztri2", from: "trivia", time: "12:14 PM",
    fact: "Night Hunters reverses the day/night cycle — the building is dark during zoo hours, with dim red lighting, so nocturnal animals are active. The fennec fox here weighs under 3 pounds. The naked mole rat colony is one of the largest on public display anywhere.",
  },
  {
    id: "cz9", from: "tim", time: "12:22 PM",
    emote: "Night Hunters. Eyes take a full minute to adjust. When they do: a fennec fox with ears like satellite dishes sitting three feet away, motionless, watching. Everyone in the building is whispering.",
    dialog: "Night Hunters. A fennec fox the size of a kitten is staring at me from three feet away. Everyone is whispering.",
    pills: [{ icon: "📍", label: "Night Hunters" }, { icon: "🦊", label: "Fennec Fox" }],
  },
  {
    id: "cz10", from: "eli", time: "12:23 PM",
    emote: "The dark building, the fox, the collective whisper reflex.",
    dialog: "Fennec foxes trigger the whispering instinct universally. Nobody decides — it just happens. How big are those ears in person?",
  },
  {
    id: "czwp1", from: "waypoint", time: "12:58 PM",
    icon: "🍽️", name: "Comet Eatery", category: "Zoo restaurant · Central Area",
    location: "Cincinnati Zoo", duration: "32 min",
    initialState: "told",
    briefSent: "At Comet Eatery with Hank.",
  },
  {
    id: "cz11", from: "tim", time: "1:44 PM",
    emote: "Cheetah Encounter. Two cheetahs moving along the edge of the habitat — not pacing, actually moving — that ground-covering lope that looks effortless until you register how fast the scenery is changing. The crowd has gone quiet.",
    dialog: "Cheetahs. Eli, they're actually moving. Not pacing — moving. It resets your understanding of speed.",
    pills: [{ icon: "📷", label: "3 photos" }, { icon: "📍", label: "Cheetah Encounter" }],
  },
  {
    id: "cz12", from: "eli", time: "1:45 PM",
    emote: "The quiet that falls when something is moving that fast with that little effort.",
    dialog: "70 mph in 3 seconds from standing. The crowd went quiet because there's no other response.",
  },
  { id: "cznp2", from: "nowplaying", time: "2:18 PM", title: "Blackbird", artist: "The Beatles", autoShared: false },
  {
    id: "cz13", from: "tim", time: "2:24 PM",
    emote: "Wings of the World — the free-flight aviary. Immediately overwhelming: scarlet macaws, toucans, birds at eye level in every direction. Something fast goes past Tim's ear and he doesn't flinch, which surprises him.",
    dialog: "Wings of the World. Birds everywhere and I didn't flinch when one flew past my ear.",
    pills: [{ icon: "📷", label: "5 photos" }, { icon: "📍", label: "Wings of the World" }, { icon: "🦜", label: "Free-flight" }],
  },
  {
    id: "cz14", from: "eli", time: "2:25 PM",
    emote: "The aviary chaos, the not-flinching.",
    dialog: "Not flinching in a free-flight aviary is a milestone. The toucans — did you see them eat? They throw the food up and catch it.",
  },
  {
    id: "cztri3", from: "trivia", time: "3:02 PM",
    fact: "Cincinnati Zoo's African Safari is home to Nile giraffes, southern white rhinos, and African painted dogs — one of the most endangered carnivores in the world, with only about 6,600 remaining. The zoo produced the first Sumatran rhino born in captivity in 112 years.",
  },
  {
    id: "cz15", from: "tim", time: "3:14 PM",
    emote: "African Safari. A giraffe is eating from a feeder ten feet away and is so tall I have to tilt my head back to see where the neck ends. Hank has gone quiet.",
    dialog: "A giraffe is eating directly in front of us and it's taller than I expected, and I expected tall.",
    pills: [{ icon: "📷", label: "4 photos" }, { icon: "📍", label: "African Safari" }, { icon: "🦒", label: "Feeding" }],
  },
  {
    id: "cz16", from: "eli", time: "3:15 PM",
    emote: "The tilt of the head, Hank going quiet.",
    dialog: "Giraffes always win. No matter how tall you're prepared for, it's taller. What was Hank's reaction?",
  },
  {
    id: "cz17", from: "tim", time: "3:52 PM",
    emote: "Manatee Springs. The water is crystal clear. A manatee the size of a small car is floating near the glass doing absolutely nothing with complete contentment. I've been standing here for five minutes.",
    dialog: "There's a manatee just existing at maximum peace and I've been watching for five minutes.",
    pills: [{ icon: "📍", label: "Manatee Springs" }, { icon: "🐄", label: "Sea Cow Vibes" }],
  },
  {
    id: "cz18", from: "eli", time: "3:53 PM",
    emote: "The clear water, the enormous contentment, five minutes of just watching.",
    dialog: "Manatees are the most philosophically correct animals. Nothing to prove. Just floating. You could learn from this.",
  },
  {
    id: "czjournal", from: "journal", time: "4:15 PM",
    title: "Cincinnati Zoo with Hank",
    date: "2026-04-22", duration: "7h 01min",
    locations: ["Cincinnati Zoo", "Hippo Cove · Fiona", "Jungle Trails", "Night Hunters", "Cheetah Encounter", "Wings of the World", "African Safari", "Manatee Springs"],
    soundtrack: ["River – Leon Bridges", "Blackbird – The Beatles"],
    preview: "Hank had been researching Fiona since last night — I didn't know that until he started reading me her vital statistics at 68 mph on I-71. The Cincinnati Zoo is the second oldest zoo in the country and it earns that designation on every level. We started at Hippo Cove because obviously we started at Hippo Cove...",
  },
];

export const CZ_TIMELINE: TimelineEntry[] = [
  { time: "4:15 PM", icon: "📓", label: "Journal saved to vault", sub: "Auto-generated · 7h 01min" },
  { time: "3:52 PM", icon: "📍", label: "Manatee Springs", sub: "Maximum contentment" },
  { time: "3:14 PM", icon: "📍", label: "African Safari · Giraffes & Rhinos", sub: "4 photos" },
  { time: "2:24 PM", icon: "📍", label: "Wings of the World · Aviary", sub: "5 photos · didn't flinch" },
  { time: "2:18 PM", icon: "🎵", label: "Blackbird – The Beatles", sub: "Not shared" },
  { time: "1:44 PM", icon: "📍", label: "Cheetah Encounter", sub: "3 photos · crowd went quiet" },
  { time: "12:58 PM", icon: "🍽️", label: "Lunch · Comet Eatery · 32 min", sub: "Told Eli" },
  { time: "12:22 PM", icon: "📍", label: "Night Hunters · Fennec Fox", sub: "Everyone whispered" },
  { time: "11:48 AM", icon: "📍", label: "Jungle Trails · Orangutans", sub: "2 photos · judged" },
  { time: "11:06 AM", icon: "🦛", label: "Hippo Cove · Fiona", sub: "4 photos · Hank had hands on glass" },
  { time: "10:51 AM", icon: "📖", label: "Trivia · Cincinnati Zoo", sub: "Fiona · conservation · Jungle Trails" },
  { time: "10:48 AM", icon: "📍", label: "Arrived · Cincinnati Zoo", sub: "84.6 mi · 1h 30min" },
  { time: "10:11 AM", icon: "🎵", label: "River – Leon Bridges", sub: "Auto-shared" },
  { time: "9:18 AM", icon: "🚗", label: "Departed · Eli briefed", sub: "→ Cincinnati Zoo · 84.6 mi" },
  { time: "9:14 AM", icon: "📍", label: "Home · Lynchburg OH", sub: "Session started" },
];

export const CZ_STATS: TimelineStat[] = [
  { value: "20", label: "Messages" },
  { value: "9", label: "Exhibits" },
  { value: "7h 01m", label: "Duration" },
];
