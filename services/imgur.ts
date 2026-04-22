import * as FileSystem from "expo-file-system/legacy";
import { getEnv } from "./env";

const IMGUR_ENDPOINT = "https://api.imgur.com/3/image";

export interface ImgurUploadResult {
  link: string;
  deletehash: string;
  id: string;
}

export function isImgurConfigured(): boolean {
  return !!getEnv("IMGUR_CLIENT_ID");
}

/**
 * Upload a local image file to Imgur and return the public URL.
 * Reads the file as base64 via expo-file-system, POSTs with Client-ID auth.
 * Throws if IMGUR_CLIENT_ID is not configured (caller should check `isImgurConfigured()`
 * or fall back to sending the message without image_urls).
 */
export async function uploadImage(localPath: string): Promise<ImgurUploadResult> {
  const clientId = getEnv("IMGUR_CLIENT_ID");
  if (!clientId) {
    throw new Error(
      "IMGUR_CLIENT_ID not set. Add EXPO_PUBLIC_IMGUR_CLIENT_ID to .env and restart Metro."
    );
  }

  const base64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const form = new FormData();
  form.append("image", base64);
  form.append("type", "base64");

  const res = await fetch(IMGUR_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Client-ID ${clientId}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`Imgur upload → HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    status: number;
    data: { link: string; deletehash: string; id: string };
  };

  if (!json.success) {
    throw new Error(`Imgur upload failed with status ${json.status}`);
  }

  return {
    link: json.data.link,
    deletehash: json.data.deletehash,
    id: json.data.id,
  };
}
