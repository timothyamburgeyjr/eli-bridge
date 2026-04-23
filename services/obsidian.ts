import { getEnv, requireEnv } from "./env";

export interface VaultSearchHit {
  path: string;
  preview?: string;
  score?: number;
}

function vaultBase(): string {
  return requireEnv("VAULT_URL").replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv("VAULT_TOKEN")}`,
  };
}

export function isVaultConfigured(): boolean {
  return !!(getEnv("VAULT_URL") && getEnv("VAULT_TOKEN"));
}

/**
 * Fetch the markdown body of a vault file. Path is relative to the vault
 * root (e.g. "08 - Elias Reed/LiveMode/Profiles/Henry Stewart.md"). Path
 * segments are URL-encoded per the Local REST API plugin's convention,
 * but slashes between segments are preserved.
 */
export async function readNote(path: string): Promise<string> {
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `${vaultBase()}/vault/${encoded}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { ...authHeaders(), Accept: "text/markdown" },
  });
  if (!res.ok) {
    throw new Error(`obsidian.readNote ${path} → HTTP ${res.status}`);
  }
  return await res.text();
}

/**
 * Write markdown to a vault file (create or overwrite). Used for Session
 * Journals and any other writes.
 */
export async function writeNote(path: string, content: string): Promise<void> {
  const encoded = path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `${vaultBase()}/vault/${encoded}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "text/markdown" },
    body: content,
  });
  if (!res.ok) {
    throw new Error(`obsidian.writeNote ${path} → HTTP ${res.status}`);
  }
}

/**
 * List the immediate children of a vault folder. Returns names as the REST
 * API reports them — subfolder entries end with "/".
 */
export async function listFolder(folderPath: string): Promise<string[]> {
  const clean = folderPath.replace(/^\/+|\/+$/g, "");
  const encoded = clean
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = `${vaultBase()}/vault/${encoded}/`;
  const res = await fetch(url, {
    method: "GET",
    headers: { ...authHeaders(), Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`obsidian.listFolder ${folderPath} → HTTP ${res.status}`);
  }
  const data = (await res.json()) as { files?: string[] };
  return data.files ?? [];
}

/**
 * Simple full-text search across the vault. Returns candidate paths matching
 * the query. Used to suggest Obsidian page links when enrolling a new person.
 */
export async function searchVault(
  query: string,
  contextLength = 120
): Promise<VaultSearchHit[]> {
  const url = `${vaultBase()}/search/simple/?query=${encodeURIComponent(
    query
  )}&contextLength=${contextLength}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`obsidian.searchVault "${query}" → HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    filename: string;
    score?: number;
    matches?: { match?: { start?: number; end?: number }; context?: string }[];
  }[];
  return data.map((h) => ({
    path: h.filename,
    preview: h.matches?.[0]?.context,
    score: h.score,
  }));
}
