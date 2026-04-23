import { create } from "zustand";
import { File, Paths } from "expo-file-system";
import { SEED_PEOPLE } from "./seedPeople";

export interface Person {
  id: string;
  name: string;
  relationship?: string;
  /**
   * Path to this person's Obsidian page under the vault root (e.g.
   * "08 - Elias Reed/LiveMode/Profiles/Henry Stewart.md"). When present,
   * EmoteAssembler pulls a condensed, context-relevant summary from the
   * page rather than relying on static notes.
   */
  obsidianPath?: string;
  /**
   * Optional freeform fallback context — used only when no obsidianPath is
   * set, or when the vault is unreachable. Prefer editing the Obsidian page.
   */
  notes?: string;
  /** Committed voice embedding — null until 3 samples have been enrolled */
  voiceEmbedding: number[] | null;
  /** Samples collected before committing. Reset to [] when committed. */
  pendingVoiceSamples: number[][];
  /** Committed face embedding — null until Tim enrolls a face */
  faceEmbedding: number[] | null;
  firstSeen: string; // ISO
  lastSeen: string; // ISO
}

interface PeopleState {
  byId: Record<string, Person>;

  /** Load from disk. Safe to call multiple times; merges with seed data. */
  hydrate: () => Promise<void>;

  /** Persist to disk. Call after any mutation. */
  persist: () => Promise<void>;

  addPerson: (p: Omit<Person, "id" | "firstSeen" | "lastSeen" | "pendingVoiceSamples"> & Partial<Pick<Person, "id">>) => Person;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  removePerson: (id: string) => void;
  all: () => Person[];
  findByName: (name: string) => Person | undefined;
}

const STORE_FILE = "people.json";

function newPersonId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const usePeople = create<PeopleState>((set, get) => ({
  byId: {},

  hydrate: async () => {
    try {
      const file = new File(Paths.document, STORE_FILE);
      if (file.exists) {
        const raw = await file.text();
        const saved = JSON.parse(raw) as Record<string, Person>;
        const merged: Record<string, Person> = { ...SEED_PEOPLE };
        for (const [id, p] of Object.entries(saved)) {
          const isKnownSeed = id in SEED_PEOPLE;
          const hasEnrollment =
            (p.voiceEmbedding?.length ?? 0) > 0 ||
            (p.faceEmbedding?.length ?? 0) > 0 ||
            (p.pendingVoiceSamples?.length ?? 0) > 0;
          if (isKnownSeed) {
            // Keep saved enrollments, but refresh metadata (name, relationship,
            // obsidianPath) from the seed so updates to the roster propagate.
            merged[id] = {
              ...SEED_PEOPLE[id],
              voiceEmbedding: p.voiceEmbedding ?? null,
              pendingVoiceSamples: p.pendingVoiceSamples ?? [],
              faceEmbedding: p.faceEmbedding ?? null,
              firstSeen: p.firstSeen,
              lastSeen: p.lastSeen,
            };
          } else if (hasEnrollment) {
            // Organically-added person (e.g. via UnknownPersonCard) — keep as-is
            merged[id] = p;
          }
          // else: stale seed that was removed from the roster and has no
          // enrollment → drop it (this prunes e.g. a former seed ID that no
          // longer belongs in SEED_PEOPLE).
        }
        set({ byId: merged });
        await get().persist();
        return;
      }
    } catch {
      // fall through to fresh seed
    }
    set({ byId: { ...SEED_PEOPLE } });
    await get().persist();
  },

  persist: async () => {
    const file = new File(Paths.document, STORE_FILE);
    try {
      file.delete();
    } catch {
      // didn't exist
    }
    file.create();
    file.write(JSON.stringify(get().byId, null, 2));
  },

  addPerson: (p) => {
    const id = p.id ?? newPersonId();
    const person: Person = {
      id,
      name: p.name,
      relationship: p.relationship,
      obsidianPath: p.obsidianPath,
      notes: p.notes,
      voiceEmbedding: p.voiceEmbedding ?? null,
      pendingVoiceSamples: [],
      faceEmbedding: p.faceEmbedding ?? null,
      firstSeen: nowIso(),
      lastSeen: nowIso(),
    };
    set((s) => ({ byId: { ...s.byId, [id]: person } }));
    get().persist();
    return person;
  },

  updatePerson: (id, patch) => {
    set((s) => {
      const existing = s.byId[id];
      if (!existing) return s;
      return {
        byId: {
          ...s.byId,
          [id]: { ...existing, ...patch, lastSeen: nowIso() },
        },
      };
    });
    get().persist();
  },

  removePerson: (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.byId;
      return { byId: rest };
    });
    get().persist();
  },

  all: () => Object.values(get().byId),
  findByName: (name) =>
    Object.values(get().byId).find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    ),
}));
