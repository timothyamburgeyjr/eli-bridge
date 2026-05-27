import * as FileSystem from "expo-file-system/legacy";
import type { StagedAttachment } from "./pendingAttachments";

/**
 * Gemini's inline-content request cap is 20 MB. Anything attached to a send
 * (images + audios + videos) goes inline as base64, which expands the raw
 * file bytes by 4/3 (plus a few padding bytes). Plus the JSON wrapper, the
 * sensor snapshot, the prompt, and the chat history all add overhead.
 *
 * We pre-flight the size before firing the Gemini call so a too-large
 * payload surfaces as a clear, actionable error in the UI (the oversize
 * popup), not as a generic 400 from Gemini halfway through the send.
 *
 * Threshold is 19 MB to leave ~1 MB of headroom for the non-attachment
 * JSON content. The legacy FileSystem API returns size in bytes for any
 * `file://` URI that exists.
 */

export const PAYLOAD_LIMIT_BYTES = 19 * 1024 * 1024;
const BASE64_EXPANSION = 4 / 3;

export interface AttachmentSizeItem {
  id: string;
  kind: StagedAttachment["kind"];
  /** Raw file bytes on disk. */
  fileBytes: number;
  /** Approximate base64-encoded bytes (~4/3 of file bytes). */
  base64Bytes: number;
  /** Optional duration in seconds (video/audio). */
  duration?: number;
  /** Last segment of the local path, for display. */
  filename: string;
}

export interface PayloadSizeInfo {
  items: AttachmentSizeItem[];
  /** Sum of base64Bytes across all items. */
  totalBase64Bytes: number;
  /** True when totalBase64Bytes > PAYLOAD_LIMIT_BYTES. */
  oversize: boolean;
}

/**
 * Compute the projected base64-encoded payload size for a set of staged
 * attachments. Resilient to missing/unreadable files — those are silently
 * dropped from the result (we don't want one stale local path to block a
 * send pre-flight).
 */
export async function computePayloadSize(
  attachments: StagedAttachment[]
): Promise<PayloadSizeInfo> {
  const items: AttachmentSizeItem[] = [];
  for (const a of attachments) {
    try {
      const info = await FileSystem.getInfoAsync(a.localPath);
      if (!info.exists || info.isDirectory) continue;
      const fileBytes = info.size ?? 0;
      const base64Bytes = Math.ceil(fileBytes * BASE64_EXPANSION) + 4;
      const filename = a.localPath.split(/[\\/]/).pop() ?? a.localPath;
      items.push({
        id: a.id,
        kind: a.kind,
        fileBytes,
        base64Bytes,
        duration: a.duration,
        filename,
      });
    } catch {
      // unreadable — skip
    }
  }
  const totalBase64Bytes = items.reduce((sum, it) => sum + it.base64Bytes, 0);
  return {
    items,
    totalBase64Bytes,
    oversize: totalBase64Bytes > PAYLOAD_LIMIT_BYTES,
  };
}

/** Human-readable size string — "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
