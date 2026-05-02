import { File } from "expo-file-system";
import { getEnv } from "./env";

export interface ImageUploadResult {
  /** Absolute public URL to the uploaded image. */
  url: string;
}

/**
 * Session ID scoping — groups all uploads within one JS lifetime under a
 * single folder on the server. Resets on app restart. Phase 9 can override
 * this with a real Eli Bridge session ID if desired.
 */
let cachedSessionId: string | null = null;

function getSessionId(): string {
  if (!cachedSessionId) {
    const ts = new Date();
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");
    const t = ts.getTime().toString(36);
    cachedSessionId = `${y}-${m}-${d}-${t}`;
  }
  return cachedSessionId;
}

export function resetImageSessionId(): void {
  cachedSessionId = null;
}

export function isImageServerConfigured(): boolean {
  return !!getEnv("IMAGE_SERVER_URL") && !!getEnv("IMAGE_UPLOAD_KEY");
}

function extensionOf(localPath: string): string {
  const m = localPath.match(/\.([A-Za-z0-9]+)(?:\?|$)/);
  return (m?.[1] ?? "jpg").toLowerCase();
}

function contentTypeFor(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Upload a local image file to the self-hosted image server and return its
 * absolute public URL (safe to pass to Kindroid's `image_urls`).
 * Throws if the server isn't configured or the upload fails — caller should
 * check `isImageServerConfigured()` and fall back to sending the message
 * without image_urls if needed.
 */
export async function uploadImage(localPath: string): Promise<ImageUploadResult> {
  const serverUrl = getEnv("IMAGE_SERVER_URL");
  const uploadKey = getEnv("IMAGE_UPLOAD_KEY");
  if (!serverUrl || !uploadKey) {
    throw new Error(
      "Image server not configured. Set EXPO_PUBLIC_IMAGE_SERVER_URL and EXPO_PUBLIC_IMAGE_UPLOAD_KEY in .env."
    );
  }

  const file = new File(localPath);
  const bytes = await file.bytes();

  const ext = extensionOf(localPath);
  const sessionId = getSessionId();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const uploadUrl = `${serverUrl.replace(/\/+$/, "")}/upload/${encodeURIComponent(sessionId)}/${encodeURIComponent(filename)}`;

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Upload-Key": uploadKey,
      "Content-Type": contentTypeFor(ext),
    },
    body: bytes,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Image server upload → HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as { url: string };
  const path = json.url;
  const absolute = path.startsWith("http")
    ? path
    : `${serverUrl.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;

  return { url: absolute };
}

/**
 * Best-effort delete of a previously-uploaded image from the self-hosted
 * server. Used after the session-end vault archive succeeds — we don't need
 * both copies.
 *
 * Pattern: DELETE on the same /upload/{sessionId}/{filename} path that the
 * upload used (server's auth-protected write surface). If the server doesn't
 * implement DELETE there yet, the request will 404/405 — logged as a warning
 * but not thrown, so a missing server route doesn't take down the journal
 * save flow.
 *
 * Accepts the absolute public URL (what we passed to Kindroid) and rewrites
 * /images/ → /upload/ to hit the auth-protected route.
 */
export async function deleteImage(absoluteUrl: string): Promise<boolean> {
  const uploadKey = getEnv("IMAGE_UPLOAD_KEY");
  if (!uploadKey) return false;

  // The public URL is BASE/images/{sessionId}/{filename}; the auth-protected
  // delete is BASE/upload/{sessionId}/{filename}.
  const deleteUrl = absoluteUrl.replace("/images/", "/upload/");
  if (deleteUrl === absoluteUrl) {
    console.warn(
      `[imageServer] deleteImage: URL doesn't contain /images/ — nothing to rewrite, skipping: ${absoluteUrl}`
    );
    return false;
  }

  try {
    const res = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { "X-Upload-Key": uploadKey },
    });
    if (!res.ok) {
      console.warn(
        `[imageServer] deleteImage ${deleteUrl} → HTTP ${res.status} (server may not support DELETE)`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[imageServer] deleteImage ${deleteUrl} threw:`, err);
    return false;
  }
}
