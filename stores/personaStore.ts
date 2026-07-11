import { create } from "zustand";
import {
  getPersonality,
  type Personality,
  type PersonalityKey,
} from "@/constants/personalities";

/**
 * Who Tim is talking to this session.
 *
 * This is a LEAF module on purpose — it imports nothing but the manifest, so
 * anything in the app can ask "who am I talking to?" without pulling in the
 * session machinery.
 *
 * It exists because the obvious alternative (keeping this on SessionStore and
 * importing that from chatStore/audioStore) creates three require cycles:
 *
 *   chatStore -> SessionStore -> sessionPoller -> chatStore
 *   SessionStore -> sessionPoller -> audioStore -> SessionStore
 *   chatStore -> SessionStore -> sessionPoller -> quickStore -> chatStore
 *
 * Those happen to work today only because every read is inside a function body
 * rather than at module-init. That's luck, not design — a single top-level
 * `const x = activePersonality()` in the wrong file would silently evaluate to
 * undefined. A leaf store makes the cycle structurally impossible instead.
 *
 * SessionStore owns the lifecycle (sets on start/hydrate, clears on discard);
 * everyone else just reads.
 */
interface PersonaState {
  key: PersonalityKey | null;
  setKey: (key: PersonalityKey | null) => void;
}

export const usePersona = create<PersonaState>((set) => ({
  key: null,
  setKey: (key) => set({ key }),
}));

/**
 * The active companion. Undefined outside a session — callers that need an
 * identity to make a network call should treat that as "don't call", not as
 * "fall back to Eli".
 */
export function activePersonality(): Personality | undefined {
  const key = usePersona.getState().key;
  return key ? getPersonality(key) : undefined;
}

/** Hook form of {@link activePersonality}, for components. */
export function useActivePersonality(): Personality | undefined {
  const key = usePersona((s) => s.key);
  return key ? getPersonality(key) : undefined;
}

/**
 * The active companion's short name for UI copy ("Tell Jeff we're heading
 * out"). Falls back to "them" outside a session, which reads correctly in every
 * button label that uses it.
 */
export function useCompanionName(): string {
  return useActivePersonality()?.shortName ?? "them";
}
