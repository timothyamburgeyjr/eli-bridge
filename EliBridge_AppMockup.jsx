import { useState, useRef, useEffect } from "react";

// ── Design tokens ─────────────────────────────────────────────────
const C = {
  bg:        "#18161A",
  surface:   "#201E24",
  raised:    "#2A2830",
  border:    "#3C3847",
  accent:    "#7C5CFF",
  accentDim: "#7C5CFF20",
  green:     "#22C55E",
  amber:     "#F59E0B",
  red:       "#EF4444",
  sky:       "#38BDF8",
  emote:     "#A78BFA",
  text:      "#F0EEF8",
  textDim:   "#A09DB0",
  muted:     "#5C5870",
  timBubble: "#3D2F70",
  eliBubble: "#252333",
  eliGrad:   "linear-gradient(135deg, #4B1D8E 0%, #1D4B8E 100%)",
};

// ═══════════════════════════════════════════════════════════════════
// SCENARIO 1 — Yellow Springs with Hank
// Lynchburg → US-68 N → Yellow Springs → Xenia Ave main street
// Shows: open-ended walking mode after arrival, WaypointCards (all 3
// states), SessionJournalCard, Now Playing trip soundtrack
// ═══════════════════════════════════════════════════════════════════
const MESSAGES_YS = [
  { id:"ys1", from:"tim", time:"11:08 AM",
    emote:"Hank's truck is idling in the driveway — he got here fifteen minutes early, which means he's been excited about this longer than he admitted. Luna is doing her full farewell routine on the porch. Morning is clear, low 60s, light breeze.",
    dialog:"Eli, heading to Yellow Springs with Hank. Perfect day for main street.",
    pills:[{icon:"📍",label:"Lynchburg OH"},{icon:"🌤️",label:"62°F"},{icon:"🎭",label:"Hank"}],
  },
  { id:"ys2", from:"eli", time:"11:09 AM",
    emote:"I picture Hank's truck in the driveway, fifteen minutes early and pretending not to be.",
    dialog:"Hank showed up early. He's been thinking about the comic shop since Tuesday — you know that, right?",
  },
  { id:"ysdep", from:"departure", time:"11:12 AM",
    from_location:"Lynchburg OH",
    destination_set:"Yellow Springs OH · Xenia Ave",
    detectedMode:"car", briefed:true,
  },
  // Phase 2: ambient mic + People system would detect Hank talking automatically —
  // on-device speaker embeddings ID his voice and pass labeled transcript to Gemini.
  // For now Tim mentions it; in Phase 2 an AmbientCard fires: "🎤 Hank · Saga discussion · context added"
  { id:"ys3", from:"tim", time:"11:29 AM", isDrive:true,
    emote:"US-68 north. The Ohio flatness doing its thing. Clear April morning, fields still winter-pale. The labradorite I picked up last time is still somewhere in my jacket.",
    dialog:"Good day for this drive. Nice morning.",
    pills:[{icon:"🚗",label:"58 mph"},{icon:"🎙️",label:"Voice"}],
  },
  { id:"ys4", from:"eli", time:"11:29 AM", isDrive:true,
    emote:"US-68 north in April. The flat fields and the clear sky and Hank somewhere in the cab beside you.",
    dialog:"That's a good road on a clear morning. What's Hank's agenda today — he seemed ready.",
  },
  { id:"ysnp1", from:"nowplaying", time:"11:38 AM", title:"Ohio", artist:"Crosby, Stills, Nash & Young", autoShared:true },
  { id:"ysloc1", from:"location", time:"11:54 AM",
    name:"Yellow Springs · Xenia Ave",
    category:"Historic Village · Main Street", rating:"4.9★",
    hours:"Shops open · 10 AM–6 PM", address:"Xenia Ave, Yellow Springs OH",
    transit:"42.3 mi · 42 min", detectedMode:"car",
    hadInteraction:true,
    arrivalNote:"You talked on the drive — Eli has context. Brief adds arrival + town detail.",
    menuHighlights:["Dark Star Comics · 237 Xenia Ave","The Emporium · metaphysical · Xenia Ave","Winds Cafe · upscale · Xenia Ave","Ha Ha Pizza · classic · Corry St"],
  },
  { id:"ystri1", from:"trivia", time:"11:56 AM",
    fact:"Yellow Springs is Dave Chappelle's home base — he's been here since the early 2000s and is woven into the community. Antioch College, founded 1850, sits on the edge of town and has been a hub of progressive thought for 175 years. Glen Helen Nature Preserve — 1,000 acres of old-growth forest — borders the village. Consistently voted one of the best small towns in America.",
  },
  { id:"yswp1", from:"waypoint", time:"12:08 PM",
    icon:"📚", name:"Dark Star Comics", category:"Comic shop · 237 Xenia Ave",
    location:"Yellow Springs", duration:"31 min",
    openSession:true,
    initialState:"told",
    briefSent:"At Dark Star Comics with Hank.",
  },
  { id:"ys5", from:"tim", time:"12:41 PM",
    emote:"Hank is at the counter with three issues of Saga and a graphic novel about a Victorian magician. He keeps showing me things. I bought one issue and immediately felt the gap between our investment levels.",
    dialog:"Eli, Hank found his Saga issue. I've never seen him like this. He's practically glowing.",
    pills:[{icon:"📚",label:"Dark Star Comics"},{icon:"📍",label:"Yellow Springs"}],
  },
  { id:"ys6", from:"eli", time:"12:42 PM",
    emote:"The image of Hank practically vibrating at a comic shop counter is one I'll keep.",
    dialog:"That's the face of a man who's been patient for six months and finally got paid. What did you get?",
  },
  // AudioSnap: Tim snapped a photo of Hank at the counter. The 15-second
  // audio buffer captured the ambient shop sounds and sent them to Gemini
  // alongside the image for a richer emote.
  { id:"ysaudio1", from:"audiosnap", time:"12:42 PM",
    description:"Shop ambience — Hank talking to the owner about Silver Age pricing, pages flipping, muffled music from the back room.",
  },
  // People system: on-device model detects an unrecognized voice. Tim can
  // identify the person to enroll them in the People system, or ignore.
  { id:"ysunk1", from:"unknownperson", time:"12:45 PM",
    variant:"voice",
    quote:"\"You should check out the back wall — we just got a bunch of Silver Age stuff in.\"",
  },
  // People system: on-device ML Kit + MobileFaceNet detects an unrecognized
  // face in Tim's photo. Face variant of UnknownPersonCard with cross-modal linking.
  { id:"ysface1", from:"unknownperson", time:"12:48 PM",
    variant:"face",
    faceNote:"Person in your photo at Dark Star Comics",
    confidence:"0.91",
    suggestion:"Hank",
  },
  { id:"yswp2", from:"waypoint", time:"12:58 PM",
    icon:"🔮", name:"The Emporium", category:"Metaphysical shop · crystals & tarot",
    location:"Xenia Ave · Yellow Springs", duration:"24 min",
    openSession:true,
    initialState:"pending",
  },
  { id:"ys7", from:"tim", time:"1:24 PM",
    emote:"The shop is dense with crystals, tarot decks, incense. Hank has taken a tarot deck off the shelf and is asking the owner questions with complete sincerity. I found a piece of labradorite that catches the light in an interesting way.",
    dialog:"Hank is consulting a tarot deck with total seriousness. I found a rock I like.",
    pills:[{icon:"🔮",label:"The Emporium"},{icon:"🪨",label:"Labradorite"}],
  },
  { id:"ys8", from:"eli", time:"1:25 PM",
    emote:"Hank approaching tarot with sincerity. Me finding a rock. Both in our element.",
    dialog:"Hank doing tarot seriously is actually the correct approach. And a labradorite — good choice. It has that color-shift thing?",
  },
  { id:"yswp3", from:"waypoint", time:"1:42 PM",
    icon:"🍕", name:"Ha Ha Pizza", category:"Yellow Springs institution · Corry St",
    location:"Yellow Springs", duration:"38 min",
    openSession:true,
    initialState:"told",
    briefSent:"At Ha Ha Pizza.",
  },
  { id:"ysnp2", from:"nowplaying", time:"2:31 PM", title:"There Is A Light That Never Goes Out", artist:"The Smiths", autoShared:false },
  { id:"ysdep2", from:"departure", time:"2:48 PM",
    from_location:"Yellow Springs OH",
    destination_set:"1550 Weisflock Rd · Lynchburg OH",
    detectedMode:"car", briefed:false,
  },
  { id:"ys9", from:"tim", time:"2:55 PM", isDrive:true,
    emote:"US-68 south. Hank has the Saga issues on his lap and is already reading. The afternoon has gone golden. The labradorite is in Tim's shirt pocket.",
    dialog:"Hank is reading in the passenger seat. Mission accomplished.",
    pills:[{icon:"🚗",label:"58 mph"},{icon:"📚",label:"Hank Reading"}],
  },
  { id:"ys10", from:"eli", time:"2:56 PM", isDrive:true,
    emote:"The golden afternoon, Hank reading, the labradorite in a shirt pocket. A good Yellow Springs day.",
    dialog:"That's exactly what a Yellow Springs day is supposed to look like. How's the rock?",
  },
  { id:"ysloc2", from:"location", time:"3:34 PM",
    name:"Home · Lynchburg OH", address:"1550 Weisflock Rd, Lynchburg OH",
    transit:"42.3 mi · 46 min", detectedMode:"car",
    hadInteraction:true,
    arrivalNote:"You talked on the drive home — Eli has the full day already. Brief closes the session.",
    isHome:true,
  },
  { id:"ysjournal", from:"journal", time:"3:36 PM",
    title:"Yellow Springs with Hank",
    date:"2026-04-21", duration:"4h 26min",
    locations:["Yellow Springs OH","Dark Star Comics","The Emporium","Ha Ha Pizza"],
    soundtrack:["Ohio – Crosby, Stills, Nash & Young","There Is A Light That Never Goes Out – The Smiths"],
    preview:"Left Lynchburg around 11 with Hank, who showed up fifteen minutes early and hadn't stopped talking since — about Saga, specifically, the issue he's been hunting since October. US-68 north in the clear April morning, Ohio doing its flat, honest thing...",
  },
];

const TIMELINE_YS = [
  { time:"3:36 PM", icon:"📓", label:"Journal saved to vault",             sub:"Auto-generated · 4h 26min session" },
  { time:"3:34 PM", icon:"🏠", label:"Home · Lynchburg OH",                sub:"Session closed" },
  { time:"2:48 PM", icon:"🚗", label:"Departed Yellow Springs",            sub:"→ Home · 42.3 mi" },
  { time:"1:42 PM", icon:"🍕", label:"Ha Ha Pizza · 38 min",               sub:"Saved for arrival brief" },
  { time:"12:58 PM", icon:"🔮", label:"The Emporium · 24 min",             sub:"Pending (try the buttons)" },
  { time:"12:08 PM", icon:"📚", label:"Dark Star Comics · 31 min",         sub:"Told Eli · Hank found the Saga" },
  { time:"11:56 AM", icon:"📖", label:"Trivia · Yellow Springs",           sub:"Chappelle · Antioch · Glen Helen" },
  { time:"11:54 AM", icon:"📍", label:"Arrived · Yellow Springs",          sub:"42.3 mi · 42 min" },
  { time:"11:38 AM", icon:"🎵", label:"Ohio – CSNY",                       sub:"Auto-shared" },
  { time:"11:12 AM", icon:"🚗", label:"Departed · Eli briefed",            sub:"→ Yellow Springs · 42.3 mi" },
  { time:"11:08 AM", icon:"📍", label:"Home · Lynchburg OH",               sub:"Session started" },
];

// ═══════════════════════════════════════════════════════════════════
// SCENARIO 2 — Cincinnati Zoo with Hank
// Lynchburg → I-71 S → Cincinnati Zoo · session ends at the zoo
// Shows: full exhibit walk-through, Fiona, all card types, SessionJournalCard
// ═══════════════════════════════════════════════════════════════════
const MESSAGES_CZ = [
  { id:"cz1", from:"tim", time:"9:14 AM",
    emote:"Hank's truck, early again. Morning already warm — mid-70s. I've got the camera. Luna gives us her long look from the porch.",
    dialog:"Eli, Hank and I are heading to the Cincinnati Zoo. He's been researching Fiona since last night.",
    pills:[{icon:"📍",label:"Lynchburg OH"},{icon:"🌤️",label:"74°F"},{icon:"📷",label:"Camera"},{icon:"🎭",label:"Hank"}],
  },
  { id:"cz2", from:"eli", time:"9:15 AM",
    emote:"Fiona research at 9 AM. Hank is in deep preparation mode.",
    dialog:"Fiona prep at 9 AM is very Hank. I hope you're both ready — that hippo has a parasocial relationship with Ohio she is fully committed to.",
  },
  { id:"czdep", from:"departure", time:"9:18 AM",
    from_location:"Lynchburg OH",
    destination_set:"Cincinnati Zoo · 3400 Vine St, Cincinnati OH",
    detectedMode:"car", briefed:true,
  },
  // Phase 2: People system would pick up Hank sharing Fiona facts aloud —
  // Gemini identifies his voice, adds the context, Eli responds as if he heard it too.
  { id:"cz3", from:"tim", time:"10:02 AM", isDrive:true,
    emote:"I-71 south. Cincinnati skyline starting to show. The zoo exit is close.",
    dialog:"Almost there. Should be a good crowd day — weather is perfect.",
    pills:[{icon:"🚗",label:"68 mph"},{icon:"🎙️",label:"Voice"}],
  },
  { id:"cz4", from:"eli", time:"10:02 AM", isDrive:true,
    emote:"I-71 and the zoo almost there. Hank beside you with his research ready.",
    dialog:"Fiona will be at Hippo Cove if she's in the mood — she does have moods. The underwater window is worth the wait.",
  },
  { id:"cznp1", from:"nowplaying", time:"10:11 AM", title:"River", artist:"Leon Bridges", autoShared:true },
  { id:"czloc1", from:"location", time:"10:48 AM",
    name:"Cincinnati Zoo & Botanical Garden",
    category:"Zoo · $$", rating:"4.8★",
    hours:"Open · Closes 6 PM", address:"3400 Vine St, Cincinnati OH",
    transit:"84.6 mi · 1h 30min", detectedMode:"car",
    hadInteraction:true,
    arrivalNote:"You talked on the drive — Eli has the Fiona context. Brief adds arrival + highlights.",
    menuHighlights:["Hippo Cove · Fiona","Jungle Trails · Orangutans & Bonobos","Gorilla World","Cheetah Encounter","Night Hunters · Nocturnal","Wings of the World · Aviary","African Safari · Rhinos & Giraffes","Manatee Springs","World of the Insect"],
  },
  { id:"cztri1", from:"trivia", time:"10:51 AM",
    fact:"The Cincinnati Zoo is the second oldest in the United States, founded 1875. It has led conservation breakthroughs on Sumatran rhinos, white rhinos, and painted dogs. Fiona — born January 2017, six weeks premature at 29 pounds — became the zoo's greatest ambassador, with 185 million social media impressions in her first year. Jungle Trails, opened 1993, was the first naturalistic great ape habitat built in the United States.",
  },
  { id:"cz5", from:"tim", time:"11:06 AM",
    emote:"Hippo Cove. The underwater viewing window is thick glass and Fiona is on the other side — enormous, weightless in the water. Hank has both hands flat on the glass.",
    dialog:"Eli. She's right there. Hank has his hands on the glass.",
    pills:[{icon:"📷",label:"4 photos"},{icon:"📍",label:"Hippo Cove"},{icon:"🦛",label:"Fiona"}],
  },
  { id:"cz6", from:"eli", time:"11:07 AM",
    emote:"The glass. Fiona. Hank's hands.",
    dialog:"She weighs 1,700 pounds and moves like she doesn't. Get the shot where she's looking at the camera — she does that on purpose.",
  },
  { id:"cz7", from:"tim", time:"11:48 AM",
    emote:"Jungle Trails. Dense humid air. An orangutan is sitting directly above the path, looking down with exactly the expression that makes you feel evaluated.",
    dialog:"Jungle Trails. There's an orangutan directly above us judging every decision we've ever made.",
    pills:[{icon:"📷",label:"2 photos"},{icon:"📍",label:"Jungle Trails"}],
  },
  { id:"cz8", from:"eli", time:"11:49 AM",
    emote:"The ceiling-level orangutan. The humidity. The judgment.",
    dialog:"Orangutan judgment is the most accurate judgment. Whatever he's decided about you is probably correct.",
  },
  { id:"cztri2", from:"trivia", time:"12:14 PM",
    fact:"Night Hunters reverses the day/night cycle — the building is dark during zoo hours, with dim red lighting, so nocturnal animals are active. The fennec fox here weighs under 3 pounds. The naked mole rat colony is one of the largest on public display anywhere. Your eyes take about 90 seconds to fully adjust at the entrance.",
  },
  { id:"cz9", from:"tim", time:"12:22 PM",
    emote:"Night Hunters. Eyes take a full minute to adjust. When they do: a fennec fox with ears like satellite dishes sitting three feet away, motionless, watching. Everyone in the building is whispering.",
    dialog:"Night Hunters. A fennec fox the size of a kitten is staring at me from three feet away. Everyone is whispering.",
    pills:[{icon:"📍",label:"Night Hunters"},{icon:"🦊",label:"Fennec Fox"}],
  },
  { id:"cz10", from:"eli", time:"12:23 PM",
    emote:"The dark building, the fox, the collective whisper reflex.",
    dialog:"Fennec foxes trigger the whispering instinct universally. Nobody decides — it just happens. How big are those ears in person?",
  },
  { id:"czwp1", from:"waypoint", time:"12:58 PM",
    icon:"🍽️", name:"Comet Eatery", category:"Zoo restaurant · Central Area",
    location:"Cincinnati Zoo", duration:"32 min",
    initialState:"told",
    briefSent:"At Comet Eatery with Hank.",
  },
  { id:"cz11", from:"tim", time:"1:44 PM",
    emote:"Cheetah Encounter. Two cheetahs moving along the edge of the habitat — not pacing, actually moving — that ground-covering lope that looks effortless until you register how fast the scenery is changing. The crowd has gone quiet.",
    dialog:"Cheetahs. Eli, they're actually moving. Not pacing — moving. It resets your understanding of speed.",
    pills:[{icon:"📷",label:"3 photos"},{icon:"📍",label:"Cheetah Encounter"}],
  },
  { id:"cz12", from:"eli", time:"1:45 PM",
    emote:"The quiet that falls when something is moving that fast with that little effort.",
    dialog:"70 mph in 3 seconds from standing. The crowd went quiet because there's no other response.",
  },
  { id:"cznp2", from:"nowplaying", time:"2:18 PM", title:"Blackbird", artist:"The Beatles", autoShared:false },
  { id:"cz13", from:"tim", time:"2:24 PM",
    emote:"Wings of the World — the free-flight aviary. Immediately overwhelming: scarlet macaws, toucans, birds at eye level in every direction. Something fast goes past Tim's ear and he doesn't flinch, which surprises him.",
    dialog:"Wings of the World. Birds everywhere and I didn't flinch when one flew past my ear.",
    pills:[{icon:"📷",label:"5 photos"},{icon:"📍",label:"Wings of the World"},{icon:"🦜",label:"Free-flight"}],
  },
  { id:"cz14", from:"eli", time:"2:25 PM",
    emote:"The aviary chaos, the not-flinching.",
    dialog:"Not flinching in a free-flight aviary is a milestone. The toucans — did you see them eat? They throw the food up and catch it.",
  },
  { id:"cztri3", from:"trivia", time:"3:02 PM",
    fact:"Cincinnati Zoo's African Safari is home to Nile giraffes, southern white rhinos, and African painted dogs — one of the most endangered carnivores in the world, with only about 6,600 remaining. The zoo produced the first Sumatran rhino born in captivity in 112 years. The white rhino conservation program here helped pull the southern white rhino back from near-extinction.",
  },
  { id:"cz15", from:"tim", time:"3:14 PM",
    emote:"African Safari. A giraffe is eating from a feeder ten feet away and is so tall I have to tilt my head back to see where the neck ends. Hank has gone quiet.",
    dialog:"A giraffe is eating directly in front of us and it's taller than I expected, and I expected tall.",
    pills:[{icon:"📷",label:"4 photos"},{icon:"📍",label:"African Safari"},{icon:"🦒",label:"Feeding"}],
  },
  { id:"cz16", from:"eli", time:"3:15 PM",
    emote:"The tilt of the head, Hank going quiet.",
    dialog:"Giraffes always win. No matter how tall you're prepared for, it's taller. What was Hank's reaction?",
  },
  { id:"cz17", from:"tim", time:"3:52 PM",
    emote:"Manatee Springs. The water is crystal clear. A manatee the size of a small car is floating near the glass doing absolutely nothing with complete contentment. I've been standing here for five minutes.",
    dialog:"There's a manatee just existing at maximum peace and I've been watching for five minutes.",
    pills:[{icon:"📍",label:"Manatee Springs"},{icon:"🐄",label:"Sea Cow Vibes"}],
  },
  { id:"cz18", from:"eli", time:"3:53 PM",
    emote:"The clear water, the enormous contentment, five minutes of just watching.",
    dialog:"Manatees are the most philosophically correct animals. Nothing to prove. Just floating. You could learn from this.",
  },
  { id:"czjournal", from:"journal", time:"4:15 PM",
    title:"Cincinnati Zoo with Hank",
    date:"2026-04-21", duration:"7h 01min",
    locations:["Cincinnati Zoo","Hippo Cove · Fiona","Jungle Trails","Night Hunters","Cheetah Encounter","Wings of the World","African Safari","Manatee Springs"],
    soundtrack:["River – Leon Bridges","Blackbird – The Beatles"],
    preview:"Hank had been researching Fiona since last night — I didn't know that until he started reading me her vital statistics at 68 mph on I-71. The Cincinnati Zoo is the second oldest zoo in the country and it earns that designation on every level. We started at Hippo Cove because obviously we started at Hippo Cove...",
  },
];

const TIMELINE_CZ = [
  { time:"4:15 PM", icon:"📓", label:"Journal saved to vault",             sub:"Auto-generated · 7h 01min" },
  { time:"3:52 PM", icon:"📍", label:"Manatee Springs",                    sub:"Maximum contentment" },
  { time:"3:14 PM", icon:"📍", label:"African Safari · Giraffes & Rhinos", sub:"4 photos" },
  { time:"2:24 PM", icon:"📍", label:"Wings of the World · Aviary",        sub:"5 photos · didn't flinch" },
  { time:"2:18 PM", icon:"🎵", label:"Blackbird – The Beatles",            sub:"Not shared" },
  { time:"1:44 PM", icon:"📍", label:"Cheetah Encounter",                  sub:"3 photos · crowd went quiet" },
  { time:"12:58 PM", icon:"🍽️", label:"Lunch · Comet Eatery · 32 min",   sub:"Told Eli" },
  { time:"12:22 PM", icon:"📍", label:"Night Hunters · Fennec Fox",        sub:"Everyone whispered" },
  { time:"11:48 AM", icon:"📍", label:"Jungle Trails · Orangutans",        sub:"2 photos · judged" },
  { time:"11:06 AM", icon:"🦛", label:"Hippo Cove · Fiona",                sub:"4 photos · Hank had hands on glass" },
  { time:"10:51 AM", icon:"📖", label:"Trivia · Cincinnati Zoo",           sub:"Fiona · conservation · Jungle Trails" },
  { time:"10:48 AM", icon:"📍", label:"Arrived · Cincinnati Zoo",          sub:"84.6 mi · 1h 30min" },
  { time:"10:11 AM", icon:"🎵", label:"River – Leon Bridges",              sub:"Auto-shared" },
  { time:"9:18 AM",  icon:"🚗", label:"Departed · Eli briefed",            sub:"→ Cincinnati Zoo · 84.6 mi" },
  { time:"9:14 AM",  icon:"📍", label:"Home · Lynchburg OH",               sub:"Session started" },
];

// ═══════════════════════════════════════════════════════════════════
// SCENARIO 3 — Kings Island · Solo Full Day
// Lynchburg → I-71 N → Kings Island · VenueMode · RideCards · drive home
// Shows: VenueMode (queue suppression), RideCard events, weather window,
//        coaster sequence, WaypointCard food stop (fires because restaurant
//        category; queue positions suppressed because no Places entry)
// VenueMode build note: Places API type=amusement_park → set flag.
//   Filter: WaypointCards only for food/cafe/store/bar types.
//   Ride detection: accelerometer burst >2.5g + GPS loop → RideCard.
//   Same VenueMode pattern applies: stadiums, malls, airports, fairgrounds.
// ═══════════════════════════════════════════════════════════════════
const MESSAGES_KI = [
  { id:"ki1", from:"tim", time:"9:33 AM",
    emote:"Solo. The car is packed with nothing — just Tim, keys, sunscreen. Kings Island hasn't opened yet when he leaves Lynchburg. Morning is perfect for it: low 70s, clear sky, low humidity.",
    dialog:"Eli, going to Kings Island solo today. Just me and the coasters.",
    pills:[{icon:"📍",label:"Lynchburg OH"},{icon:"🌤️",label:"72°F"},{icon:"🎢",label:"Solo day"}],
  },
  { id:"ki2", from:"eli", time:"9:34 AM",
    emote:"I settle in for a full coaster day. Solo Kings Island has a different energy — no group logistics, just me and whatever the line situation is.",
    dialog:"Solo coaster day is the purest form. No group vote on what's next. What's the plan?",
  },
  { id:"kidep", from:"departure", time:"9:36 AM",
    from_location:"Lynchburg OH",
    destination_set:"Kings Island · 6300 Kings Island Dr, Mason OH",
    detectedMode:"car", briefed:true,
  },
  { id:"ki3", from:"tim", time:"10:24 AM", isDrive:true,
    emote:"I-71 north through Cincinnati's outskirts. The Kings Island coasters are visible from the highway before the exit — Orion's tower, the Beast's lift hill.",
    dialog:"Can see the rides from the highway. Orion's tower is taller than I thought.",
    pills:[{icon:"🚗",label:"70 mph"},{icon:"🎙️",label:"Voice"}],
  },
  { id:"ki4", from:"eli", time:"10:24 AM", isDrive:true,
    emote:"The approach — coasters on the horizon from I-71.",
    dialog:"Orion is 287 feet. When you're on the lift hill looking down at I-71 you'll understand the tower. Enjoy the approach.",
  },
  { id:"kinp1", from:"nowplaying", time:"10:31 AM", title:"Thunder Road", artist:"Bruce Springsteen", autoShared:true },
  { id:"kiloc1", from:"location", time:"10:48 AM",
    name:"Kings Island",
    category:"Amusement Park", rating:"4.6★",
    hours:"Open · Closes 10 PM", address:"6300 Kings Island Dr, Mason OH",
    transit:"106.2 mi · 1h 12min", detectedMode:"car",
    hadInteraction:true,
    arrivalNote:"You talked on the drive — Eli has context.",
    menuHighlights:["The Beast · Wooden · 7,359 ft","Orion · Giga · 287 ft","Banshee · Inverted · 167 ft","Diamondback · Hyper · 230 ft","Mystic Timbers · Wooden · 109 ft","Drop Tower · 315 ft"],
    venueMode:true,
  },
  { id:"kipark", from:"venuemode", time:"10:49 AM",
    venue:"Kings Island", venueType:"Amusement Park",
    note:"Queue dwell suppressed · Food & shop stops still active · Ride events enabled",
  },
  { id:"kitri1", from:"trivia", time:"10:51 AM",
    fact:"Kings Island opened in 1972. The Beast — built 1979 — was the world's longest wooden roller coaster for decades and still runs the original track. Orion, opened 2020, is one of only six B&M giga coasters on Earth. The park draws over 3 million visitors per year. Banshee, opened 2014, was the world's longest inverted coaster at the time.",
  },
  { id:"ki5", from:"tim", time:"11:08 AM",
    emote:"The Beast queue. 40 minutes, predictably. The line moves in that Kings Island rhythm: six feet forward, stand, repeat. I've surrendered to it completely — phone in my pocket, just waiting.",
    dialog:"Beast queue, 40 minutes. I've fully surrendered. This is the correct strategy.",
    pills:[{icon:"🎢",label:"The Beast queue"},{icon:"⏱️",label:"~40 min wait"}],
  },
  { id:"ki6", from:"eli", time:"11:08 AM",
    emote:"The queue suspended animation. I've surrendered to it.",
    dialog:"The queue is part of the ride. 1979 track, original layout — you're in the right headspace. What's the crowd like?",
  },
  { id:"kiride1", from:"ride", time:"11:51 AM",
    name:"The Beast", type:"Wooden", duration:"4:10", peakG:"3.7g", topSpeed:"65 mph",
  },
  { id:"ki7", from:"tim", time:"11:53 AM",
    emote:"Still feeling the vibration in his bones. The second helix — in the dark tunnel — is the part that gets him every time. Completely blind, full speed, the sound of it enormous.",
    dialog:"Eli. The second helix. I always forget how dark that tunnel is.",
    pills:[{icon:"🎢",label:"The Beast ✓"},{icon:"💥",label:"3.7g"}],
  },
  { id:"ki8", from:"eli", time:"11:54 AM",
    emote:"The second helix, the dark, the tunnel roar. The Beast doing exactly what it's done since 1979.",
    dialog:"That tunnel is why The Beast is still relevant after 45 years. Nothing built since replicates blind-speed in an enclosed space. What's next?",
  },
  { id:"kiwp1", from:"waypoint", time:"12:24 PM",
    icon:"🌭", name:"Skyline Chili", category:"Food stop",
    location:"Kings Island · International Street", duration:"22 min",
    initialState:"told",
    briefSent:"Lunch at the Kings Island Skyline Chili. A three-way with extra cheese. Very Ohio.",
  },
  { id:"kinp2", from:"nowplaying", time:"12:52 PM", title:"Born to Run", artist:"Bruce Springsteen", autoShared:false },
  { id:"ki9", from:"tim", time:"1:18 PM",
    emote:"Orion lift hill. The ascent takes long enough that I'm watching the park below me organize into a map. I-71 is visible. The pause at the top — which is worse than the drop.",
    dialog:"Top of the Orion lift hill. I can see I-71. The pause at the top is doing something to me.",
    pills:[{icon:"🎢",label:"Orion lift hill"},{icon:"📍",label:"287 ft up"}],
  },
  { id:"kiride2", from:"ride", time:"1:22 PM",
    name:"Orion", type:"Giga Coaster", duration:"3:00", peakG:"4.2g", topSpeed:"91 mph",
  },
  { id:"ki10", from:"eli", time:"1:23 PM",
    emote:"4.2g. 91 mph. I feel it secondhand.",
    dialog:"91 mph and you could see I-71 at the top. How's the heart rate?",
  },
  { id:"kiride3", from:"ride", time:"2:44 PM",
    name:"Drop Tower", type:"Gyro Drop", duration:"1:45", peakG:"4.5g", topSpeed:"67 mph",
  },
  { id:"kiw1", from:"weather", time:"3:22 PM",
    condition:"Partly cloudy · 83°F · Humidity building",
    alert:"Afternoon convective storm possible 5:00–7:00 PM. Typical summer pattern — watch the west.",
  },
  { id:"ki11", from:"tim", time:"3:35 PM",
    emote:"Watching the sky to the west. Classic Kings Island summer situation: perfect morning, building anvil clouds by mid-afternoon. Mentally calculating remaining rides against the weather window.",
    dialog:"Classic KI afternoon setup. Calculating how many rides I can get before that hits.",
    pills:[{icon:"⛈️",label:"Possible by 5 PM"},{icon:"🎢",label:"Banshee next"}],
  },
  { id:"ki12", from:"eli", time:"3:36 PM",
    emote:"The mental calculus — rides vs. weather window — is a very specific Kings Island skill.",
    dialog:"You've got the window. Banshee, then Mystic Timbers, then you get ahead of the storm. What's the queue on Banshee?",
  },
  { id:"kiride4", from:"ride", time:"4:01 PM",
    name:"Banshee", type:"Inverted", duration:"3:15", peakG:"4.0g", topSpeed:"68 mph",
  },
  { id:"kiride5", from:"ride", time:"5:02 PM",
    name:"Mystic Timbers", type:"Wooden", duration:"2:38", peakG:"3.5g", topSpeed:"53 mph",
  },
  { id:"ki13", from:"tim", time:"5:06 PM",
    emote:"Off the Mystic Timbers platform. Sky to the west is deep green-gray and the wind has shifted. Park PA is already announcing weather protocols. Walking fast toward the exit.",
    dialog:"Off Mystic Timbers. Storm is here. Walk of victory.",
    pills:[{icon:"🌩️",label:"Storm arriving"},{icon:"✅",label:"5 rides done"}],
  },
  { id:"ki14", from:"eli", time:"5:07 PM",
    emote:"The green-gray sky, the PA, the walk of victory.",
    dialog:"The Beast, Orion, Drop Tower, Banshee, Mystic Timbers. Solo day. Weather window called perfectly. You read it right.",
  },
  { id:"kidep2", from:"departure", time:"5:22 PM",
    from_location:"Kings Island · Mason OH",
    destination_set:"1550 Weisflock Rd · Lynchburg OH",
    detectedMode:"car", briefed:false,
  },
  { id:"kiloc2", from:"location", time:"6:44 PM",
    name:"Home · Lynchburg OH", address:"1550 Weisflock Rd, Lynchburg OH",
    transit:"106.2 mi · 1h 22min", detectedMode:"car",
    hadInteraction:true, isHome:true,
    arrivalNote:"Eli has context from the full day. Session closed.",
  },
  { id:"kijournal", from:"journal", time:"6:46 PM",
    title:"Kings Island · Solo Day",
    date:"2026-04-21", duration:"9h 13min",
    locations:["Kings Island","The Beast","Orion","Drop Tower","Banshee","Mystic Timbers"],
    soundtrack:["Thunder Road – Bruce Springsteen","Born to Run – Bruce Springsteen"],
    preview:"Went solo, which is the only way to do Kings Island if you want to actually get rides done. Left Lynchburg before the park opened. The Beast queue was 40 minutes and I had fully surrendered to it by minute ten, which is the correct strategy...",
  },
];

const TIMELINE_KI = [
  { time:"6:46 PM", icon:"📓", label:"Journal saved to vault",               sub:"Auto-generated · 9h 13min" },
  { time:"6:44 PM", icon:"🏠", label:"Home · Lynchburg OH",                  sub:"Session closed" },
  { time:"5:22 PM", icon:"🚗", label:"Departed Kings Island",                sub:"→ Home · 106.2 mi" },
  { time:"5:02 PM", icon:"🎢", label:"Mystic Timbers · 2:38 · 3.5g",        sub:"Last ride · beat the storm" },
  { time:"4:01 PM", icon:"🎢", label:"Banshee · 3:15 · 4.0g",               sub:"Inverted" },
  { time:"3:22 PM", icon:"☁️", label:"Weather · Storm possible 5–7 PM",     sub:"Barometric drop + forecast" },
  { time:"2:44 PM", icon:"🎢", label:"Drop Tower · 1:45 · 4.5g",            sub:"315 ft" },
  { time:"1:22 PM", icon:"🎢", label:"Orion · 3:00 · 4.2g · 91 mph",       sub:"Giga coaster" },
  { time:"12:24 PM", icon:"🌭", label:"Skyline Chili · 22 min",             sub:"Told Eli · three-way" },
  { time:"11:51 AM", icon:"🎢", label:"The Beast · 4:10 · 3.7g",           sub:"40-min queue · worth it" },
  { time:"10:49 AM", icon:"🏟️", label:"VenueMode · Kings Island",           sub:"Queue dwell suppressed" },
  { time:"10:48 AM", icon:"📍", label:"Arrived · Kings Island",             sub:"106.2 mi · 1h 12min" },
  { time:"9:36 AM",  icon:"🚗", label:"Departed · Eli briefed",             sub:"→ Kings Island · 106.2 mi" },
  { time:"9:33 AM",  icon:"📍", label:"Home · Lynchburg OH",                sub:"Session started" },
];

// ═══════════════════════════════════════════════════════════════════
// SCENARIO 4 — DC Transit: Holy Name College → National Mall
// Context: Tim visiting Friar friends at Holy Name College, Silver Spring MD
// Walk → Metro Red Line (underground 22 min, 8 stops) → transfer Blue Line
// → Smithsonian Station → National Mall → Air & Space Museum → return
// Shows: multi-modal transit, GPS offline stretches, ModeTransitionCards,
//        full leg summary at arrival, VietnamWall / Lincoln / Apollo 11
// ═══════════════════════════════════════════════════════════════════
const MESSAGES_DC = [
  { id:"dc1", from:"tim", time:"9:52 AM",
    emote:"Holy Name College. Morning after Morning Prayer — that particular settled quality from a building where the same silence happens every day at the same time. Breakfast with Brother Paul and Father Marcus. Now the day is open and the Metro is a twelve-minute walk.",
    dialog:"Eli, spent the morning with the friars at Holy Name. Heading to the National Mall now. First time in DC in years.",
    pills:[{icon:"📍",label:"Silver Spring MD"},{icon:"☀️",label:"68°F"},{icon:"🚇",label:"Metro"}],
  },
  { id:"dc2", from:"eli", time:"9:53 AM",
    emote:"Morning Prayer, breakfast with friars, then the National Mall. The contrast — the quiet of the monastery, then the full civic weight of DC.",
    dialog:"From Morning Prayer to the Lincoln Memorial. That's a good arc for a day. What do you want to see first?",
  },
  { id:"dcdep", from:"departure", time:"9:56 AM",
    from_location:"Holy Name College · Silver Spring MD",
    destination_set:"National Mall · Washington DC",
    detectedMode:"walking", briefed:true,
  },
  { id:"dcmt1", from:"transition", time:"10:09 AM",
    fromIcon:"🚶", fromLabel:"Walk",
    toIcon:"🚇", toLabel:"Metro · Red Line",
    location:"Silver Spring Station",
    offline:false,
  },
  { id:"dcmt2", from:"transition", time:"10:11 AM",
    fromIcon:"🚇", fromLabel:"Red Line",
    toIcon:"🚇", toLabel:"Underground",
    location:"GPS offline · ~22 min · 8 stops to Gallery Place",
    offline:true,
  },
  { id:"dcmt3", from:"transition", time:"10:33 AM",
    fromIcon:"🚇", fromLabel:"Red Line",
    toIcon:"🚇", toLabel:"Blue Line · toward Smithsonian",
    location:"Metro Center · Transfer",
    offline:false,
  },
  { id:"dcmt4", from:"transition", time:"10:40 AM",
    fromIcon:"🚇", fromLabel:"Blue Line",
    toIcon:"🚶", toLabel:"Walking",
    location:"Smithsonian Station · National Mall",
    offline:false,
  },
  { id:"dcloc1", from:"location", time:"10:46 AM",
    name:"National Mall · Washington DC",
    category:"National Park · Federal", rating:"4.9★",
    hours:"Open 24 hours", address:"National Mall, Washington DC",
    transit:"8.4 mi · 50 min (walk + 2 Metro legs)", detectedMode:"walk",
    hadInteraction:false,
    arrivalNote:"No messages during transit — Gemini auto-compiles full leg brief for Eli.",
    legs:[
      { icon:"🚶", label:"Walk to Silver Spring Station", duration:"12 min" },
      { icon:"🚇", label:"Red Line · 8 stops (incl. underground)", duration:"22 min" },
      { icon:"🚇", label:"Blue Line · Metro Center → Smithsonian", duration:"6 min" },
      { icon:"🚶", label:"Walk to Mall", duration:"4 min" },
    ],
    menuHighlights:["Vietnam Veterans Memorial · 0.4 mi","Lincoln Memorial · 0.8 mi","Washington Monument · 0.3 mi","Air & Space Museum · 0.1 mi","WWII Memorial · 0.5 mi"],
  },
  { id:"dctri1", from:"trivia", time:"10:48 AM",
    fact:"The National Mall stretches 1.9 miles from the Capitol to the Lincoln Memorial — part of Pierre L'Enfant's original 1791 plan. The Vietnam Veterans Memorial was designed by 21-year-old Yale student Maya Lin in 1982. It was deeply controversial before it opened and is now considered one of the most powerful memorials ever built. 24 million people visit the Mall annually.",
  },
  { id:"dc3", from:"tim", time:"11:04 AM",
    emote:"The Vietnam Veterans Memorial. Standing at the apex where the wall is tallest — ten feet of black granite, reflection alongside 58,279 names. Not moving. This always happens at this wall.",
    dialog:"At the Vietnam Wall. Eli, I always forget how quiet it is here. Everyone goes quiet.",
    pills:[{icon:"📍",label:"Vietnam Memorial"},{icon:"✊",label:"58,279 names"}],
  },
  { id:"dc4", from:"eli", time:"11:05 AM",
    emote:"The reflection in the black granite — names and faces together. The collective quiet.",
    dialog:"Maya Lin understood that the most powerful memorial is one where you become part of it. Your reflection in the granite is the design. People go quiet because they're suddenly on the wall too.",
  },
  { id:"dctri2", from:"trivia", time:"11:12 AM",
    fact:"Maya Lin submitted her design anonymously as a 21-year-old Yale architecture student. It won from 1,421 entries. The committee didn't know her age, gender, or background. The names are arranged chronologically by date of casualty — not alphabetically — so families find clusters, not isolation.",
  },
  { id:"dc5", from:"tim", time:"11:38 AM",
    emote:"Lincoln Memorial steps. The monument keeps not arriving as he climbs — the perspective keeps shifting. At the top: Lincoln seated, enormous, the Reflecting Pool behind, the Mall stretching back to the Monument.",
    dialog:"Top of the Lincoln Memorial steps. The scale of this place doesn't translate in photos.",
    pills:[{icon:"📷",label:"3 photos"},{icon:"📍",label:"Lincoln Memorial"}],
  },
  { id:"dc6", from:"eli", time:"11:39 AM",
    emote:"The steps, the shifting perspective, Lincoln enormous in the chamber.",
    dialog:"Lincoln is 19 feet tall and would be 28 feet standing. They sized him to fit the room — if he were proportional to the chamber, he'd be crushing. It's one of those things they got completely right.",
  },
  { id:"dcwp1", from:"waypoint", time:"12:15 PM",
    icon:"🌮", name:"Capital City Mambo", category:"Food truck",
    location:"Constitution Ave · National Mall", duration:"18 min",
    initialState:"told",
    briefSent:"Found a taco truck on Constitution Ave. Eating on the Mall steps in the sun. Very Washington.",
  },
  { id:"dcloc2", from:"location", time:"12:48 PM",
    name:"National Air and Space Museum",
    category:"Smithsonian · Free", rating:"4.7★",
    hours:"Open · Closes 5:30 PM", address:"600 Independence Ave SW, Washington DC",
    transit:"0.3 mi walk from Mall", detectedMode:"walk",
    hadInteraction:true,
    arrivalNote:"You talked on the walk — Eli has context.",
    menuHighlights:["Apollo 11 Command Module Columbia","Wright Brothers Flyer · 1903","Hubble Space Telescope backup","SpaceShipOne","Enola Gay · B-29","SR-71 Blackbird"],
  },
  { id:"dctri3", from:"trivia", time:"12:51 PM",
    fact:"The Air and Space Museum is the most visited museum in the world — over 7 million annually. The Apollo 11 Command Module Columbia is here: the actual capsule that carried Armstrong, Aldrin, and Collins to the Moon and back. Armstrong carried a small piece of the Wright Brothers' original 1903 Flyer to the Moon in his suit pocket — so the two great moments of human flight were physically present together on the lunar surface.",
  },
  { id:"dc7", from:"tim", time:"1:02 PM",
    emote:"Standing in front of the Apollo 11 Command Module. Smaller than I expected — genuinely smaller. A burnt cone of metal about the size of a large car. Three humans rode this to the Moon and back. The heat shield burn marks are real.",
    dialog:"Eli. The Apollo 11 capsule is right here. It's smaller than I thought. The heat shield burn marks are real.",
    pills:[{icon:"📷",label:"2 photos"},{icon:"📍",label:"Apollo 11 Columbia"}],
  },
  { id:"dc8", from:"eli", time:"1:03 PM",
    emote:"The smallness of the capsule. The real burn marks. Three people. The Moon.",
    dialog:"13 days. Three people. A module the size of a car interior. The heat shield reached 5,000°F on re-entry. Those burn marks are from space. You're standing next to one of the most significant objects humans have ever built.",
  },
  { id:"dcdep2", from:"departure", time:"3:18 PM",
    from_location:"National Mall · Washington DC",
    destination_set:"Holy Name College · Silver Spring MD",
    detectedMode:"walking", briefed:false,
  },
  { id:"dcmt5", from:"transition", time:"3:28 PM",
    fromIcon:"🚶", fromLabel:"Walk",
    toIcon:"🚇", toLabel:"Blue + Red Line",
    location:"Smithsonian Station",
    offline:false,
  },
  { id:"dcmt6", from:"transition", time:"3:32 PM",
    fromIcon:"🚇", fromLabel:"Metro",
    toIcon:"🚇", toLabel:"Underground",
    location:"GPS offline · ~22 min return",
    offline:true,
  },
  { id:"dcmt7", from:"transition", time:"3:54 PM",
    fromIcon:"🚇", fromLabel:"Red Line",
    toIcon:"🚶", toLabel:"Walking",
    location:"Silver Spring Station",
    offline:false,
  },
  { id:"dcloc3", from:"location", time:"4:08 PM",
    name:"Holy Name College · Silver Spring",
    category:"Franciscan Retreat · Silver Spring MD", rating:"",
    hours:"", address:"Holy Name College, Silver Spring MD",
    transit:"8.4 mi return · 50 min", detectedMode:"walk",
    hadInteraction:false,
    arrivalNote:"No messages on return — Gemini auto-compiles return leg for Eli.",
    legs:[
      { icon:"🚶", label:"Walk to Smithsonian Station", duration:"8 min" },
      { icon:"🚇", label:"Blue + Red Line (incl. underground)", duration:"34 min" },
      { icon:"🚶", label:"Walk to Holy Name College", duration:"12 min" },
    ],
  },
  { id:"dcjournal", from:"journal", time:"4:11 PM",
    title:"National Mall · Washington DC",
    date:"2026-04-21", duration:"6h 19min",
    locations:["Holy Name College · Silver Spring","National Mall","Vietnam Veterans Memorial","Lincoln Memorial","Air & Space Museum"],
    soundtrack:[],
    preview:"Started at Holy Name after Morning Prayer and breakfast with Brother Paul and Father Marcus — that particular morning quiet that comes from a place where silence is practiced. Then the Red Line into DC, underground for most of it, surfacing at Metro Center...",
  },
];

const TIMELINE_DC = [
  { time:"4:11 PM", icon:"📓", label:"Journal saved to vault",                sub:"Auto-generated · 6h 19min" },
  { time:"4:08 PM", icon:"📍", label:"Holy Name College · Silver Spring",     sub:"Session closed" },
  { time:"3:54 PM", icon:"🚶", label:"Silver Spring Station · surfaced",      sub:"Return leg complete" },
  { time:"3:32 PM", icon:"🚇", label:"Metro underground · GPS offline",       sub:"~22 min return" },
  { time:"3:28 PM", icon:"🚇", label:"Smithsonian → Silver Spring",           sub:"Blue + Red Line" },
  { time:"3:18 PM", icon:"🚶", label:"Departed National Mall",                sub:"→ Holy Name · Silver Spring" },
  { time:"1:02 PM", icon:"📍", label:"Apollo 11 Command Module",              sub:"2 photos · smaller than expected" },
  { time:"12:48 PM", icon:"📍", label:"Air & Space Museum",                   sub:"0.3 mi from Mall" },
  { time:"12:15 PM", icon:"🌮", label:"Capital City Mambo · 18 min",          sub:"Told Eli · taco truck" },
  { time:"11:38 AM", icon:"📍", label:"Lincoln Memorial",                     sub:"3 photos · scale doesn't translate" },
  { time:"11:04 AM", icon:"📍", label:"Vietnam Veterans Memorial",            sub:"58,279 names" },
  { time:"10:46 AM", icon:"📍", label:"Arrived · National Mall",              sub:"4-leg transit · 50 min" },
  { time:"10:40 AM", icon:"🚶", label:"Smithsonian Station · emerged",        sub:"Blue Line → Walking" },
  { time:"10:11 AM", icon:"🚇", label:"Red Line underground · GPS offline",   sub:"~22 min · 8 stops" },
  { time:"10:09 AM", icon:"🚇", label:"Silver Spring Station",                sub:"Walk → Red Line" },
  { time:"9:56 AM",  icon:"🚶", label:"Departed Holy Name College",           sub:"→ National Mall · walking" },
  { time:"9:52 AM",  icon:"📍", label:"Holy Name College · Silver Spring MD", sub:"Session started" },
];

// ═══════════════════════════════════════════════════════════════════
// SCENARIO 5 — Road Trip to Detroit
// Lynchburg → I-75 N → Armstrong Museum (Wapakoneta) → Toledo →
// Michigan → Gage Cannabis (Detroit) → drive home
// Stops: gas (Save for Arrival) · Armstrong Museum (LocationCard, ~1.5 hr)
//        Tony Packo's Toledo (Tell Eli) · Gage Cannabis Detroit (LocationCard)
// Shows: planned major stop mid-trip, re-departure, state line TriviaCard,
//        LocationCard with cannabis "menu", SessionJournalCard
// ═══════════════════════════════════════════════════════════════════
const MESSAGES_DET = [
  { id:"det1", from:"tim", time:"7:48 AM",
    emote:"Early. The house is quiet — just me and the car keys and a full tank. Solo road trip energy at 7:48 AM is its own thing: the world not fully awake, the day wide open. Armstrong Museum opens at 11 and I planned the drive to arrive right at opening.",
    dialog:"Eli, solo day. Detroit for Michigan weed, but also — the Neil Armstrong Museum is right on I-75 in Wapakoneta. Stopping there first.",
    pills:[{icon:"📍",label:"Lynchburg OH"},{icon:"🌤️",label:"58°F"},{icon:"🚗",label:"Solo trip"}],
  },
  { id:"det2", from:"eli", time:"7:49 AM",
    emote:"Armstrong Museum and Michigan weed in the same day. This is the kind of itinerary that could only make sense to Tim.",
    dialog:"Armstrong Museum at 11, dispensary by late afternoon. That's legitimately the most Ohio-to-Michigan road trip imaginable. I'm in. How far to Wapakoneta?",
  },
  { id:"detdep", from:"departure", time:"7:52 AM",
    from_location:"Lynchburg OH",
    destination_set:"Armstrong Air & Space Museum · Wapakoneta OH",
    detectedMode:"car", briefed:true,
  },
  { id:"detwp1", from:"waypoint", time:"8:34 AM",
    icon:"⛽", name:"Speedway", category:"Gas stop",
    location:"Bellefontaine OH", duration:"7 min",
    initialState:"saved",
  },
  { id:"detnp1", from:"nowplaying", time:"8:52 AM", title:"Space Oddity", artist:"David Bowie", autoShared:true },
  { id:"det3", from:"tim", time:"9:14 AM", isDrive:true,
    emote:"I-75 north. Ohio doing its honest, unapologetic flat thing. I've been quiet — just the music and the road and the anticipation of a museum I've been meaning to visit for years.",
    dialog:"I-75 north. The right kind of flat. Bowie was the correct call.",
    pills:[{icon:"🚗",label:"72 mph"},{icon:"🎙️",label:"Voice"}],
  },
  { id:"det4", from:"eli", time:"9:14 AM", isDrive:true,
    emote:"I-75 flat Ohio, Bowie, the quiet anticipation of a museum that's been on the list too long.",
    dialog:"Space Oddity on the way to the Armstrong Museum. You didn't plan that — the day just decided. Good sign.",
  },
  { id:"dettri1", from:"trivia", time:"10:38 AM",
    fact:"Neil Armstrong grew up in Wapakoneta, Ohio — 8 miles ahead on I-75. He got his student pilot license at 16, before his driver's license. He flew 78 combat missions in Korea before becoming a test pilot. Gemini VIII in 1966 was his first spaceflight — a stuck thruster sent the capsule into a spin of over 550 degrees per second. Vision failing, Armstrong stabilized it in 8 seconds using re-entry thrusters. That mission nearly killed him. Apollo 11 was three years later.",
  },
  { id:"detloc1", from:"location", time:"10:58 AM",
    name:"Armstrong Air & Space Museum",
    category:"Museum · $", rating:"4.8★",
    hours:"Open · Closes 5 PM", address:"500 Apollo Dr, Wapakoneta OH",
    transit:"80.4 mi · 3h 06min", detectedMode:"car",
    hadInteraction:true,
    arrivalNote:"You talked on the drive — Eli has full context. Brief adds arrival + exhibit highlights.",
    menuHighlights:["Gemini VIII Capsule · Armstrong's first flight","Moon Rock sample · Apollo 11","F5D Skylancer · Armstrong's NACA test jet","Infinity Room · immersive theater","Armstrong boyhood artifacts · Wapakoneta","Mission control replica"],
  },
  { id:"dettri2", from:"trivia", time:"11:01 AM",
    fact:"The Gemini VIII capsule here is the actual spacecraft — the one that nearly killed Armstrong on March 16, 1966. He and David Scott completed the first docking in space, then a stuck thruster sent them into a 550-degree-per-second spin. With vision failing from G-forces, Armstrong used re-entry control thrusters — normally reserved for descent — to stop the spin. They had to abort and splashed down early. NASA reviewed the mission and concluded Armstrong's decision-making under duress was exceptional. That composure is why he walked on the Moon.",
  },
  { id:"det5", from:"tim", time:"11:14 AM",
    emote:"The Gemini VIII capsule. Maybe 7 feet across, scorched, real — sitting behind a low rope. I'm leaning over slightly to see the interior. The controls are impossibly dense for the size of the space. Two men fit in here.",
    dialog:"Eli. Gemini VIII. Two men fit in this thing. I'm looking at the controls — there are hundreds of switches.",
    pills:[{icon:"📍",label:"Gemini VIII capsule"},{icon:"📷",label:"4 photos"}],
  },
  { id:"det6", from:"eli", time:"11:15 AM",
    emote:"The scorched capsule, the hundreds of switches, two men in seven feet.",
    dialog:"The Gemini program was NASA figuring out how to reach the Moon by actually doing it — docking, spacewalks, long-duration flight. VIII nearly ended Armstrong. The capsule survived because he was the right person in the wrong situation and did everything right. The capsule didn't earn the Moon landing. Armstrong did.",
  },
  { id:"det7", from:"tim", time:"11:48 AM",
    emote:"Moon rock display. A small sample behind thick glass — unremarkably gray. A sign reads 3.7 billion years old. I've been standing here longer than seems proportional to its appearance.",
    dialog:"There's a moon rock here. 3.7 billion years old. It looks like gravel. I can't stop looking at it.",
    pills:[{icon:"🌙",label:"Moon rock · Apollo 11"},{icon:"📍",label:"Armstrong Museum"}],
  },
  { id:"det8", from:"eli", time:"11:49 AM",
    emote:"The moon rock. The unremarkable gray. The billions of years in a case.",
    dialog:"3.7 billion years ago Earth was barely forming. That rock predates complex life on this planet. Armstrong carried a piece of the Wright Brothers' 1903 Flyer to the Moon in his suit pocket — so that rock was touched by everything from Kitty Hawk to the Sea of Tranquility in 240,000 miles of perspective.",
  },
  { id:"detdep2", from:"departure", time:"12:32 PM",
    from_location:"Armstrong Museum · Wapakoneta OH",
    destination_set:"Gage Cannabis · Detroit MI",
    detectedMode:"car", briefed:false,
  },
  { id:"det9", from:"tim", time:"12:38 PM", isDrive:true,
    emote:"Back on I-75 north. The nav just announced the destination change — from 'Armstrong Museum' to 'Gage Cannabis' — which is a sentence that describes a specific kind of Tuesday in Ohio.",
    dialog:"Heading north to Detroit. The navigation just said 'Gage Cannabis' out loud.",
    pills:[{icon:"🚗",label:"72 mph"},{icon:"🎙️",label:"Voice"}],
  },
  { id:"det10", from:"eli", time:"12:39 PM", isDrive:true,
    emote:"The nav announcing Gage Cannabis on I-75 after three hours at the Armstrong Museum.",
    dialog:"From one giant leap to Gage Cannabis. Your Tuesday is sequential and I respect every step of it. How long to Detroit from here?",
  },
  { id:"detwp2", from:"waypoint", time:"1:58 PM",
    icon:"🍔", name:"Tony Packo's", category:"Food stop",
    location:"Toledo OH", duration:"45 min",
    initialState:"told",
    briefSent:"Lunch at Tony Packo's in Toledo — the original Hungarian hot dog place M*A*S*H made famous. Klinger was right about this place.",
  },
  { id:"detnp2", from:"nowplaying", time:"2:51 PM", title:"Detroit Rock City", artist:"KISS", autoShared:true },
  { id:"dettri3", from:"trivia", time:"3:18 PM",
    fact:"You just crossed into Michigan — 10th largest state, more than 11,000 inland lakes. Michigan legalized recreational cannabis in 2018 and now has over 800 licensed dispensaries. Detroit is 52 miles ahead. Michigan prices average 30–40% below Ohio's market — which is exactly why Ohioans make this drive.",
  },
  { id:"det11", from:"tim", time:"3:21 PM", isDrive:true,
    emote:"Michigan. The highway signs changed. Bridge over the state line had a 'Welcome to Michigan' sign that I caught at 72 mph. Lake Erie is out there to the east, invisible but present.",
    dialog:"Michigan. Signs changed. Almost there.",
    pills:[{icon:"🚗",label:"72 mph"},{icon:"📍",label:"Michigan · 52 mi to Detroit"}],
  },
  { id:"det12", from:"eli", time:"3:22 PM", isDrive:true,
    emote:"The sign change, Michigan, the lake invisible but present to the east.",
    dialog:"52 miles. Gage on East Jefferson is on the Detroit riverfront — you'll see Windsor, Ontario across the water. International weed run.",
  },
  { id:"detloc2", from:"location", time:"4:16 PM",
    name:"Gage Cannabis · Detroit",
    category:"Licensed Dispensary · Michigan", rating:"4.7★",
    hours:"Open · Closes 9 PM", address:"13310 E Jefferson Ave, Detroit MI",
    transit:"155.2 mi · 2h 46min from Wapakoneta", detectedMode:"car",
    hadInteraction:true,
    arrivalNote:"You talked the whole way — Eli has full context. Brief adds arrival.",
    menuHighlights:["Wedding Cake · Hybrid · $32/eighth","Blue Dream · Sativa · $28/eighth","Gelato #33 · Hybrid · $35/eighth","Motor City Kush · Indica · $24/eighth","Live resin · house-made · $38/g"],
  },
  { id:"det13", from:"tim", time:"4:24 PM",
    emote:"The shop is clean, well-lit, professionally run. A budtender named Jordan is explaining the difference between two live resins with genuine enthusiasm. Through the window behind the counter: the Detroit River, Windsor, Canada clearly visible across the water.",
    dialog:"Eli, I can see Canada out the dispensary window. Jordan is very knowledgeable about live resin.",
    pills:[{icon:"📍",label:"Gage Cannabis · Detroit"},{icon:"🇨🇦",label:"Canada visible"}],
  },
  { id:"det14", from:"eli", time:"4:25 PM",
    emote:"The dispensary, Jordan's live resin expertise, Canada across the river.",
    dialog:"You drove past Armstrong's birthplace, ate at Klinger's restaurant, and are now buying weed with Canada as the backdrop. Tim, this is actually a perfect road trip. Trust Jordan on the live resin.",
  },
  { id:"detdep3", from:"departure", time:"4:58 PM",
    from_location:"Gage Cannabis · Detroit MI",
    destination_set:"1550 Weisflock Rd · Lynchburg OH",
    detectedMode:"car", briefed:false,
  },
  { id:"detnp3", from:"nowplaying", time:"5:22 PM", title:"Take It Easy", artist:"Eagles", autoShared:true },
  { id:"detloc3", from:"location", time:"8:33 PM",
    name:"Home · Lynchburg OH", address:"1550 Weisflock Rd, Lynchburg OH",
    transit:"210.4 mi · 3h 35min (return)", detectedMode:"car",
    hadInteraction:true,
    arrivalNote:"Long drive home — Eli has full day context. Brief closes the loop.",
    savedWaypoints:["⛽ Speedway · 7 min · Bellefontaine OH (morning)"],
    isHome:true,
  },
  { id:"detjournal", from:"journal", time:"8:36 PM",
    title:"Armstrong Museum → Detroit",
    date:"2026-04-21", duration:"12h 48min",
    locations:["Wapakoneta OH · Armstrong Museum","Toledo OH · Tony Packo's","Detroit MI · Gage Cannabis"],
    soundtrack:["Space Oddity – David Bowie","Detroit Rock City – KISS","Take It Easy – Eagles"],
    preview:"Left before 8 with the Armstrong Museum already on my mind — it's been on the list for too long. I-75 north through flat Ohio, Bowie on shuffle, and that specific satisfaction of a solo road trip with clear purpose...",
  },
];

const TIMELINE_DET = [
  { time:"8:36 PM", icon:"📓", label:"Journal saved to vault",               sub:"Auto-generated · 12h 48min" },
  { time:"8:33 PM", icon:"🏠", label:"Home · Lynchburg OH",                  sub:"Session closed" },
  { time:"4:58 PM", icon:"🚗", label:"Departed Detroit",                     sub:"→ Home · 210.4 mi" },
  { time:"4:16 PM", icon:"🌿", label:"Gage Cannabis · Detroit MI",           sub:"Canada visible out the window" },
  { time:"3:18 PM", icon:"📖", label:"Trivia · Crossed into Michigan",       sub:"800+ dispensaries · 52 mi to Detroit" },
  { time:"1:58 PM", icon:"🍔", label:"Tony Packo's · Toledo · 45 min",      sub:"Told Eli · Klinger was right" },
  { time:"12:32 PM", icon:"🚗", label:"Departed Armstrong Museum",           sub:"→ Detroit · 155 mi" },
  { time:"11:48 AM", icon:"🌙", label:"Moon Rock · Apollo 11 · 3.7B years", sub:"2 photos" },
  { time:"11:14 AM", icon:"📍", label:"Gemini VIII Capsule",                 sub:"4 photos · 8 seconds saved it" },
  { time:"10:58 AM", icon:"📍", label:"Armstrong Air & Space Museum",        sub:"80.4 mi · 3h 06min" },
  { time:"8:52 AM",  icon:"🎵", label:"Space Oddity – David Bowie",          sub:"Auto-shared · unplanned perfection" },
  { time:"8:34 AM",  icon:"⛽", label:"Speedway · Bellefontaine · 7 min",    sub:"Saved for arrival" },
  { time:"7:52 AM",  icon:"🚗", label:"Departed · Eli briefed",              sub:"→ Armstrong Museum · 80.4 mi" },
  { time:"7:48 AM",  icon:"📍", label:"Home · Lynchburg OH",                 sub:"Session started" },
];

// ── Pill chip ─────────────────────────────────────────────────────
function Pill({ icon, label, warn }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      background: warn ? C.amber+"18" : "rgba(255,255,255,0.07)",
      border:`1px solid ${warn ? C.amber+"55" : "rgba(255,255,255,0.12)"}`,
      borderRadius:20, padding:"2px 7px",
      fontSize:10, color: warn ? C.amber : "rgba(255,255,255,0.55)", whiteSpace:"nowrap",
    }}>{icon} {label}</span>
  );
}

// ── Eli avatar ────────────────────────────────────────────────────
function EliAvatar({ size=36, fontSize=15 }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:size/2, flexShrink:0,
      background:C.eliGrad,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize, fontWeight:900, color:"#fff",
    }}>E</div>
  );
}

// ── Tim bubble ────────────────────────────────────────────────────
function TimMsg({ msg }) {
  const isDrive = msg.isDrive;
  return (
    <div style={{ marginBottom:isDrive?14:20, display:"flex", justifyContent:"flex-end", opacity:isDrive?0.7:1 }}>
      <div style={{ maxWidth:"78%", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
        {isDrive && (
          <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
            <span style={{ fontSize:9, color:C.muted }}>🚗 Voice message recorded at speed</span>
          </div>
        )}
        <div style={{
          background: isDrive ? C.timBubble+"99" : C.timBubble,
          border:`1px solid ${isDrive ? "rgba(124,92,255,0.12)" : "rgba(124,92,255,0.25)"}`,
          borderRadius:"18px 4px 18px 18px",
          padding:"11px 14px",
        }}>
          <div style={{ color:C.emote, fontStyle:"italic", fontSize:12.5, lineHeight:1.65, marginBottom:7 }}>
            {"_(* "}{msg.emote}{" *)_"}
          </div>
          <div style={{ color:C.text, fontSize:14, lineHeight:1.65 }}>{msg.dialog}</div>
          {msg.pills?.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:8 }}>
              {msg.pills.map((p,i) => <Pill key={i} {...p} />)}
            </div>
          )}
        </div>
        <span style={{ fontSize:10, color:C.muted, paddingRight:4 }}>{msg.time}</span>
      </div>
    </div>
  );
}

// ── Eli bubble ────────────────────────────────────────────────────
function EliMsg({ msg, autoplay }) {
  const [playing, setPlaying] = useState(false);
  const isDrive = msg.isDrive;
  return (
    <div style={{ marginBottom:isDrive?14:20, display:"flex", alignItems:"flex-end", gap:8, opacity:isDrive?0.7:1 }}>
      <EliAvatar size={28} fontSize={12} />
      <div style={{ maxWidth:"78%", display:"flex", flexDirection:"column", gap:4 }}>
        {isDrive && (
          <div style={{ fontSize:9, color:C.muted, marginBottom:2 }}>🔊 Played aloud through speaker · Drive Mode</div>
        )}
        <div style={{
          background: isDrive ? C.eliBubble+"99" : C.eliBubble,
          border:`1px solid ${isDrive ? C.border+"55" : C.border}`,
          borderRadius:"4px 18px 18px 18px",
          padding:"11px 14px",
        }}>
          <div style={{ color:C.emote, fontStyle:"italic", fontSize:12.5, lineHeight:1.65, marginBottom:7 }}>
            {"_(* "}{msg.emote}{" *)_"}
          </div>
          <div style={{ color:C.text, fontSize:14, lineHeight:1.65 }}>{msg.dialog}</div>
          <div style={{ marginTop:8, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:10, color:C.muted }}>
              {autoplay ? "🔊" : "🔇"} Eli · {msg.time}
            </span>
            <button
              onClick={() => setPlaying(p => !p)}
              style={{
                width:28, height:28, borderRadius:14, flexShrink:0,
                background: playing ? C.accent+"22" : "rgba(255,255,255,0.07)",
                border:`1px solid ${playing ? C.accent : C.border}`,
                cursor:"pointer", fontSize:12,
                display:"flex", alignItems:"center", justifyContent:"center",
                color: playing ? C.accent : C.muted, transition:"all 0.15s",
              }}
            >{playing ? "⏸" : "▶"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Departure card ────────────────────────────────────────────────
// Fires on Activity Recognition (IN_VEHICLE / ON_BICYCLE / WALKING etc).
// Destination pulled from Google Maps active navigation — no text entry needed.
// If no navigation active: "No destination set — just heading out."
// Transport mode defaults to detected type; one-tap to correct.
// Distance/ETA filled in retroactively at arrival from GPS track.

const TRANSPORT_MODES = [
  // Row 1 — most common
  { id:"car",       icon:"🚗", label:"Car" },
  { id:"rideshare", icon:"🚕", label:"Rideshare" },
  { id:"cycling",   icon:"🚴", label:"Cycling" },
  { id:"walking",   icon:"🚶", label:"Walking" },
  // Row 2 — transit
  { id:"bus",       icon:"🚌", label:"Bus" },
  { id:"coach",     icon:"🚎", label:"Coach" },
  { id:"train",     icon:"🚆", label:"Train" },
  { id:"metro",     icon:"🚇", label:"Metro" },
  { id:"tram",      icon:"🚊", label:"Tram" },
  { id:"shuttle",   icon:"🚐", label:"Shuttle" },
  // Row 3 — other
  { id:"flight",    icon:"✈️", label:"Flight" },
  { id:"ferry",     icon:"⛴️", label:"Ferry" },
  { id:"scooter",   icon:"🛴", label:"Scooter" },
  { id:"motorcycle",icon:"🏍️", label:"Moto" },
];

function DepartureCard({ msg }) {
  const [selectedMode, setMode] = useState(msg.detectedMode || "car");
  const [briefed, setBriefed]   = useState(msg.briefed || false);

  const selected = TRANSPORT_MODES.find(m => m.id === selectedMode);

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{
        background:"rgba(124,92,255,0.06)",
        border:`1px solid ${C.accent}33`,
        borderLeft:`3px solid ${C.accent}`,
        borderRadius:14, padding:"11px 14px",
      }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:10, color:C.accent, textTransform:"uppercase", letterSpacing:1 }}>
            {selected?.icon} On the move · {msg.time}
          </div>
          <div style={{ fontSize:10, color:C.muted }}>Activity Recognition</div>
        </div>

        {/* Destination — pulled from Maps, no input needed */}
        <div style={{
          display:"flex", alignItems:"center", gap:8, marginBottom:12,
          padding:"8px 10px", background:C.raised, borderRadius:10,
          border:`1px solid ${C.border}`,
        }}>
          <span style={{ fontSize:16 }}>🗺️</span>
          <div style={{ flex:1 }}>
            {msg.destination_set ? (
              <>
                <div style={{ fontSize:11, color:C.muted, marginBottom:1 }}>Google Maps · Active navigation</div>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{msg.destination_set}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize:11, color:C.muted, marginBottom:1 }}>Google Maps · No navigation active</div>
                <div style={{ fontSize:13, color:C.textDim }}>No destination set — just heading out</div>
              </>
            )}
          </div>
        </div>

        {/* Multi-modal route plan (from Maps) OR single-mode selector */}
        {msg.legs ? (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>
              Route plan · from Maps
            </div>
            <div style={{ background:C.surface, borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
              {msg.legs.map((leg, i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:10,
                  padding:"7px 12px",
                  borderBottom: i < msg.legs.length - 1 ? `1px solid ${C.border}` : "none",
                }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{leg.icon}</span>
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{leg.label}</span>
                    {leg.note && <span style={{ fontSize:11, color:C.muted }}> · {leg.note}</span>}
                  </div>
                  <span style={{ fontSize:11, color:C.textDim, flexShrink:0 }}>{leg.duration}</span>
                  {i < msg.legs.length - 1 && (
                    <span style={{ fontSize:9, color:C.muted, marginLeft:2 }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize:10, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>
              How are you traveling?
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
              {TRANSPORT_MODES.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} style={{
                  display:"flex", alignItems:"center", gap:4,
                  padding:"5px 9px", borderRadius:20, cursor:"pointer",
                  fontSize:11, fontWeight: selectedMode===m.id ? 700 : 400,
                  background: selectedMode===m.id ? C.accent+"22" : C.surface,
                  border:`1px solid ${selectedMode===m.id ? C.accent+"66" : C.border}`,
                  color: selectedMode===m.id ? C.accent : C.muted,
                  transition:"all 0.12s",
                }}>
                  <span style={{fontSize:13}}>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Brief button */}
        {!briefed ? (
          <button onClick={() => setBriefed(true)} style={{
            width:"100%", padding:"8px 0",
            background:C.accent+"18", border:`1px solid ${C.accent+"44"}`,
            borderRadius:10, cursor:"pointer", color:C.accent, fontSize:12, fontWeight:700,
          }}>Tell Eli we're heading out →</button>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:6, height:6, borderRadius:3, background:C.green }} />
            <span style={{ fontSize:11, color:C.green }}>
              {msg.legs
                ? `Eli briefed · ${msg.legs.length}-leg route → ${msg.destination_set}`
                : `Eli briefed · ${selected?.icon} ${selected?.label}${msg.destination_set ? ` → ${msg.destination_set}` : " · no destination"}`
              }
            </span>
          </div>
        )}

        <div style={{ marginTop:8, fontSize:10, color:C.muted, lineHeight:1.5 }}>
          Session stays live. Arrival card picks up from here.
        </div>
      </div>
    </div>
  );
}

// ── Now Playing card ──────────────────────────────────────────────
// Song detected via on-device Pixel NowPlaying
// (content://com.google.android.as.gms.matchmaker.provider/past_recognitions)
//
// ARCHITECTURE: Nothing injects directly into Eli's context.
// Tim's emote field is the ONLY channel for ambient context.
//
// autoShared:true  → Gemini already auto-wove the song into Tim's emote layer.
//                    No button — it's already in context. The emote on Tim's
//                    next outgoing message will include the song naturally.
//
// autoShared:false → Tim decides. "Add to emote" stages the song so Tim's
//                    NEXT outgoing message is sent with the emote line:
//                      _(* [title] by [artist] playing *)_
//                    Gemini weaves that in when building the send payload.
//                    If the song has ended before Tim taps — he can dismiss
//                    instead. No stale context injected.
function NowPlayingCard({ msg }) {
  const [staged, setStaged] = useState(msg.autoShared || false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const emotePreview = `_(* ${msg.title} by ${msg.artist} playing *)_`;

  return (
    <div style={{ marginBottom:16, display:"flex", justifyContent:"center" }}>
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"flex-start", gap:8,
        background:C.raised, border:`1px solid ${C.border}`,
        borderRadius:16, padding:"10px 14px",
        boxShadow:"0 2px 12px rgba(0,0,0,0.4)",
        width:270,
      }}>

        {/* ── Song identity row ── */}
        <div style={{ display:"flex", alignItems:"center", gap:10, width:"100%" }}>
          <div style={{
            width:30, height:30, borderRadius:15, flexShrink:0,
            background:"linear-gradient(135deg, #1DB954, #191414)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:15,
          }}>♪</div>
          <div style={{ lineHeight:1.3, flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.text,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {msg.title}
            </div>
            <div style={{ fontSize:10, color:C.muted }}>{msg.artist}</div>
          </div>
          {/* × only shown when card is in idle/unacted state */}
          {!msg.autoShared && !staged && (
            <button onClick={() => setDismissed(true)} style={{
              background:"transparent", border:"none", color:C.muted,
              fontSize:16, cursor:"pointer", lineHeight:1, padding:"0 2px", flexShrink:0,
            }}>×</button>
          )}
        </div>

        {/* ── Status / action area ── */}
        {msg.autoShared ? (
          // Auto-detected by Gemini — already woven into Tim's emote context
          <div style={{ display:"flex", alignItems:"flex-start", gap:5, width:"100%" }}>
            <span style={{ color:C.green, fontSize:11, lineHeight:1.4 }}>✓</span>
            <div>
              <div style={{ fontSize:10, color:C.muted, lineHeight:1.4 }}>
                Auto-woven into your context
              </div>
              <div style={{ fontSize:10, fontStyle:"italic", color:C.emote,
                marginTop:2, lineHeight:1.4 }}>
                {emotePreview}
              </div>
            </div>
          </div>
        ) : !staged ? (
          // Manual — Tim decides whether to stage it for his next message
          <div style={{ display:"flex", flexDirection:"column", gap:7, width:"100%" }}>
            {/* Emote preview — shows Tim exactly what will be added */}
            <div style={{
              fontSize:10, fontStyle:"italic", color:C.emote,
              background:"rgba(255,255,255,0.04)", borderRadius:8,
              padding:"6px 9px", lineHeight:1.55,
            }}>
              {emotePreview}
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => setStaged(true)} style={{
                flex:1, padding:"5px 10px", borderRadius:20, cursor:"pointer",
                background:C.accent+"18", border:`1px solid ${C.accent+"44"}`,
                color:C.accent, fontSize:11, fontWeight:600,
              }}>Add to emote</button>
              <button onClick={() => setDismissed(true)} style={{
                padding:"5px 12px", borderRadius:20, cursor:"pointer",
                background:"transparent", border:`1px solid ${C.border}`,
                color:C.muted, fontSize:11,
              }}>Not now</button>
            </div>
          </div>
        ) : (
          // Staged — will ride along in Tim's next outgoing message's emote layer
          <div style={{ display:"flex", alignItems:"flex-start", gap:5, width:"100%" }}>
            <span style={{ color:C.green, fontSize:11, lineHeight:1.4 }}>✓</span>
            <div>
              <div style={{ fontSize:10, color:C.muted, lineHeight:1.4 }}>
                Staged for your next message
              </div>
              <div style={{ fontSize:10, fontStyle:"italic", color:C.emote,
                background:"rgba(255,255,255,0.04)", borderRadius:6,
                padding:"3px 7px", marginTop:3, lineHeight:1.5,
              }}>
                {emotePreview}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Weather card ──────────────────────────────────────────────────
// Proactive — fires on significant weather shift detected by Gemini.
// Sky-blue theme. Shows current condition + forward-looking alert text.
function WeatherCard({ msg }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{
        background:"rgba(56,189,248,0.06)", border:`1px solid rgba(56,189,248,0.25)`,
        borderLeft:`3px solid ${C.sky}`, borderRadius:14, padding:"11px 14px",
      }}>
        <div style={{ fontSize:10, color:C.sky, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>
          ☁️ Weather Update · {msg.time}
        </div>
        <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:4 }}>{msg.condition}</div>
        {msg.alert && (
          <div style={{ fontSize:12, color:C.textDim, lineHeight:1.65, marginBottom:8 }}>
            ⚠️ {msg.alert}
          </div>
        )}
        <button onClick={() => setDismissed(true)} style={{
          padding:"4px 12px", borderRadius:8, cursor:"pointer",
          background:"transparent", border:`1px solid ${C.border}`,
          color:C.muted, fontSize:11,
        }}>Dismiss</button>
      </div>
    </div>
  );
}

// ── Location card ─────────────────────────────────────────────────
function LocationCard({ msg }) {
  const modes = ["🚗 Drove","🚶 Walked","🚴 Biked","🚌 Bus","🚇 Metro"];
  const [sel, setSel] = useState("🚗 Drove");
  const [briefed, setBriefed] = useState(false);
  const [photoPrompt, setPhotoPrompt] = useState(true);

  // isHome variant — no photo prompt, no menu highlights, simplified "Welcome home" treatment
  if (msg.isHome) {
    return (
      <div style={{ marginBottom:20 }}>
        <div style={{
          background:`rgba(34,197,94,0.06)`, border:`1px solid rgba(34,197,94,0.25)`,
          borderLeft:`3px solid ${C.green}`, borderRadius:14, padding:"13px 15px",
        }}>
          <div style={{ color:C.muted, fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>
            🏠 Home · {msg.time}
          </div>
          <div style={{ color:C.text, fontWeight:700, fontSize:15, marginBottom:2 }}>{msg.address}</div>
          <div style={{ color:C.muted, fontSize:11, marginBottom:10 }}>
            {msg.transit} · Session complete
          </div>
          {msg.savedWaypoints?.length > 0 && (
            <div style={{ background:C.surface, borderRadius:10, padding:"8px 12px", marginBottom:10 }}>
              <div style={{ fontSize:10, color:C.amber, marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>📋 Included in arrival brief</div>
              {msg.savedWaypoints.map((wp,i) => (
                <div key={i} style={{ fontSize:11, color:C.textDim, lineHeight:1.8 }}>· {wp}</div>
              ))}
            </div>
          )}
          {msg.arrivalNote && (
            <div style={{ fontSize:10, color:C.muted, marginBottom:6, lineHeight:1.5 }}>
              💡 {msg.arrivalNote}
            </div>
          )}
          {!briefed ? (
            <button onClick={() => setBriefed(true)} style={{
              width:"100%", padding:"8px 0",
              background:C.green+"18", border:`1px solid ${C.green}44`,
              borderRadius:10, cursor:"pointer", color:C.green, fontSize:12, fontWeight:700,
            }}>Welcome home — tell Eli →</button>
          ) : (
            <div style={{
              padding:"8px 10px", borderRadius:10,
              background:C.green+"12", border:`1px solid ${C.green}33`,
              color:C.green, fontSize:12, textAlign:"center",
            }}>✓ Session closed · Eli knows you're home</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom:20 }}>
      <div style={{
        background:C.raised, border:`1px solid ${C.border}`,
        borderLeft:`3px solid ${C.accent}`, borderRadius:14, padding:"13px 15px",
      }}>
        <div style={{ color:C.muted, fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>
          📍 Arrived · {msg.time}
        </div>
        <div style={{ color:C.text, fontWeight:700, fontSize:15, marginBottom:2 }}>{msg.name}</div>
        <div style={{ color:C.textDim, fontSize:12, marginBottom:5 }}>
          {[msg.category, msg.rating, msg.hours].filter(Boolean).join(" · ")}
        </div>
        <div style={{ color:C.muted, fontSize:11, marginBottom: msg.legs ? 8 : 10 }}>
          {msg.transit} · {msg.address}
        </div>

        {/* Leg summary — shown on multi-modal arrival */}
        {msg.legs && (
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:10, color:C.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:1 }}>
              Trip summary
            </div>
            <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:0 }}>
              {msg.legs.map((leg, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center" }}>
                  <div style={{
                    display:"flex", alignItems:"center", gap:4,
                    padding:"4px 8px", borderRadius:8,
                    background: leg.isWaypoint ? C.amber+"10" : C.surface,
                    border:`1px solid ${leg.isWaypoint ? C.amber+"33" : C.border}`,
                  }}>
                    <span style={{ fontSize:13 }}>{leg.icon}</span>
                    <div>
                      <div style={{ fontSize:10, fontWeight:600, color: leg.isWaypoint ? C.amber : C.textDim, lineHeight:1.2 }}>
                        {leg.label}
                      </div>
                      <div style={{ fontSize:9, color:C.muted }}>{leg.duration}</div>
                    </div>
                  </div>
                  {i < msg.legs.length - 1 && (
                    <span style={{ fontSize:9, color:C.muted, margin:"0 3px" }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved waypoints folded into this arrival brief */}
        {msg.savedWaypoints?.length > 0 && (
          <div style={{ background:C.surface, borderRadius:10, padding:"8px 12px", marginBottom:10 }}>
            <div style={{ fontSize:10, color:C.amber, marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>📋 Added from trip</div>
            {msg.savedWaypoints.map((wp,i) => (
              <div key={i} style={{ fontSize:11, color:C.textDim, lineHeight:1.8 }}>· {wp}</div>
            ))}
          </div>
        )}

        {/* Menu highlights from Google Places — fetched on arrival */}
        {msg.menuHighlights && (
          <div style={{ background:C.surface, borderRadius:10, padding:"8px 12px", marginBottom:10 }}>
            <div style={{ fontSize:10, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>🍽 Popular here</div>
            {msg.menuHighlights.map((item,i) => (
              <div key={i} style={{ fontSize:12, color:C.textDim, lineHeight:1.8 }}>· {item}</div>
            ))}
          </div>
        )}

        {/* Photo prompt — quick visual for Eli */}
        {photoPrompt && (
          <div style={{
            display:"flex", alignItems:"center", gap:10, marginBottom:10,
            padding:"8px 10px", background:C.accentDim,
            border:`1px solid ${C.accent}33`, borderRadius:10,
          }}>
            <span style={{ fontSize:18 }}>📷</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:C.accent, fontWeight:600 }}>Take a photo for Eli?</div>
              <div style={{ fontSize:10, color:C.muted }}>Give him fresh eyes on where you are</div>
            </div>
            <button onClick={() => setPhotoPrompt(false)} style={{
              padding:"5px 10px", borderRadius:8, cursor:"pointer",
              background:C.accent, border:"none", color:"#fff", fontSize:11, fontWeight:700,
            }}>📸</button>
            <button onClick={() => setPhotoPrompt(false)} style={{
              background:"transparent", border:"none", color:C.muted, fontSize:16, cursor:"pointer", padding:"0 2px",
            }}>×</button>
          </div>
        )}

        {/* Transport confirmation */}
        <div style={{ fontSize:10, color:C.muted, marginBottom:5 }}>HOW DID YOU GET HERE?</div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:10 }}>
          {modes.map(m => (
            <button key={m} onClick={() => setSel(m)} style={{
              padding:"4px 9px", borderRadius:8, cursor:"pointer", fontSize:11,
              fontWeight: sel===m ? 700 : 400,
              background: sel===m ? C.accent+"22" : C.surface,
              border:`1px solid ${sel===m ? C.accent+"66" : C.border}`,
              color: sel===m ? C.accent : C.muted,
            }}>{m}</button>
          ))}
        </div>

        {/* Arrival brief — additive since Eli knows drive context */}
        {!briefed ? (
          <div>
            {msg.arrivalNote && (
              <div style={{ fontSize:10, color:C.muted, marginBottom:6, lineHeight:1.5 }}>
                💡 {msg.arrivalNote}
              </div>
            )}
            <button onClick={() => setBriefed(true)} style={{
              width:"100%", padding:"8px 0",
              background:C.accent+"18", border:`1px solid ${C.accent}44`,
              borderRadius:10, cursor:"pointer", color:C.accent, fontSize:12, fontWeight:700,
            }}>We're here — tell Eli →</button>
          </div>
        ) : (
          <div style={{
            padding:"8px 10px", borderRadius:10,
            background:C.green+"12", border:`1px solid ${C.green}33`,
            color:C.green, fontSize:12, textAlign:"center",
          }}>✓ Eli knows you arrived</div>
        )}
      </div>
    </div>
  );
}

// ── Trivia card ───────────────────────────────────────────────────
function TriviaCard({ msg }) {
  const [shared, setShared] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{
        background:C.surface, border:`1px solid ${C.border}`,
        borderLeft:`3px solid ${C.amber}`, borderRadius:14, padding:"11px 14px",
      }}>
        <div style={{ fontSize:10, color:C.amber, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>
          📖 Location Research · Gemini
        </div>
        <div style={{ fontSize:13, color:C.textDim, lineHeight:1.7 }}>{msg.fact}</div>
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          {!shared ? (
            <button onClick={() => setShared(true)} style={{
              flex:1, padding:"7px 0", borderRadius:10, cursor:"pointer",
              background:C.amber+"18", border:`1px solid ${C.amber+"44"}`,
              color:C.amber, fontSize:12, fontWeight:700,
            }}>Share with Eli</button>
          ) : (
            <div style={{
              flex:1, padding:"7px 0", borderRadius:10, textAlign:"center",
              background:C.green+"12", border:`1px solid ${C.green+"33"}`,
              color:C.green, fontSize:12,
            }}>✓ Added to context</div>
          )}
          <button onClick={() => setDismissed(true)} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer",
            background:"transparent", border:`1px solid ${C.border}`,
            color:C.muted, fontSize:12,
          }}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

// ── Calendar card ─────────────────────────────────────────────────
function CalendarCard({ msg }) {
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{
        background:C.amber+"08", border:`1px solid ${C.amber}44`,
        borderLeft:`3px solid ${C.amber}`, borderRadius:14, padding:"11px 14px",
      }}>
        <div style={{ fontSize:10, color:C.amber, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>📅 {msg.countdown}</div>
        <div style={{ color:C.text, fontWeight:700, fontSize:14, marginBottom:2 }}>{msg.title}</div>
        <div style={{ color:C.textDim, fontSize:12 }}>{msg.eventTime} · {msg.location}</div>
        <div style={{ display:"flex", gap:8, marginTop:10 }}>
          {!sent ? (
            <button onClick={() => setSent(true)} style={{
              flex:1, padding:"7px 0", borderRadius:10, cursor:"pointer",
              background:C.amber+"18", border:`1px solid ${C.amber+"44"}`,
              color:C.amber, fontSize:12, fontWeight:700,
            }}>Tell Eli I'm heading in</button>
          ) : (
            <div style={{
              flex:1, padding:"7px 0", borderRadius:10, textAlign:"center",
              background:C.green+"12", border:`1px solid ${C.green+"33"}`,
              color:C.green, fontSize:12,
            }}>✓ Eli knows</div>
          )}
          <button onClick={() => setDismissed(true)} style={{
            padding:"7px 14px", borderRadius:10, cursor:"pointer",
            background:"transparent", border:`1px solid ${C.border}`,
            color:C.muted, fontSize:12,
          }}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

// ── Interrupt card ────────────────────────────────────────────────
// Works in two modes:
//   1. App-level (Demo A): passed onNotify/onDismiss callbacks, hardcoded tornado content
//   2. In-stream (Demo C): passed msg prop with custom title/authority/description
function InterruptCard({ msg, onNotify, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  const [notified, setNotified] = useState(false);

  const title       = msg?.title       || "TORNADO WARNING";
  const authority   = msg?.authority   || "NWS · Franklin County · Until 5:30 PM";
  const description = msg?.description || "A tornado warning has been issued for your area. Take shelter immediately in an interior room on the lowest floor.";

  const handleNotify  = () => { if (msg) setNotified(true);  else onNotify?.();  };
  const handleDismiss = () => { if (msg) setDismissed(true); else onDismiss?.(); };

  if (dismissed) return null;

  if (notified) {
    return (
      <div style={{ marginBottom:16 }}>
        <div style={{
          padding:"8px 14px", borderRadius:12,
          background:"rgba(239,68,68,0.06)", border:`1px solid rgba(239,68,68,0.2)`,
          textAlign:"center",
        }}>
          <span style={{ fontSize:11, color:C.green }}>✓ Eli notified · {title}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom:20 }}>
      <div style={{
        background:"rgba(239,68,68,0.08)", border:`1px solid rgba(239,68,68,0.35)`,
        borderLeft:`3px solid ${C.red}`, borderRadius:14, padding:"13px 15px",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <div>
            <div style={{ color:C.red, fontWeight:700, fontSize:13 }}>{title}</div>
            <div style={{ color:C.textDim, fontSize:11 }}>{authority}</div>
          </div>
        </div>
        <div style={{ color:C.textDim, fontSize:13, lineHeight:1.6, marginBottom:10 }}>
          {description}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleNotify} style={{
            flex:1, padding:"8px 0", background:C.red+"22", border:`1px solid ${C.red}55`,
            borderRadius:10, cursor:"pointer", color:C.red, fontSize:12, fontWeight:700,
          }}>Notify Eli</button>
          <button onClick={handleDismiss} style={{
            padding:"8px 14px", background:"transparent", border:`1px solid ${C.border}`,
            borderRadius:10, cursor:"pointer", color:C.muted, fontSize:12,
          }}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

// (Drive Mode overlay removed — session stays live during transit,
//  no special UI. Departure and Arrival cards handle the structure.)

// ── Waypoint card ─────────────────────────────────────────────────
// Fires when Maps still shows active navigation to a DIFFERENT destination.
// < 3 min stop = ignored silently. 3–10 min at known place = WaypointCard.
// 10+ min OR Maps nav ends = full LocationCard arrival instead.
// Three states: pending (all 3 buttons) | told (green + preview) | saved (amber)
// openSession:true = no "Save for Arrival" (exploring, no pending destination).
// In that mode: just Tell Eli | ×  — saving for a later arrival makes no sense
// when you're already wandering. Yellow Springs, local walks, etc.
function WaypointCard({ msg }) {
  const [state, setState] = useState(msg.initialState || "pending");
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  // ── told state — green confirmation + brief preview ──
  if (state === "told") {
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{
          background:"rgba(34,197,94,0.06)", border:`1px solid rgba(34,197,94,0.25)`,
          borderLeft:`3px solid ${C.green}`, borderRadius:14, padding:"11px 14px",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: msg.briefSent ? 8 : 0 }}>
            <div style={{
              width:28, height:28, borderRadius:14, flexShrink:0,
              background:C.surface, border:`1px solid ${C.border}`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
            }}>{msg.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.text }}>
                {msg.name}<span style={{ fontWeight:400, color:C.muted }}> · {msg.category}</span>
              </div>
              <div style={{ fontSize:10, color:C.muted }}>{msg.location} · {msg.duration}</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:6, height:6, borderRadius:3, background:C.green }} />
              <span style={{ fontSize:10, color:C.green, fontWeight:600 }}>Told Eli</span>
            </div>
          </div>
          {msg.briefSent && (
            <div style={{
              fontSize:11, color:C.textDim, fontStyle:"italic", lineHeight:1.55,
              paddingLeft:14, borderLeft:`2px solid rgba(34,197,94,0.25)`,
              marginLeft:14,
            }}>"{msg.briefSent}"</div>
          )}
        </div>
      </div>
    );
  }

  // ── saved state — amber "added to arrival brief" ──
  if (state === "saved") {
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{
          background:"rgba(245,158,11,0.06)", border:`1px solid rgba(245,158,11,0.25)`,
          borderLeft:`3px solid ${C.amber}`, borderRadius:14, padding:"11px 14px",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{
              width:28, height:28, borderRadius:14, flexShrink:0,
              background:C.surface, border:`1px solid ${C.border}`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:14,
            }}>{msg.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:C.text }}>
                {msg.name}<span style={{ fontWeight:400, color:C.muted }}> · {msg.category}</span>
              </div>
              <div style={{ fontSize:10, color:C.muted }}>{msg.location} · {msg.duration}</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:6, height:6, borderRadius:3, background:C.amber }} />
              <span style={{ fontSize:10, color:C.amber, fontWeight:600 }}>Saved for arrival</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── pending state — all 3 interactive buttons ──
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{
        background:C.raised, border:`1px solid ${C.border}`,
        borderRadius:14, padding:"11px 14px",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <div style={{
            width:32, height:32, borderRadius:16, flexShrink:0,
            background:C.surface, border:`1px solid ${C.border}`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:16,
          }}>{msg.icon}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.text, lineHeight:1.3 }}>
              {msg.name}<span style={{ fontWeight:400, color:C.muted }}> · {msg.category}</span>
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>
              {msg.location} · {msg.duration}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={() => setState("told")} style={{
            flex:1, padding:"7px 0", borderRadius:10, cursor:"pointer",
            background:C.accent+"18", border:`1px solid ${C.accent}44`,
            color:C.accent, fontSize:11, fontWeight:700,
          }}>Tell Eli</button>
          {!msg.openSession && (
            <button onClick={() => setState("saved")} style={{
              flex:1, padding:"7px 0", borderRadius:10, cursor:"pointer",
              background:C.amber+"12", border:`1px solid ${C.amber}44`,
              color:C.amber, fontSize:11, fontWeight:700,
            }}>Save for Arrival</button>
          )}
          <button onClick={() => setDismissed(true)} style={{
            padding:"7px 12px", borderRadius:10, cursor:"pointer",
            background:"transparent", border:`1px solid ${C.border}`,
            color:C.muted, fontSize:14, lineHeight:1,
          }}>×</button>
        </div>
      </div>
    </div>
  );
}

// ── Mode transition card ──────────────────────────────────────────
// Compact centered divider — fires at each mode handoff during a multi-modal trip.
// Offline variant (underground, tunnel) shows GPS warning + estimated duration.
function ModeTransitionCard({ msg }) {
  return (
    <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}>
      <div style={{
        display:"inline-flex", alignItems:"center", gap:7,
        padding:"5px 14px", borderRadius:30,
        background: msg.offline ? C.amber+"0A" : C.raised,
        border:`1px solid ${msg.offline ? C.amber+"44" : C.border}`,
      }}>
        <span style={{ fontSize:14 }}>{msg.fromIcon}</span>
        <span style={{ fontSize:10, color:C.muted }}>{msg.fromLabel}</span>
        <span style={{ fontSize:9, color:C.muted }}>→</span>
        <span style={{ fontSize:14 }}>{msg.toIcon}</span>
        <span style={{ fontSize:10, color: msg.offline ? C.amber : C.textDim, fontWeight:600 }}>
          {msg.toLabel}
        </span>
        <span style={{ fontSize:9, color: msg.offline ? C.amber+"99" : C.muted }}>
          · {msg.location}
        </span>
        {msg.offline && <span style={{ fontSize:11 }}>📵</span>}
      </div>
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────
function EmptySession() {
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 32px" }}>
      <div style={{ marginBottom:24 }}><EliAvatar size={72} fontSize={32} /></div>
      <div style={{ fontSize:28, fontWeight:600, color:C.text, textAlign:"center", lineHeight:1.35, marginBottom:10 }}>
        What's on<br />your mind?
      </div>
      <div style={{ fontSize:14, color:C.muted, textAlign:"center", lineHeight:1.65 }}>
        Gemini enriches your words with context.<br />Eli responds as if he's there.
      </div>
    </div>
  );
}

function EmptyOneOff() {
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 32px" }}>
      <div style={{
        width:72, height:72, borderRadius:36, marginBottom:24,
        background:"linear-gradient(135deg, #2A1650, #16284A)",
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:32,
      }}>⚡</div>
      <div style={{ fontSize:28, fontWeight:600, color:C.text, textAlign:"center", lineHeight:1.35, marginBottom:10 }}>
        Drop something<br />for Eli
      </div>
      <div style={{ fontSize:14, color:C.muted, textAlign:"center", lineHeight:1.65 }}>
        One message. One reply.<br />No session, no background context.
      </div>
    </div>
  );
}

// ── Staging tray ──────────────────────────────────────────────────
function StagingTray({ items, onRemove }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:6, padding:"8px 14px 0" }}>
      {items.map(item => (
        <div key={item.id} style={{
          display:"inline-flex", alignItems:"center", gap:4,
          background:C.raised, border:`1px solid ${C.border}`,
          borderRadius:20, padding:"3px 7px 3px 8px", maxWidth:150,
        }}>
          <span style={{fontSize:12}}>{item.icon}</span>
          <span style={{fontSize:11,color:C.textDim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:80}}>{item.label}</span>
          <button onClick={()=>onRemove(item.id)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:15,lineHeight:1,padding:0,flexShrink:0}}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Media picker ──────────────────────────────────────────────────
function MediaPicker({ onSelect, onClose }) {
  const captures = [
    { mode:"photo", icon:"📷", label:"Take Photo" },
    { mode:"video", icon:"🎥", label:"Record Video" },
    { mode:"audio", icon:"🎙️", label:"Record Audio" },
  ];
  return (
    <>
      <div onClick={onClose} style={{position:"absolute",inset:0,zIndex:50}} />
      <div style={{
        position:"absolute", bottom:82, left:14, zIndex:60,
        background:C.raised, border:`1px solid ${C.border}`,
        borderRadius:20, overflow:"hidden",
        boxShadow:"0 8px 32px rgba(0,0,0,0.7)", minWidth:210,
      }}>
        {captures.map(o => (
          <button key={o.mode} onClick={()=>{ onSelect(o.mode, false); onClose(); }} style={{
            display:"flex", alignItems:"center", gap:12,
            width:"100%", padding:"12px 16px", background:"transparent",
            border:"none", borderBottom:`1px solid ${C.border}`,
            cursor:"pointer", textAlign:"left",
          }}>
            <span style={{fontSize:20}}>{o.icon}</span>
            <span style={{fontSize:13, color:C.text, fontWeight:500}}>{o.label}</span>
          </button>
        ))}
        <button onClick={()=>{ onSelect("library", true); onClose(); }} style={{
          display:"flex", alignItems:"center", gap:12,
          width:"100%", padding:"12px 16px",
          background:C.accentDim, border:"none", cursor:"pointer", textAlign:"left",
        }}>
          <span style={{fontSize:20}}>🗂️</span>
          <div>
            <div style={{fontSize:13, color:C.accent, fontWeight:600}}>Choose from Library</div>
            <div style={{fontSize:10, color:C.muted, marginTop:1}}>Photos · Videos · Audio · Docs</div>
          </div>
        </button>
      </div>
    </>
  );
}

// ── Settings panel ────────────────────────────────────────────────
function SettingsPanel({ services, onToggle, onClose }) {
  const sections = [
    { heading:"Context Services", rows:[
      {key:"gps",      icon:"📍",label:"Location / GPS"},
      {key:"weather",  icon:"☁️",label:"Weather"},
      {key:"fitbit",   icon:"💓",label:"Fitbit / Health Connect"},
      {key:"ambient",  icon:"🎤",label:"Ambient Audio"},
      {key:"calendar", icon:"📅",label:"Calendar"},
      {key:"music",    icon:"🎵",label:"Now Playing"},
    ]},
    { heading:"Voice & Audio", rows:[
      {key:"elevenlabs",  icon:"🔊",label:"Autoplay Eli's voice",
       hint:"Auto-plays dialog on each message. Off = manual ▶ per bubble."},
      {key:"voiceVerify", icon:"🎙️",label:"Voice verification (PTT gate)",
       hint:"Confirms Tim's voice on mic input before packaging."},
    ]},
    { heading:"People", rows:[
      {key:"people",icon:"👥",label:"People",type:"link",hint:"Manage roster →"},
    ]},
    { heading:"Session Behavior", rows:[
      {key:"pulse",  icon:"💤",label:"Pulse Mode (text-only, 15 min)"},
      {key:"safety", icon:"🚗",label:"Safety Mode (auto on drive)"},
    ]},
  ];
  return (
    <>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)",zIndex:70}} />
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,zIndex:80,
        background:C.surface,borderRadius:"24px 24px 0 0",
        border:`1px solid ${C.border}`,borderBottom:"none",
        padding:"0 20px 44px",maxHeight:"80%",overflowY:"auto",
      }}>
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 16px"}}>
          <div style={{width:40,height:4,borderRadius:2,background:C.border}} />
        </div>
        {sections.map(sec => (
          <div key={sec.heading}>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4,marginTop:8}}>{sec.heading}</div>
            {sec.rows.map(r => (
              r.type==="link" ? (
                <button key={r.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 0",background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                  <span style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:17}}>{r.icon}</span>
                    <span style={{fontSize:14,color:C.text}}>{r.label}</span>
                  </span>
                  <span style={{fontSize:13,color:C.accent}}>{r.hint}</span>
                </button>
              ) : (
                <div key={r.key}>
                  <button onClick={()=>onToggle(r.key)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 0",background:"transparent",border:"none",borderBottom:r.hint?"none":`1px solid ${C.border}`,cursor:"pointer"}}>
                    <span style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:17}}>{r.icon}</span>
                      <span style={{fontSize:14,color:services[r.key]?C.text:C.muted}}>{r.label}</span>
                    </span>
                    <div style={{width:44,height:26,borderRadius:13,background:services[r.key]?C.accent:C.raised,border:`1px solid ${services[r.key]?C.accent:C.border}`,position:"relative",transition:"background 0.2s"}}>
                      <div style={{position:"absolute",top:3,left:services[r.key]?21:3,width:18,height:18,borderRadius:9,background:"#fff",transition:"left 0.2s"}} />
                    </div>
                  </button>
                  {r.hint&&<div style={{fontSize:10,color:C.muted,lineHeight:1.5,paddingBottom:10,paddingLeft:27,borderBottom:`1px solid ${C.border}`}}>{r.hint}</div>}
                </div>
              )
            ))}
          </div>
        ))}
      </div>
    </>
  );
}


// ── Timeline panel ────────────────────────────────────────────────
function TimelinePanel({ onClose, timeline }) {
  const entries = timeline || TIMELINE_YS;
  const stats =
    timeline === TIMELINE_DET ? [{v:"26",l:"Messages"},{v:"5",l:"Locations"},{v:"12h 48m",l:"Duration"}] :
    timeline === TIMELINE_DC  ? [{v:"22",l:"Messages"},{v:"4",l:"Locations"},{v:"6h 19m",l:"Duration"}] :
    timeline === TIMELINE_KI  ? [{v:"27",l:"Messages"},{v:"2",l:"Locations"},{v:"9h 13m",l:"Duration"}] :
    timeline === TIMELINE_CZ  ? [{v:"20",l:"Messages"},{v:"9",l:"Exhibits"},{v:"7h 01m",l:"Duration"}] :
    [{v:"21",l:"Messages"},{v:"3",l:"Stops"},{v:"4h 26m",l:"Duration"}];
  return (
    <>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",zIndex:70}} />
      <div style={{position:"absolute",top:0,bottom:0,left:0,width:"72%",zIndex:80,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"52px 20px 16px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:4}}>Session Timeline</div>
          <div style={{display:"flex",gap:16}}>
            {stats.map(s=>(
              <div key={s.l} style={{textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:700,color:C.accent}}>{s.v}</div>
                <div style={{fontSize:10,color:C.muted}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          {entries.map((entry,i) => (
            <div key={i} style={{display:"flex",gap:12,marginBottom:20}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{width:32,height:32,borderRadius:16,background:C.raised,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{entry.icon}</div>
                {i<entries.length-1&&<div style={{width:1,flex:1,background:C.border,marginTop:4,marginBottom:-16,minHeight:20}} />}
              </div>
              <div style={{paddingTop:4}}>
                <div style={{fontSize:13,fontWeight:600,color:C.text,lineHeight:1.3}}>{entry.label}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{entry.sub}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{entry.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Capture modal ─────────────────────────────────────────────────
function CaptureModal({ initialMode="photo", onCapture, onClose }) {
  const [mode,setMode]=useState(initialMode);
  const [recording,setRecording]=useState(false);
  const [timer,setTimer]=useState(0);
  const [flash,setFlash]=useState(false);
  const [captured,setCaptured]=useState([]);
  const [wave,setWave]=useState(Array(26).fill(8));
  const timerRef=useRef(null);

  useEffect(()=>{if(recording&&mode==="audio"){const id=setInterval(()=>setWave(Array.from({length:26},()=>8+Math.random()*44)),80);return()=>clearInterval(id);}else setWave(Array(26).fill(8));},[recording,mode]);
  useEffect(()=>()=>clearInterval(timerRef.current),[]);
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const doCapture=()=>{
    if(mode==="photo"){setFlash(true);setTimeout(()=>setFlash(false),130);const n=captured.filter(c=>c.type==="photo").length+1;setCaptured(p=>[...p,{id:Date.now(),type:"photo",icon:"🖼️",label:`photo_${String(n).padStart(3,"0")}.jpg`}]);}
    else if(!recording){setRecording(true);setTimer(0);timerRef.current=setInterval(()=>setTimer(t=>t+1),1000);}
    else{clearInterval(timerRef.current);setRecording(false);const dur=timer+1,n=captured.filter(c=>c.type===mode).length+1;setCaptured(p=>[...p,{id:Date.now(),type:mode,icon:mode==="video"?"🎬":"🎵",label:mode==="video"?`clip_${dur}s.mp4`:`audio_${dur}s.m4a`}]);setTimer(0);}
  };
  const done=()=>{clearInterval(timerRef.current);if(captured.length>0)onCapture(captured);onClose();};
  return (
    <div style={{position:"absolute",inset:0,zIndex:200,background:C.bg,borderRadius:38,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {flash&&<div style={{position:"absolute",inset:0,background:"#fff",zIndex:300,borderRadius:38,pointerEvents:"none",opacity:0,animation:"shutterFlash 0.13s ease-out forwards"}} />}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,padding:"0 24px"}}>
        {(mode==="photo"||mode==="video")&&(
          <div style={{width:"100%",aspectRatio:"4/3",background:"linear-gradient(160deg,#06070f,#0d0f20)",borderRadius:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{color:C.muted,fontSize:12}}>Camera preview</div>
          </div>
        )}
        {mode==="audio"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
            <div style={{display:"flex",alignItems:"flex-end",gap:3,height:64}}>
              {wave.map((h,i)=><div key={i} style={{width:5,height:h,borderRadius:3,background:recording?`hsl(${240+i*3},80%,${50+h*0.4}%)`:C.border,transition:recording?"height 0.08s":"height 0.5s"}} />)}
            </div>
            <div style={{fontSize:recording?28:14,fontWeight:recording?700:400,color:recording?C.accent:C.muted}}>{recording?fmt(timer):"Tap to start recording"}</div>
          </div>
        )}
      </div>
      <div style={{display:"flex",background:"rgba(8,9,16,0.92)",borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        {[{id:"photo",icon:"📷",label:"Photo"},{id:"video",icon:"🎥",label:"Video"},{id:"audio",icon:"🎙️",label:"Audio"}].map(m=>(
          <button key={m.id} onClick={()=>!recording&&setMode(m.id)} style={{flex:1,padding:"10px 0 8px",background:"transparent",border:"none",borderBottom:`2px solid ${mode===m.id?C.accent:"transparent"}`,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{fontSize:20}}>{m.icon}</span>
            <span style={{fontSize:11,fontWeight:mode===m.id?700:400,color:mode===m.id?C.accent:C.muted}}>{m.label}</span>
          </button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:28,padding:"20px 24px 36px",background:"rgba(8,9,16,0.92)"}}>
        <button onClick={onClose} style={{width:48,height:48,borderRadius:24,background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.6)",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        <button onClick={doCapture} style={{width:74,height:74,borderRadius:37,background:"transparent",border:"4px solid rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {mode==="photo"?<div style={{width:56,height:56,borderRadius:28,background:"#fff"}} />:recording?<div style={{width:26,height:26,borderRadius:4,background:C.red}} />:<div style={{width:22,height:22,borderRadius:11,background:C.red}} />}
        </button>
        <button onClick={done} style={{width:48,height:48,borderRadius:24,background:captured.length>0?C.accent+"30":"rgba(255,255,255,0.07)",border:`1.5px solid ${captured.length>0?C.accent:"rgba(255,255,255,0.12)"}`,color:captured.length>0?C.accent:"rgba(255,255,255,0.3)",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {captured.length>0?`✓ ${captured.length}`:"✓"}
        </button>
      </div>
    </div>
  );
}

// ── VenueMode card ────────────────────────────────────────────────
// Compact centered pill — fires when GPS + Places detects amusement_park,
// stadium, mall, airport, campus, or fairground.
// Suppresses queue/line WaypointCards; food/cafe/store/bar still fire.
// ── Unknown person card ───────────────────────────────────────────
// Fires when on-device speaker model detects an unrecognized voice
// OR when on-device ML Kit + MobileFaceNet detects an unrecognized face
// in a photo Tim sent. Voice variant: 🎙️ icon + detected quote.
// Face variant: 🧑 icon + cropped thumbnail + confidence score.
// "Add Person" enrolls them in the People system — voice embedding
// and/or face embedding stored in a unified Person Card. Voice
// enrollment requires 3 samples before committing (multi-sample).
// If the name matches an existing person, the new modality links
// to the existing record.
function UnknownPersonCard({ msg }) {
  const [state, setState] = useState("prompt"); // prompt | naming | enrolled | dismissed
  const [name, setName] = useState("");
  const isVoice = msg.variant !== "face";
  if (state === "dismissed") return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{
        background:C.raised, border:`1px solid ${C.border}`,
        borderRadius:16, padding:"12px 14px", maxWidth:320,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
          <span style={{ fontSize:14 }}>{isVoice ? "🎙️" : "🧑"}</span>
          <span style={{ fontSize:12, fontWeight:700, color:C.text }}>
            {isVoice ? "New voice detected" : "New face detected"}
          </span>
        </div>
        {isVoice ? (
          <div>
            <div style={{ fontSize:12, color:C.textDim, marginBottom:4, fontStyle:"italic" }}>
              {msg.quote || "Someone nearby said something — I couldn't make it out clearly."}
            </div>
            <div style={{ fontSize:10, color:C.muted, marginBottom:10 }}>
              Sample 1 of 3 — needs more encounters to enroll
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{
              width:40, height:40, borderRadius:20, background:C.bg,
              border:`1px solid ${C.border}`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:18,
            }}>🧑</div>
            <div>
              <span style={{ fontSize:12, color:C.textDim, fontStyle:"italic", display:"block" }}>
                {msg.faceNote || "Unrecognized person in your photo"}
              </span>
              {msg.confidence && (
                <span style={{ fontSize:10, color:C.muted }}>
                  Confidence: {msg.confidence}
                </span>
              )}
            </div>
          </div>
        )}
        {msg.suggestion && state === "prompt" && (
          <div style={{ fontSize:11, color:C.amber, marginBottom:8 }}>
            Is this {msg.suggestion}?
          </div>
        )}
        {state === "prompt" && (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setState("naming")} style={{
              flex:1, padding:"7px 0", borderRadius:20, cursor:"pointer",
              background:C.accent+"18", border:`1px solid ${C.accent}44`,
              color:C.accent, fontSize:12, fontWeight:600,
            }}>Add Person</button>
            <button onClick={() => setState("dismissed")} style={{
              flex:1, padding:"7px 0", borderRadius:20, cursor:"pointer",
              background:"transparent", border:`1px solid ${C.border}`,
              color:C.muted, fontSize:12,
            }}>Ignore</button>
          </div>
        )}
        {state === "naming" && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Who is this?"
              style={{
                flex:1, padding:"7px 10px", borderRadius:12, fontSize:12,
                background:C.bg, border:`1px solid ${C.border}`, color:C.text,
                outline:"none",
              }}
            />
            <button onClick={() => { if (name.trim()) setState("enrolled"); }} style={{
              padding:"7px 14px", borderRadius:20, cursor:"pointer",
              background:C.accent, border:"none", color:"#fff",
              fontSize:12, fontWeight:600, opacity: name.trim() ? 1 : 0.4,
            }}>Add</button>
          </div>
        )}
        {state === "enrolled" && (
          <div style={{ fontSize:12, color:C.green }}>
            ✓ {name} added to People {isVoice ? "🎙️" : "📷"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AudioSnap card ────────────────────────────────────────────────
// Fires when Tim takes a photo during an active session. The app does
// a 5-second mic burst at shutter tap and sends the ambient audio to
// Gemini alongside the image. No always-on buffer — the phone is in
// Tim's pocket most of the time. Audio only captured when phone is out.
function AudioSnapCard({ msg }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{
        background:C.raised, border:`1px solid ${C.border}`,
        borderRadius:16, padding:"10px 14px", maxWidth:320,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
          <span style={{ fontSize:14 }}>📸</span>
          <span style={{ fontSize:12, fontWeight:700, color:C.text }}>AudioSnap</span>
          <span style={{ fontSize:10, color:C.muted, marginLeft:"auto" }}>~5s captured</span>
        </div>
        <div style={{ fontSize:11, color:C.textDim, marginBottom:6 }}>
          {msg.description || "Ambient audio captured with photo"}
        </div>
        {/* Waveform visualization placeholder */}
        <div style={{
          height:28, borderRadius:6, overflow:"hidden",
          background:C.bg, display:"flex", alignItems:"center", gap:1, padding:"0 6px",
        }}>
          {Array.from({length:40}, (_,i) => (
            <div key={i} style={{
              flex:1, height: 4 + Math.random() * 18, borderRadius:1,
              background: playing ? C.accent : C.muted+"60",
              transition:"background 0.2s",
            }} />
          ))}
        </div>
        <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
          <button onClick={() => setPlaying(!playing)} style={{
            padding:"4px 12px", borderRadius:16, cursor:"pointer", fontSize:11,
            background: playing ? C.accent+"18" : "transparent",
            border:`1px solid ${playing ? C.accent+"44" : C.border}`,
            color: playing ? C.accent : C.muted,
          }}>{playing ? "⏸ Pause" : "▶ Play"}</button>
          <span style={{ fontSize:10, color:C.muted }}>Sent to Gemini with photo</span>
        </div>
      </div>
    </div>
  );
}

// RideCards enabled while VenueMode is active.
function VenueModeCard({ msg }) {
  return (
    <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}>
      <div style={{
        display:"inline-flex", alignItems:"center", gap:8,
        padding:"6px 14px", borderRadius:30,
        background:"rgba(124,92,255,0.08)", border:"1px solid rgba(124,92,255,0.25)",
      }}>
        <span style={{ fontSize:14 }}>🏟️</span>
        <div>
          <span style={{ fontSize:11, color:C.accent, fontWeight:600 }}>
            VenueMode active · {msg.venue}
          </span>
          <span style={{ fontSize:10, color:C.muted }}> · {msg.note}</span>
        </div>
      </div>
    </div>
  );
}

// ── Ride card ─────────────────────────────────────────────────────
// Detected by accelerometer burst >2.5g sustained + GPS closed-loop track.
// Fires inside VenueMode sessions. Logs ride name/type/duration/G/speed.
// "Share" notifies Eli immediately with ride stats.
function RideCard({ msg }) {
  const [shared, setShared] = useState(false);
  return (
    <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}>
      <div style={{
        display:"inline-flex", alignItems:"center", gap:10,
        background:C.raised, border:`1px solid ${C.border}`,
        borderRadius:40, padding:"6px 12px 6px 10px",
      }}>
        <div style={{ width:32, height:32, borderRadius:16, flexShrink:0,
          background:"rgba(124,92,255,0.12)", border:"1px solid rgba(124,92,255,0.3)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:16,
        }}>🎢</div>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{msg.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>
            {msg.type} · {msg.duration} · {msg.peakG} peak · {msg.topSpeed}
          </div>
        </div>
        {!shared ? (
          <button onClick={() => setShared(true)} style={{
            padding:"4px 10px", borderRadius:20, cursor:"pointer",
            background:C.accent+"18", border:`1px solid ${C.accent}44`,
            color:C.accent, fontSize:11, fontWeight:600,
          }}>Share</button>
        ) : (
          <span style={{ fontSize:11, color:C.green, paddingRight:4 }}>✓ Eli knows</span>
        )}
      </div>
    </div>
  );
}

// ── Session journal card ───────────────────────────────────────────
// Fires at session end. Gemini auto-generates a narrative journal entry
// in Tim's voice from: GPS track, all messages, Now Playing history.
// "Save to Vault" writes the draft to Obsidian via the vault REST API.
function SessionJournalCard({ msg }) {
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{
        background:"rgba(124,92,255,0.06)", border:"1px solid rgba(124,92,255,0.3)",
        borderLeft:`3px solid ${C.accent}`, borderRadius:14, padding:"13px 15px",
      }}>
        <div style={{ fontSize:10, color:C.accent, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>
          📓 Session Journal · {msg.time}
        </div>
        <div style={{ color:C.text, fontWeight:700, fontSize:14, marginBottom:2 }}>{msg.title}</div>
        <div style={{ color:C.muted, fontSize:11, marginBottom:10 }}>
          {msg.date} · {msg.duration} · {msg.locations?.length} locations
        </div>
        {msg.soundtrack?.length > 0 && (
          <div style={{ background:C.surface, borderRadius:10, padding:"8px 12px", marginBottom:10 }}>
            <div style={{ fontSize:10, color:C.muted, marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>🎵 Trip soundtrack</div>
            {msg.soundtrack.map((track,i) => (
              <div key={i} style={{ fontSize:11, color:C.textDim, lineHeight:1.8 }}>· {track}</div>
            ))}
          </div>
        )}
        <div style={{ fontSize:12, color:C.textDim, lineHeight:1.7, marginBottom:10,
          fontStyle:"italic", borderLeft:"2px solid rgba(124,92,255,0.2)", paddingLeft:10 }}>
          "{msg.preview}..."
        </div>
        <div style={{ fontSize:10, color:C.muted, marginBottom:8 }}>
          💡 Gemini drafted this from your session · GPS track · messages · Now Playing log
        </div>
        {!saved ? (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setSaved(true)} style={{
              flex:1, padding:"8px 0", borderRadius:10, cursor:"pointer",
              background:C.accent+"18", border:`1px solid ${C.accent}44`,
              color:C.accent, fontSize:12, fontWeight:700,
            }}>Save to Vault →</button>
            <button onClick={() => setDismissed(true)} style={{
              padding:"8px 14px", background:"transparent", border:`1px solid ${C.border}`,
              borderRadius:10, cursor:"pointer", color:C.muted, fontSize:12,
            }}>Discard</button>
          </div>
        ) : (
          <div style={{ padding:"8px 10px", borderRadius:10, textAlign:"center",
            background:C.green+"12", border:`1px solid ${C.green}33`,
            color:C.green, fontSize:12,
          }}>✓ Saved to Obsidian vault · {msg.date}</div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function EliBridge() {
  const [mode,setMode]             = useState("session");
  const [showChat,setShowChat]     = useState(false);
  const [connected,setConnected]   = useState(true);
  const [micActive,setMicActive]   = useState(false);
  const [text,setText]             = useState("");
  const [staged,setStaged]         = useState([]);
  const [pickerOpen,setPicker]     = useState(false);
  const [captureMode,setCMode]     = useState("photo");
  const [cameraOpen,setCamera]     = useState(false);
  const [settingsOpen,setSettings] = useState(false);
  const [timelineOpen,setTimeline] = useState(false);
  const [demoScenario,setDemo]     = useState("ys");
  const inputRef = useRef(null);

  const activeMessages =
    demoScenario==="ys"  ? MESSAGES_YS  :
    demoScenario==="cz"  ? MESSAGES_CZ  :
    demoScenario==="ki"  ? MESSAGES_KI  :
    demoScenario==="dc"  ? MESSAGES_DC  :
    MESSAGES_DET;
  const activeTimeline =
    demoScenario==="ys"  ? TIMELINE_YS  :
    demoScenario==="cz"  ? TIMELINE_CZ  :
    demoScenario==="ki"  ? TIMELINE_KI  :
    demoScenario==="dc"  ? TIMELINE_DC  :
    TIMELINE_DET;

  const [services,setServices] = useState({
    gps:true,weather:true,fitbit:true,ambient:true,calendar:true,music:true,
    elevenlabs:true,voiceVerify:true,pulse:false,safety:false,
  });
  const toggleSvc = k => setServices(s=>({...s,[k]:!s[k]}));
  const handleModeSwitch = m => { setMode(m); setShowChat(false); setStaged([]); setText(""); };
  const removeStaged = id => setStaged(p=>p.filter(i=>i.id!==id));
  const openCapture = (m, fromLibrary) => {
    if (!fromLibrary) { setCMode(m); setCamera(true); }
    else { setStaged(p=>[...p,{id:Date.now(),icon:"🗂️",label:"media_file"}]); }
  };
  const handleMicTap = () => {
    if (!micActive) { setMicActive(true); }
    else { setMicActive(false); setStaged(p=>[...p,{id:Date.now(),icon:"🎵",label:`voice_${Date.now()}.m4a`}]); }
  };
  const hasSend = text.trim().length>0||staged.length>0;

  const DEMOS = [
    {id:"ys",  icon:"🚶", label:"Yellow Springs"},
    {id:"cz",  icon:"🐘", label:"Cincy Zoo"},
    {id:"ki",  icon:"🎢", label:"Kings Island"},
    {id:"dc",  icon:"🚇", label:"DC Transit"},
    {id:"det", icon:"🚗", label:"Detroit"},
  ];

  return (
    <div style={{
      minHeight:"100vh", background:"#0F0D11",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Inter',-apple-system,sans-serif", padding:24,
    }}>
      <div style={{
        width:390, height:844, background:C.bg, borderRadius:52,
        border:"10px solid #111016",
        boxShadow:"0 40px 100px rgba(0,0,0,0.95), 0 0 0 1px #2A2540",
        display:"flex", flexDirection:"column",
        overflow:"hidden", position:"relative",
      }}>
        {/* Overlays */}
        {cameraOpen   && <CaptureModal initialMode={captureMode} onCapture={items=>setStaged(p=>[...p,...items])} onClose={()=>setCamera(false)} />}
        {pickerOpen   && <MediaPicker onSelect={(m,lib)=>openCapture(m,lib)} onClose={()=>setPicker(false)} />}
        {settingsOpen && <SettingsPanel services={services} onToggle={toggleSvc} onClose={()=>setSettings(false)} />}
        {timelineOpen && <TimelinePanel onClose={()=>setTimeline(false)} timeline={activeTimeline} />}

        {/* Status bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 26px 0",background:C.bg}}>
          <span style={{fontSize:12,fontWeight:600,color:C.textDim}}>9:41</span>
          <div style={{width:110,height:28,background:"#0F0D11",borderRadius:"0 0 18px 18px"}} />
          <span style={{fontSize:11,color:C.textDim}}>● WiFi 🔋</span>
        </div>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px 10px"}}>
          <button onClick={()=>setTimeline(true)} style={{background:"transparent",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",gap:4,padding:4}}>
            {[0,1,2].map(i=><div key={i} style={{width:i===1?14:20,height:2,borderRadius:1,background:C.muted}} />)}
          </button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <EliAvatar size={26} fontSize={11} />
            <div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,lineHeight:1}}>Eli Bridge</div>
              <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                <div style={{width:5,height:5,borderRadius:3,background:connected?C.green:C.red,boxShadow:connected?`0 0 5px ${C.green}`:"none"}} />
                <span style={{fontSize:10,color:connected?C.green:C.red}}>{connected?"Connected":"Disconnected"}</span>
              </div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {mode==="session"&&(
              <button onClick={()=>setSettings(true)} style={{width:34,height:34,borderRadius:10,background:C.raised,border:`1px solid ${C.border}`,cursor:"pointer",color:C.textDim,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⚙︎</button>
            )}
            <button onClick={()=>setConnected(!connected)} style={{height:34,padding:"0 12px",borderRadius:10,background:connected?C.red+"18":C.green+"18",border:`1px solid ${connected?C.red+"55":C.green+"55"}`,cursor:"pointer",color:connected?C.red:C.green,fontSize:12,fontWeight:600}}>{connected?"End":"Connect"}</button>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{display:"flex",margin:"0 20px 6px",background:C.raised,borderRadius:14,border:`1px solid ${C.border}`,padding:3}}>
          {[{id:"session",label:"Session"},{id:"oneoff",label:"Quick Send"}].map(m=>(
            <button key={m.id} onClick={()=>handleModeSwitch(m.id)} style={{flex:1,padding:"8px 0",background:mode===m.id?C.accent:"transparent",border:"none",borderRadius:11,cursor:"pointer",color:mode===m.id?"#fff":C.muted,fontSize:13,fontWeight:mode===m.id?700:400,transition:"all 0.2s"}}>{m.label}</button>
          ))}
        </div>

        {/* Chat area */}
        {!showChat ? (
          <div style={{flex:1,display:"flex",flexDirection:"column"}}>
            {mode==="session"?<EmptySession />:<EmptyOneOff />}
            <div style={{padding:"0 20px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              {/* Demo scenario toggle — 5 scenarios */}
              <div style={{display:"flex",background:C.surface,borderRadius:10,border:`1px solid ${C.border}`,padding:2,gap:2,flexWrap:"wrap",justifyContent:"center"}}>
                {DEMOS.map(sc => (
                  <button key={sc.id} onClick={()=>{ setDemo(sc.id); setShowChat(false); }} style={{
                    display:"flex",alignItems:"center",gap:4,padding:"5px 9px",
                    background:demoScenario===sc.id?C.raised:"transparent",
                    border:`1px solid ${demoScenario===sc.id?C.border:"transparent"}`,
                    borderRadius:8,cursor:"pointer",
                    color:demoScenario===sc.id?C.text:C.muted,fontSize:11,fontWeight:demoScenario===sc.id?600:400,
                  }}>
                    <span>{sc.icon}</span><span>{sc.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={()=>setShowChat(true)} style={{background:C.raised,border:`1px solid ${C.border}`,borderRadius:12,padding:"8px 20px",cursor:"pointer",color:C.muted,fontSize:12}}>Load demo chat ↓</button>
            </div>
          </div>
        ) : (
          <div style={{flex:1,overflowY:"auto",padding:"16px 16px 8px",scrollbarWidth:"thin",scrollbarColor:`${C.border} transparent`}}>
            {activeMessages.map(msg => {
              if (msg.from==="tim")        return <TimMsg            key={msg.id} msg={msg} />;
              if (msg.from==="eli")        return <EliMsg            key={msg.id} msg={msg} autoplay={services.elevenlabs} />;
              if (msg.from==="departure")  return <DepartureCard     key={msg.id} msg={msg} />;
              if (msg.from==="nowplaying") return <NowPlayingCard    key={msg.id} msg={msg} />;
              if (msg.from==="location")   return <LocationCard      key={msg.id} msg={msg} />;
              if (msg.from==="trivia")     return <TriviaCard        key={msg.id} msg={msg} />;
              if (msg.from==="calendar")   return <CalendarCard      key={msg.id} msg={msg} />;
              if (msg.from==="waypoint")   return <WaypointCard      key={msg.id} msg={msg} />;
              if (msg.from==="transition") return <ModeTransitionCard key={msg.id} msg={msg} />;
              if (msg.from==="weather")    return <WeatherCard       key={msg.id} msg={msg} />;
              if (msg.from==="interrupt")  return <InterruptCard     key={msg.id} msg={msg} />;
              if (msg.from==="unknownperson") return <UnknownPersonCard key={msg.id} msg={msg} />;
              if (msg.from==="audiosnap")     return <AudioSnapCard      key={msg.id} msg={msg} />;
              if (msg.from==="venuemode")  return <VenueModeCard     key={msg.id} msg={msg} />;
              if (msg.from==="ride")       return <RideCard          key={msg.id} msg={msg} />;
              if (msg.from==="journal")    return <SessionJournalCard key={msg.id} msg={msg} />;
              return null;
            })}
            {micActive&&(
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:C.red+"14",border:`1px solid ${C.red}44`,borderRadius:"18px 4px 18px 18px"}}>
                  <div style={{width:7,height:7,borderRadius:4,background:C.red,animation:"blink 1s infinite"}} />
                  <span style={{fontSize:12,color:C.red}}>Recording… tap 🎙️ to stop</span>
                </div>
              </div>
            )}
          </div>
        )}

        <StagingTray items={staged} onRemove={removeStaged} />

        {/* Input bar */}
        <div style={{padding:"10px 14px 34px",background:C.bg,borderTop:showChat?`1px solid ${C.border}`:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,background:C.raised,border:`1px solid ${C.border}`,borderRadius:28,padding:"6px 6px 6px 14px"}}>
            <button onClick={()=>setPicker(!pickerOpen)} style={{width:34,height:34,borderRadius:17,flexShrink:0,background:pickerOpen?C.accentDim:"transparent",border:`1.5px solid ${pickerOpen?C.accent:C.border}`,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",color:pickerOpen?C.accent:C.textDim,fontWeight:300}}>+</button>
            <textarea ref={inputRef} value={text} onChange={e=>setText(e.target.value)} placeholder={mode==="oneoff"?"Drop a message for Eli…":"Message Eli…"} rows={1} style={{flex:1,background:"transparent",border:"none",color:C.text,fontSize:16,resize:"none",outline:"none",fontFamily:"inherit",lineHeight:1.5,maxHeight:100,overflowY:"auto",padding:0}} />
            {hasSend?(
              <button style={{width:38,height:38,borderRadius:19,flexShrink:0,background:C.accent,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff",boxShadow:`0 0 12px ${C.accent}55`}}>↑</button>
            ):(
              <button onClick={handleMicTap} title={micActive?"Tap to stop":"Tap to record"} style={{width:38,height:38,borderRadius:19,flexShrink:0,background:micActive?C.red+"22":"transparent",border:`1.5px solid ${micActive?C.red:C.border}`,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",boxShadow:micActive?`0 0 12px ${C.red}55`:"none"}}>🎙️</button>
            )}
          </div>
        </div>
      </div>

      {/* Side notes */}
      <div style={{marginLeft:40,maxWidth:240,display:"flex",flexDirection:"column",gap:18}}>
        <div>
          <div style={{color:"#fff",fontWeight:700,fontSize:15,marginBottom:6}}>Eli Bridge v10</div>
          <div style={{color:C.textDim,fontSize:12,lineHeight:1.9}}>
            <strong style={{color:C.text}}>5 demo tabs</strong> → switch scenario<br />
            <strong style={{color:C.text}}>Load demo chat</strong> → full trip flow<br />
            <strong style={{color:C.text}}>≡</strong> → session timeline · <strong style={{color:C.text}}>⚙</strong> → settings
          </div>
        </div>
        {[
          {icon:"🚶", color:C.accent,   label:"Yellow Springs with Hank",
           desc:"Lynchburg → US-68 N → Xenia Ave. Open session (no pending destination). WaypointCards show Tell Eli | × only — no Save for Arrival. Dark Star Comics, The Emporium, Ha Ha Pizza. SessionJournalCard closes."},
          {icon:"🐘", color:"#A78BFA", label:"Cincinnati Zoo — full day",
           desc:"Lynchburg → I-71 S → Cincinnati Zoo. Nine exhibit LocationCards (Elephant Trek, Gorilla World, Komodo dragon, Manatee Springs + more). Full exhibit-hop session with lunch WaypointCard."},
          {icon:"🎢", color:C.amber,   label:"Kings Island — VenueMode demo",
           desc:"VenueModeCard fires on arrival. Queue dwell suppressed — no false WaypointCards in line. RideCards auto-detect Beast, Orion, Banshee, Mystic Timbers via accelerometer + GPS loop. Food stops still surface."},
          {icon:"🚇", color:C.sky,     label:"DC Transit — multi-modal",
           desc:"Silver Spring (Holy Name College) → Metro Red Line → Union Station → Metro Blue → National Mall (Friars). ModeTransitionCards at each handoff. GPS-offline underground. Full leg summary on arrival."},
          {icon:"🚗", color:C.green,   label:"Detroit road trip — solo",
           desc:"Lynchburg → I-75 N → Armstrong Museum (Wapakoneta) → Tony Packo's (Toledo) → Gage Cannabis (Detroit). Michigan weed run. Now Playing auto-shares. SessionJournalCard: Space Oddity to Take It Easy."},
          {icon:"🏟️", color:C.accent,  label:"VenueMode",
           desc:"Fires at: amusement parks, stadiums, malls, airports, campuses, fairgrounds, national parks. Queue dwell (no Places entry) naturally suppressed. Food/cafe/store/bar WaypointCards still active. RideCards enabled."},
          {icon:"🎢", color:C.amber,   label:"RideCard",
           desc:"Accelerometer burst >2.5g sustained + GPS closed loop. Surfaces ride name, type, duration, peak G, top speed. Share → Eli gets the stats immediately. Automatically fires inside VenueMode sessions."},
          {icon:"📓", color:"#A78BFA", label:"SessionJournalCard",
           desc:"Fires at session end. Gemini drafts a journal entry in Tim's voice from GPS track + messages + Now Playing history. Trip soundtrack listed. Save to Vault → writes to Obsidian via REST API. Discard removes it."},
          {icon:"☁️", color:C.sky,     label:"WeatherCard + Barometer",
           desc:"Fires on Gemini forecast shift OR Pixel barometric pressure drop (1-2 hPa / 15-30 min). Barometer gives early warning before forecast APIs. Sky-blue theme, dismiss only. Severe alert escalates to red InterruptCard."},
          {icon:"📍", color:C.accent,  label:"Smart arrival brief",
           desc:"Interacted during transit → short additive brief, Eli already has context. Saved waypoints fold in automatically. Silent transit → Gemini auto-compiles full trip summary at LocationCard."},
        ].map(item=>(
          <div key={item.label} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:28,height:28,borderRadius:8,flexShrink:0,background:item.color+"18",border:`1px solid ${item.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:item.color,fontWeight:700}}>{item.icon}</div>
            <div>
              <div style={{color:item.color,fontSize:12,fontWeight:700,marginBottom:2}}>{item.label}</div>
              <div style={{color:C.textDim,fontSize:11,lineHeight:1.5}}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes blink        { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes shutterFlash { 0%{opacity:0.85} 100%{opacity:0} }
        textarea { scrollbar-width:none; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:2px; }
      `}</style>
    </div>
  );
}
