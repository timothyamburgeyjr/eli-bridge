import { create } from "zustand";
import {
  getPersonality,
  type Personality,
  type PersonalityKey,
} from "@/constants/personalities";

/**
 * Who is in the room, and who Tim is actually talking to.
 *
 * Two tiers, and the distinction is the whole design:
 *
 *   room       — who is present. They see everything that happens.
 *   addressed  — who Tim is speaking TO. A subset of the room.
 *
 * Everyone in the room gets their own Kindroid message, so the two tiers decide
 * how Tim's words appear in each one. The addressed get them as raw text, said
 * straight to them. Everyone else only OVERHEARD the remark, and gets it as
 * narration naming who it was aimed at. Kindroid renders raw text as Tim
 * speaking directly at the recipient, so without that split, "Kiddo, welcome to
 * the revolution" — said to Tommy — lands on 62-year-old Bobby as though Tim had
 * called HIM kiddo. See session/coordinator.ts, which is where the rule is
 * actually enforced.
 *
 * Cost scales with `addressed`, not with `room`. The addressed speak one at a
 * time, in order, each hearing the last — that serialization IS the feature, and
 * it costs one Kindroid round trip each (30-90s). The rest of the room reacts
 * concurrently afterwards, in a single burst. So a room of six with one
 * addressed costs about what a room of two does.
 *
 * LEAF MODULE, like personaStore and for the same reason: it imports nothing but
 * the manifest. See the comment there — a top-level read in the wrong file
 * silently evaluates to undefined once a require cycle exists, and the fix is to
 * make the cycle structurally impossible rather than to be careful.
 */
interface RoomState {
  /** Present, in pick order. Empty outside a session. */
  room: PersonalityKey[];
  /** Being spoken to. Always a subset of `room`. */
  addressed: PersonalityKey[];

  /** Replace the room wholesale. Prunes `addressed` to whoever survived. */
  setRoom: (keys: PersonalityKey[]) => void;
  /** Add/remove one person. Removing them from the room also unaddresses them. */
  toggleInRoom: (key: PersonalityKey) => void;
  /** Address/unaddress one person. Addressing someone also puts them in the room. */
  toggleAddressed: (key: PersonalityKey) => void;
  /** Session teardown. */
  clear: () => void;
}

export const useRoom = create<RoomState>((set) => ({
  room: [],
  addressed: [],

  setRoom: (keys) =>
    set((s) => ({
      room: keys,
      // Anyone dropped from the room can't still be addressed.
      addressed: s.addressed.filter((k) => keys.includes(k)),
    })),

  toggleInRoom: (key) =>
    set((s) =>
      s.room.includes(key)
        ? {
            room: s.room.filter((k) => k !== key),
            addressed: s.addressed.filter((k) => k !== key),
          }
        : { room: [...s.room, key], addressed: s.addressed }
    ),

  toggleAddressed: (key) =>
    set((s) =>
      s.addressed.includes(key)
        ? { room: s.room, addressed: s.addressed.filter((k) => k !== key) }
        : {
            // You can't speak to someone who isn't in the room.
            room: s.room.includes(key) ? s.room : [...s.room, key],
            addressed: [...s.addressed, key],
          }
    ),

  clear: () => set({ room: [], addressed: [] }),
}));

/**
 * The room, as Personalities, in pick order.
 *
 * Note this is deliberately NOT derived from personaStore. `personaStore.key`
 * remains the session OWNER — it drives the Gemini persona block, the journal,
 * and the session-level `updateScene`. The room is a separate axis: the owner is
 * normally in the room, but the room is what the relay iterates.
 */
export function roomMembers(): Personality[] {
  return useRoom.getState().room.map(getPersonality);
}

/**
 * Who Tim is talking to, as Personalities, in pick order.
 *
 * Empty `addressed` means "the room in general, nobody in particular" — in which
 * case the relay treats the WHOLE room as addressed, because a message with no
 * recipient at all would go unanswered. That fallback lives here rather than at
 * the call sites so it can't be forgotten in one of them.
 */
export function addressedMembers(): Personality[] {
  const { room, addressed } = useRoom.getState();
  const keys = addressed.length > 0 ? addressed : room;
  return keys.map(getPersonality);
}

/** Everyone present who is NOT being spoken to. They overhear; they may react. */
export function overhearingMembers(): Personality[] {
  const addressed = new Set(addressedMembers().map((p) => p.key));
  return roomMembers().filter((p) => !addressed.has(p.key));
}

/** Hook forms, for components. */
export function useRoomMembers(): Personality[] {
  return useRoom((s) => s.room).map(getPersonality);
}

export function useAddressedMembers(): Personality[] {
  const room = useRoom((s) => s.room);
  const addressed = useRoom((s) => s.addressed);
  return (addressed.length > 0 ? addressed : room).map(getPersonality);
}

/**
 * Whoever Tim called out by name in the message text.
 *
 * Tim naming someone OUTRANKS the coordinator's mic order, always — if he asked
 * Bobby directly, Bobby answers first, and no amount of affinity scoring gets to
 * overrule that. Matched against `shortName` on a word boundary so "Ellen" in
 * "I fell in" doesn't count.
 *
 * Returns undefined when he named nobody, which is the common case.
 */
export function namedIn(
  message: string,
  candidates: Personality[]
): Personality | undefined {
  if (!message.trim()) return undefined;
  return candidates.find((p) =>
    new RegExp(`\\b${escapeRegExp(p.shortName)}\\b`, "i").test(message)
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
