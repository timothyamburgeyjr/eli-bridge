import { generateVoiceEmbedding, cosineSimilarity } from "../modules/voice-embedding";
import { usePeople, Person } from "./PeopleStore";
import { CONFIG } from "@/constants/config";

export interface VoiceMatchResult {
  person: Person | null;
  confidence: number; // cosine similarity 0-1
  isNew: boolean;
  /** Raw embedding from the native module — caller can commit for enrollment */
  embedding: Float32Array;
  /** If the matched person is pending enrollment, how many samples in */
  enrollmentProgress?: { current: number; total: number };
}

/**
 * Identify a speaker from an audio file. Returns the best-matching enrolled
 * person if confidence is above the threshold, otherwise null (new/unknown).
 *
 * If the best match is a person in pending-enrollment state (has pending
 * samples but no committed embedding), this adds the current embedding as
 * another sample and commits once VOICE_ENROLLMENT_SAMPLES (3) are collected.
 */
export async function identifySpeaker(audioPath: string): Promise<VoiceMatchResult> {
  const embedding = await generateVoiceEmbedding(audioPath);

  const store = usePeople.getState();
  const people = store.all();

  let bestMatch: Person | null = null;
  let bestScore = -1;

  for (const p of people) {
    if (!p.voiceEmbedding || p.voiceEmbedding.length === 0) continue;
    const score = cosineSimilarity(new Float32Array(p.voiceEmbedding), embedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = p;
    }
  }

  if (bestMatch && bestScore >= CONFIG.VOICE_MATCH_THRESHOLD) {
    store.updatePerson(bestMatch.id, {}); // bump lastSeen
    return { person: bestMatch, confidence: bestScore, isNew: false, embedding };
  }

  return { person: null, confidence: Math.max(0, bestScore), isNew: true, embedding };
}

/**
 * Record one voice sample against a specific Person. Commits an averaged
 * embedding once VOICE_ENROLLMENT_SAMPLES have been collected.
 *
 * Returns { committed: true } once enrollment is complete.
 */
export async function enrollVoiceSample(
  personId: string,
  audioPath: string
): Promise<{ committed: boolean; progress: { current: number; total: number } }> {
  const store = usePeople.getState();
  const person = store.byId[personId];
  if (!person) throw new Error(`Unknown personId: ${personId}`);

  const embedding = await generateVoiceEmbedding(audioPath);
  const sample = Array.from(embedding);
  const pending = [...person.pendingVoiceSamples, sample];

  if (pending.length >= CONFIG.VOICE_ENROLLMENT_SAMPLES) {
    // Commit — average the samples element-wise, then renormalize
    const dim = pending[0].length;
    const avg = new Float32Array(dim);
    for (const s of pending) for (let i = 0; i < dim; i++) avg[i] += s[i];
    for (let i = 0; i < dim; i++) avg[i] /= pending.length;
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += avg[i] * avg[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dim; i++) avg[i] /= norm;

    store.updatePerson(personId, {
      voiceEmbedding: Array.from(avg),
      pendingVoiceSamples: [],
    });
    return {
      committed: true,
      progress: {
        current: CONFIG.VOICE_ENROLLMENT_SAMPLES,
        total: CONFIG.VOICE_ENROLLMENT_SAMPLES,
      },
    };
  }

  store.updatePerson(personId, { pendingVoiceSamples: pending });
  return {
    committed: false,
    progress: { current: pending.length, total: CONFIG.VOICE_ENROLLMENT_SAMPLES },
  };
}
