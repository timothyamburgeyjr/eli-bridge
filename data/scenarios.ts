import type { ChatItem } from "@/components/chat/ChatStream";
import type { TimelineEntry, TimelineStat } from "@/components/session/SessionTimeline";
import { YS_MESSAGES, YS_TIMELINE, YS_STATS } from "./demoYellowSprings";
import { CZ_MESSAGES, CZ_TIMELINE, CZ_STATS } from "./demoCincyZoo";
import { KI_MESSAGES, KI_TIMELINE, KI_STATS } from "./demoKingsIsland";
import { DC_MESSAGES, DC_TIMELINE, DC_STATS } from "./demoDCTransit";
import { DET_MESSAGES, DET_TIMELINE, DET_STATS } from "./demoDetroit";

export type ScenarioId = "ys" | "cz" | "ki" | "dc" | "det";

export interface Scenario {
  id: ScenarioId;
  icon: string;
  label: string;
  messages: ChatItem[];
  timeline: TimelineEntry[];
  stats: TimelineStat[];
}

export const SCENARIOS: Scenario[] = [
  { id: "ys", icon: "🚶", label: "Yellow Springs", messages: YS_MESSAGES, timeline: YS_TIMELINE, stats: YS_STATS },
  { id: "cz", icon: "🐘", label: "Cincy Zoo", messages: CZ_MESSAGES, timeline: CZ_TIMELINE, stats: CZ_STATS },
  { id: "ki", icon: "🎢", label: "Kings Island", messages: KI_MESSAGES, timeline: KI_TIMELINE, stats: KI_STATS },
  { id: "dc", icon: "🚇", label: "DC Transit", messages: DC_MESSAGES, timeline: DC_TIMELINE, stats: DC_STATS },
  { id: "det", icon: "🚗", label: "Detroit", messages: DET_MESSAGES, timeline: DET_TIMELINE, stats: DET_STATS },
];

export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
