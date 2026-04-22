import React from "react";
import { DepartureCard } from "@/components/cards/DepartureCard";
import { WaypointCard } from "@/components/cards/WaypointCard";
import { ModeTransitionCard } from "@/components/cards/ModeTransitionCard";
import { LocationCard } from "@/components/cards/LocationCard";
import { NowPlayingCard } from "@/components/cards/NowPlayingCard";
import { TriviaCard } from "@/components/cards/TriviaCard";
import { WeatherCard } from "@/components/cards/WeatherCard";
import { CalendarCard } from "@/components/cards/CalendarCard";
import { InterruptCard } from "@/components/cards/InterruptCard";
import { UnknownPersonCard } from "@/components/cards/UnknownPersonCard";
import { AudioSnapCard } from "@/components/cards/AudioSnapCard";
import { VenueModeCard } from "@/components/cards/VenueModeCard";
import { RideCard } from "@/components/cards/RideCard";
import { SessionJournalCard } from "@/components/cards/SessionJournalCard";

export type AnyMsg = Record<string, any> & {
  id: string;
  from: string;
  time: string;
};

export function renderCard(msg: AnyMsg): React.ReactElement | null {
  switch (msg.from) {
    case "departure":
      return <DepartureCard msg={msg as any} />;
    case "waypoint":
      return <WaypointCard msg={msg as any} />;
    case "transition":
    case "modetransition":
      return <ModeTransitionCard msg={msg as any} />;
    case "location":
      return <LocationCard msg={msg as any} />;
    case "nowplaying":
      return <NowPlayingCard msg={msg as any} />;
    case "trivia":
      return <TriviaCard msg={msg as any} />;
    case "weather":
      return <WeatherCard msg={msg as any} />;
    case "calendar":
      return <CalendarCard msg={msg as any} />;
    case "interrupt":
      return <InterruptCard msg={msg as any} />;
    case "unknownperson":
      return <UnknownPersonCard msg={msg as any} />;
    case "audiosnap":
      return <AudioSnapCard msg={msg as any} />;
    case "venuemode":
      return <VenueModeCard msg={msg as any} />;
    case "ride":
      return <RideCard msg={msg as any} />;
    case "journal":
    case "sessionjournal":
      return <SessionJournalCard msg={msg as any} />;
    default:
      return null;
  }
}
