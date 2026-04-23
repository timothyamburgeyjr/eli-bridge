import { NativeModule, requireNativeModule } from "expo-modules-core";

export interface FaceDetection {
  /** Bounding box in original image pixel coordinates */
  bbox: { x: number; y: number; width: number; height: number };
  /** 128-dim face embedding (Pass A: stub hash; Pass B: MobileFaceNet) */
  embedding: number[];
  /** ML Kit's detection confidence for this face (0–1) */
  detectionConfidence: number;
}

declare class FaceEmbeddingModuleType extends NativeModule {
  /** Detect faces in a local image and return embeddings for each. */
  detectAndEmbedFaces(imagePath: string): Promise<FaceDetection[]>;
  isStub(): Promise<boolean>;
}

const native = requireNativeModule<FaceEmbeddingModuleType>("FaceEmbeddingModule");

export async function detectAndEmbedFaces(
  imagePath: string
): Promise<Array<Omit<FaceDetection, "embedding"> & { embedding: Float32Array }>> {
  const results = await native.detectAndEmbedFaces(imagePath);
  return results.map((r) => ({
    bbox: r.bbox,
    detectionConfidence: r.detectionConfidence,
    embedding: new Float32Array(r.embedding),
  }));
}

export async function isFaceStub(): Promise<boolean> {
  try {
    return await native.isStub();
  } catch {
    return true;
  }
}
