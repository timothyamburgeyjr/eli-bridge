import { NativeModule, requireNativeModule } from "expo-modules-core";

/**
 * ECAPA-TDNN speaker embedding module.
 *
 * Pass B (active): real TensorFlow Lite inference against WeSpeaker's
 * ECAPA-TDNN-512-LM, trained on VoxCeleb2. The Kotlin side decodes audio
 * via MediaExtractor/MediaCodec → 16kHz mono PCM → 80-dim log-mel fbank →
 * CMVN → TFLite → 192-dim L2-normalized embedding.
 *
 * API surface is identical to Pass A — only the embedding dimension
 * changed (256 → 192). `cosineSimilarity` handles any vector length.
 */
declare class VoiceEmbeddingModuleType extends NativeModule {
  /** Compute a 192-dim speaker embedding from a local audio file URI. */
  generateEmbedding(audioPath: string): Promise<number[]>;
  /** Whether the native module is running real inference vs the stub. */
  isStub(): Promise<boolean>;
}

const native = requireNativeModule<VoiceEmbeddingModuleType>("VoiceEmbeddingModule");

/**
 * Compute a 192-dim ECAPA-TDNN speaker embedding from a local audio file.
 * Returns an L2-normalized Float32Array — cosine similarity with another
 * embedding from the same speaker should exceed 0.7; different speakers
 * should fall below 0.5.
 */
export async function generateVoiceEmbedding(audioPath: string): Promise<Float32Array> {
  const raw = await native.generateEmbedding(audioPath);
  return new Float32Array(raw);
}

export async function isVoiceStub(): Promise<boolean> {
  try {
    return await native.isStub();
  } catch {
    return true;
  }
}

/**
 * Cosine similarity between two embedding vectors. Range -1 to 1; 1 = identical.
 * Implemented in JS (it's fast enough for small vectors and lets us share the
 * same logic with the face module).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  return denom === 0 ? 0 : dot / denom;
}
