import {
  isVaultConfigured,
  listFolder,
  writeNote,
} from "@/services/obsidian";

const PROFILES_FOLDER = "08 - Elias Reed/LiveMode/Profiles";

/** Strip the ".md" suffix if present, preserving any other dots in the name. */
function stripMd(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

/** Lowercase + collapse non-alphanumerics for fuzzy filename matching. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Basic Obsidian-safe filename (no /, \, :, *, ?, ", <, >, |). */
function sanitizeForFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

export interface ResolvedProfile {
  path: string;
  /** Whether this page was just created (true) or matched an existing file (false). */
  created: boolean;
  /** If matched, the confidence: "exact", "contains", or "substring". */
  matchKind?: "exact" | "contains" | "substring" | "none";
}

/**
 * Find the best Obsidian profile page for a given person name. Strategy:
 *  1. Exact filename match (case-insensitive, accent-folded) wins.
 *  2. File whose basename *contains* the target name (e.g. "Charlie" matches
 *     "Charlie Daniels.md") wins next.
 *  3. File whose basename is contained in the target name (e.g. "Hank" is a
 *     substring of the longer "Henry Hank Stewart.md") wins last.
 *  4. No match → create a stub page and return its path.
 *
 * Returns null if the vault isn't configured (caller should leave the
 * person's obsidianPath unset and carry on).
 */
export async function resolveOrCreateProfilePath(
  name: string
): Promise<ResolvedProfile | null> {
  if (!isVaultConfigured()) return null;

  const target = normalize(name);
  if (!target) return null;

  let files: string[];
  try {
    files = await listFolder(PROFILES_FOLDER);
  } catch (err) {
    console.warn("[profileLinker] listFolder failed:", err);
    return null;
  }

  const mdFiles = files.filter((f) => !f.endsWith("/") && /\.md$/i.test(f));

  let exact: string | null = null;
  let contains: string | null = null;
  let substring: string | null = null;
  for (const file of mdFiles) {
    const basename = stripMd(file);
    const key = normalize(basename);
    if (key === target) {
      exact = file;
      break;
    }
    if (!contains && key.includes(target)) contains = file;
    if (!substring && target.includes(key) && key.length >= 3) substring = file;
  }

  const match = exact ?? contains ?? substring;
  if (match) {
    return {
      path: `${PROFILES_FOLDER}/${match}`,
      created: false,
      matchKind: exact ? "exact" : contains ? "contains" : "substring",
    };
  }

  // No match — create a stub page so every enrolled Person has a live doc.
  const safeName = sanitizeForFilename(name);
  if (!safeName) return null;
  const newPath = `${PROFILES_FOLDER}/${safeName}.md`;
  const stub =
    `# ${name}\n\n` +
    `> Auto-created by Eli Bridge on enrollment. Fill in relationship, ` +
    `history, preferences, and anything worth Eli knowing.\n`;
  try {
    await writeNote(newPath, stub);
  } catch (err) {
    console.warn("[profileLinker] stub creation failed:", err);
    return null;
  }
  return { path: newPath, created: true, matchKind: "none" };
}
