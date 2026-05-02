import { File } from "expo-file-system";
import type { ChatItem } from "@/components/chat/ChatStream";
import { writeBinary } from "@/services/obsidian";
import { deleteImage } from "@/services/imageServer";

/**
 * Session-end attachment archiver. Walks the chat history for any Tim
 * messages with image/audio attachments, uploads each binary to the
 * Obsidian vault root (no folder — Tim's cowork skill organizes from a
 * flat `EliBridge-` glob later), and best-effort deletes images from the
 * self-hosted image server now that the vault has the canonical copy.
 *
 * Returns the list of successfully-archived files so the caller can append
 * a `## Attachments` section to the journal markdown with `![[]]` embeds.
 */

export interface ArchivedAttachment {
  /** Vault filename, no folder ("EliBridge-2026-05-02-1432-1.jpg"). */
  vaultName: string;
  kind: "image" | "audio";
  /** The original local path (informational). */
  localPath: string;
  /** Original public URL on the image server, if it had one — used for delete. */
  publicUrl?: string;
}

export interface AttachmentForArchive {
  kind: "image" | "audio";
  localPath: string;
  mimeType: string;
  publicUrl?: string;
  /** Unix ms — used to derive the HHMM in the vault filename. */
  capturedAt: number;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

function extensionFor(mimeType: string, fallback: string): string {
  const m = MIME_TO_EXT[mimeType.toLowerCase()];
  if (m) return m;
  return fallback;
}

/** Pad to 2 digits. */
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Build "YYYY-MM-DD-HHMM" from a unix-ms timestamp. */
function ymdhm(ts: number): string {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}`
  );
}

/** Pull the trailing Date.now() out of message IDs like "tim-1714671234567". */
function extractTimestampFromId(id: string): number | null {
  const m = id.match(/-(\d{13})$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Collect every attachment in chronological order from the session's
 * messages. Skips messages without attachments and any non-image/audio
 * kinds (video archive will land with the Task 2 EAS build).
 */
export function collectSessionAttachments(
  messages: ChatItem[]
): AttachmentForArchive[] {
  const out: AttachmentForArchive[] = [];
  for (const m of messages) {
    if (m.from !== "tim") continue;
    const atts = (m as unknown as { attachments?: Array<{
      type: string;
      localPath: string;
      mimeType: string;
      publicUrl?: string;
    }> }).attachments;
    if (!atts || atts.length === 0) continue;
    const ts = extractTimestampFromId(m.id) ?? Date.now();
    for (const a of atts) {
      if (a.type !== "image" && a.type !== "audio") continue;
      out.push({
        kind: a.type as "image" | "audio",
        localPath: a.localPath,
        mimeType: a.mimeType,
        publicUrl: a.publicUrl,
        capturedAt: ts,
      });
    }
  }
  return out;
}

export interface ArchiveResult {
  archived: ArchivedAttachment[];
  failed: { localPath: string; error: string }[];
  /** Number of public-server URLs we successfully deleted post-archive. */
  serverDeleted: number;
}

/**
 * Read each attachment from disk, upload to vault root, then best-effort
 * delete from the image server. Sequential rather than parallel to avoid
 * hammering the vault with concurrent multi-MB writes — session journals
 * happen at end-of-session so a slow archive isn't blocking conversation.
 */
export async function archiveSessionAttachments(
  attachments: AttachmentForArchive[]
): Promise<ArchiveResult> {
  const archived: ArchivedAttachment[] = [];
  const failed: { localPath: string; error: string }[] = [];
  let serverDeleted = 0;

  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    const seqN = i + 1;
    const ext = extensionFor(a.mimeType, a.kind === "image" ? "jpg" : "m4a");
    const vaultName = `EliBridge-${ymdhm(a.capturedAt)}-${seqN}.${ext}`;

    try {
      const file = new File(a.localPath);
      const bytes = await file.bytes();
      await writeBinary(vaultName, bytes, a.mimeType);
      archived.push({
        vaultName,
        kind: a.kind,
        localPath: a.localPath,
        publicUrl: a.publicUrl,
      });
      console.log(
        `[archive] vault wrote ${vaultName} (${bytes.length} bytes, kind=${a.kind})`
      );

      // Best-effort delete from the image server (images only — audio
      // never goes to the image server).
      if (a.kind === "image" && a.publicUrl) {
        const ok = await deleteImage(a.publicUrl);
        if (ok) serverDeleted++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[archive] failed for ${a.localPath}:`, msg);
      failed.push({ localPath: a.localPath, error: msg });
    }
  }

  return { archived, failed, serverDeleted };
}

/**
 * Render the `## Attachments` markdown block to append to the journal.
 * Embeds use Obsidian's `![[]]` syntax so the vault renders inline.
 */
export function renderAttachmentsBlock(archived: ArchivedAttachment[]): string {
  if (archived.length === 0) return "";

  const lines: string[] = ["", "---", "", "## Attachments", ""];
  const images = archived.filter((a) => a.kind === "image");
  const audio = archived.filter((a) => a.kind === "audio");

  if (images.length > 0) {
    lines.push(`### Images (${images.length})`);
    lines.push("");
    for (const a of images) {
      lines.push(`![[${a.vaultName}]]`);
    }
    lines.push("");
  }
  if (audio.length > 0) {
    lines.push(`### Audio (${audio.length})`);
    lines.push("");
    for (const a of audio) {
      lines.push(`![[${a.vaultName}]]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
