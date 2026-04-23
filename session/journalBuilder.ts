import type { ChatItem } from "@/components/chat/ChatStream";
import { draftJournal } from "@/services/gemini";

export interface SessionSummary {
  startedAt: string; // ISO
  endedAt: string; // ISO
  durationMinutes: number;
  messageCount: number;
  timMessages: number;
  eliMessages: number;
  peopleEncountered: string[]; // display names
  placesVisited: string[]; // location place names, deduped
  nowPlayingLog: string[]; // "Track — Artist"
  scenesCaptured: number;
  firstTimQuote?: string;
  firstEliQuote?: string;
}

export interface BuiltJournal {
  title: string;
  /** ISO date (YYYY-MM-DD) for the filename and frontmatter. */
  dateYmd: string;
  /** Final markdown body — frontmatter + narrative + verbatim transcript. */
  markdown: string;
  /** Just the narrative (no transcript) for preview display. */
  narrative: string;
  summary: SessionSummary;
}

/**
 * Produce an aggregate summary from a session's chat items. Used both to brief
 * Gemini for the narrative draft and to populate the frontmatter.
 */
export function summarizeSession(
  messages: ChatItem[],
  startedAt: string,
  endedAt: string
): SessionSummary {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const durationMinutes = Math.max(0, Math.round((end - start) / 60_000));

  const peopleSet = new Set<string>();
  const placesSet = new Set<string>();
  const nowPlayingSet = new Set<string>();
  let timMessages = 0;
  let eliMessages = 0;
  let scenesCaptured = 0;
  let firstTimQuote: string | undefined;
  let firstEliQuote: string | undefined;

  for (const m of messages) {
    if (m.from === "tim") {
      timMessages++;
      if (!firstTimQuote && m.dialog) firstTimQuote = m.dialog.slice(0, 140);
    } else if (m.from === "eli") {
      eliMessages++;
      if (!firstEliQuote && m.dialog) firstEliQuote = m.dialog.slice(0, 140);
    } else if (m.from === "scene") {
      scenesCaptured++;
    } else if (m.from === "location" && (m as any).placeName) {
      placesSet.add((m as any).placeName);
    } else if (m.from === "nowplaying") {
      const anyMsg = m as any;
      if (anyMsg.track && anyMsg.artist) {
        nowPlayingSet.add(`${anyMsg.track} — ${anyMsg.artist}`);
      }
    } else if (m.from === "unknownperson") {
      // skip — enrollment cards don't represent "someone encountered"
    }
  }

  // People encountered: derive from the roster's lastSeen bump pattern.
  // Simplest here: scan message stream for any Person names referenced in
  // Eli's or Tim's dialog is overfitted. Keep it minimal; we'll include
  // names only from explicit attachments in future passes.

  return {
    startedAt,
    endedAt,
    durationMinutes,
    messageCount: messages.length,
    timMessages,
    eliMessages,
    peopleEncountered: Array.from(peopleSet).sort(),
    placesVisited: Array.from(placesSet),
    nowPlayingLog: Array.from(nowPlayingSet),
    scenesCaptured,
    firstTimQuote,
    firstEliQuote,
  };
}

/** Compose a human-readable briefing string to hand to Gemini. */
function summaryToBriefing(s: SessionSummary): string {
  const parts: string[] = [];
  parts.push(
    `Session ${s.startedAt} → ${s.endedAt} (${s.durationMinutes} minutes, ${s.messageCount} messages).`
  );
  if (s.placesVisited.length) {
    parts.push(`Places: ${s.placesVisited.join("; ")}.`);
  }
  if (s.peopleEncountered.length) {
    parts.push(`People encountered: ${s.peopleEncountered.join(", ")}.`);
  }
  if (s.nowPlayingLog.length) {
    parts.push(`Music played: ${s.nowPlayingLog.join("; ")}.`);
  }
  if (s.scenesCaptured > 0) {
    parts.push(`${s.scenesCaptured} scene capture${s.scenesCaptured === 1 ? "" : "s"}.`);
  }
  if (s.firstTimQuote) parts.push(`First thing Tim said: "${s.firstTimQuote}"`);
  if (s.firstEliQuote) parts.push(`First thing Eli said: "${s.firstEliQuote}"`);
  return parts.join("\n");
}

/** Build a verbatim transcript of Tim/Eli turns as markdown. */
function buildTranscript(messages: ChatItem[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.from === "tim") {
      const time = m.time || "";
      const emote = m.emote ? `_(${m.emote})_ ` : "";
      lines.push(`**Tim** (${time}): ${emote}${m.dialog ?? ""}`);
    } else if (m.from === "eli") {
      const time = m.time || "";
      const emote = m.emote ? `_(${m.emote})_ ` : "";
      lines.push(`**Eli** (${time}): ${emote}${m.dialog ?? ""}`);
    }
  }
  return lines.join("\n\n");
}

/** Slugify a title for use in a filename. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** YYYY-MM-DD from an ISO or Date. */
export function toYmd(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Ask Gemini Flash to pick a short, evocative title from the session data.
 * Falls back to a date-based title if Gemini fails.
 */
async function draftTitle(s: SessionSummary): Promise<string> {
  const firstPlace = s.placesVisited[0];
  const firstPerson = s.peopleEncountered[0];
  if (firstPlace) return firstPlace;
  if (firstPerson) return `Time with ${firstPerson}`;
  const hr = new Date(s.startedAt).getHours();
  if (hr < 6) return "Late night";
  if (hr < 12) return "Morning";
  if (hr < 18) return "Afternoon";
  return "Evening";
}

/**
 * Draft a full session journal: narrative (via Gemini) + verbatim transcript.
 * Returns the final markdown ready to write to the vault.
 */
export async function buildJournal(
  messages: ChatItem[],
  startedAt: string,
  endedAt: string
): Promise<BuiltJournal> {
  const summary = summarizeSession(messages, startedAt, endedAt);
  const briefing = summaryToBriefing(summary);

  let narrative: string;
  try {
    narrative = await draftJournal(briefing);
  } catch (err) {
    console.warn("[journalBuilder] draftJournal failed:", err);
    narrative =
      `_(Gemini narrative unavailable — ` +
      (err instanceof Error ? err.message : String(err)) +
      `)_`;
  }

  const title = await draftTitle(summary);
  const dateYmd = toYmd(startedAt);
  const transcript = buildTranscript(messages);

  const frontmatter =
    `---\n` +
    `date: ${dateYmd}\n` +
    `session_start: ${startedAt}\n` +
    `session_end: ${endedAt}\n` +
    `duration_minutes: ${summary.durationMinutes}\n` +
    `messages: ${summary.messageCount}\n` +
    (summary.placesVisited.length
      ? `places: [${summary.placesVisited.map((p) => `"${p}"`).join(", ")}]\n`
      : "") +
    (summary.peopleEncountered.length
      ? `people: [${summary.peopleEncountered.map((p) => `"${p}"`).join(", ")}]\n`
      : "") +
    `---\n\n`;

  const markdown =
    frontmatter +
    `# ${title}\n\n` +
    narrative.trim() +
    `\n\n---\n\n` +
    `## Transcript\n\n` +
    transcript +
    `\n`;

  return { title, dateYmd, markdown, narrative, summary };
}

/** Produce the vault-root filename for a built journal. */
export function journalFilename(title: string, dateYmd: string): string {
  const slug = slugify(title);
  return slug ? `${dateYmd}-${slug}.md` : `${dateYmd}.md`;
}
