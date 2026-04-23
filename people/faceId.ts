import { detectAndEmbedFaces } from "../modules/face-embedding";
import { cosineSimilarity } from "../modules/voice-embedding";
import { usePeople, Person } from "./PeopleStore";
import { CONFIG } from "@/constants/config";

export interface FaceMatch {
  person: Person | null;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  isNew: boolean;
  /** Internal — used by callers that want to commit this embedding as enrollment */
  embedding: Float32Array;
}

/**
 * Identify faces in an image. Each detected face is matched against stored
 * face embeddings at cosine-similarity threshold 0.7.
 */
export async function identifyFaces(imagePath: string): Promise<FaceMatch[]> {
  const detections = await detectAndEmbedFaces(imagePath);
  const store = usePeople.getState();
  const people = store.all();

  return detections.map((det) => {
    let bestMatch: Person | null = null;
    let bestScore = -1;
    for (const p of people) {
      if (!p.faceEmbedding || p.faceEmbedding.length === 0) continue;
      const score = cosineSimilarity(new Float32Array(p.faceEmbedding), det.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }

    const confidence = Math.max(0, bestScore);
    if (bestMatch && bestScore >= CONFIG.FACE_MATCH_THRESHOLD) {
      store.updatePerson(bestMatch.id, {});
      return {
        person: bestMatch,
        confidence,
        bbox: det.bbox,
        isNew: false,
        embedding: det.embedding,
      };
    }

    return {
      person: null,
      confidence,
      bbox: det.bbox,
      isNew: true,
      embedding: det.embedding,
    };
  });
}

/**
 * Commit a face embedding to an existing Person card (face enrollment).
 * Used when Tim names an UnknownPersonCard face detection.
 */
export function enrollFace(personId: string, embedding: Float32Array): void {
  const store = usePeople.getState();
  store.updatePerson(personId, { faceEmbedding: Array.from(embedding) });
}
