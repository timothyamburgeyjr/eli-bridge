import * as FileSystem from "expo-file-system/legacy";

export type AttachmentKind = "image" | "video" | "audio";

export interface StagedAttachment {
  id: string;
  kind: AttachmentKind;
  /** Local `file://` URI on disk */
  localPath: string;
  mimeType: string;
  /** Seconds, for audio/video */
  duration?: number;
  /** Populated after Imgur upload (images only) */
  imgurUrl?: string;
}

export interface GeminiInlineBlob {
  mimeType: string;
  data: string;
}

/**
 * Read a local file into base64 for Gemini `inline_data` payloads.
 */
export async function toInlineBlob(a: StagedAttachment): Promise<GeminiInlineBlob> {
  const data = await FileSystem.readAsStringAsync(a.localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { mimeType: a.mimeType, data };
}

export function newAttachmentId(kind: AttachmentKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
