/**
 * Reading a folder into what import needs: every file, classified, sized and — when asked —
 * hashed. Read-only: nothing here writes, moves or opens a file for writing.
 *
 * Hashing is optional because it is the slow part. Listing a D2SE install with 150 mods takes
 * seconds; hashing it reads every byte. The UI lists first and hashes what the user picks.
 */

import { crypto } from "@std/crypto";
import { type FileEntry, type FileLayer, type FileLayerRole, LayerError, normalizePath } from "@exordium/layers";
import { classify, type FolderKind } from "./classify.ts";

export interface ScannedFile {
  /** Relative, `/`-separated, as the layer will hold it. */
  path: string;
  size: number;
  /** Lowercase hex SHA-256, or `null` when the scan did not hash. */
  hash: string | null;
}

export interface ExcludedFile {
  path: string;
  size: number;
  reason: string;
}

export interface FolderSummary {
  /** A top-level folder's name; `""` for the files directly in the scanned folder. */
  name: string;
  files: number;
  bytes: number;
}

export interface FolderScan {
  root: string;
  kind: FolderKind;
  /** The core or mod as shipped. */
  layer: ScannedFile[];
  /** The player's files — a mod's saves. */
  writable: ScannedFile[];
  /** `Language_<code>` folders: each language's files, relative to its folder. */
  languages: Record<string, ScannedFile[]>;
  excluded: ExcludedFile[];
  /** Everything imported, per top-level folder, largest first — to spot a dev folder worth excluding. */
  folders: FolderSummary[];
  bytes: number;
}

export interface ScanOptions {
  hash: boolean;
}

export async function scanFolder(root: string, kind: FolderKind, options: ScanOptions): Promise<FolderScan> {
  const scan: FolderScan = { root, kind, layer: [], writable: [], languages: {}, excluded: [], folders: [], bytes: 0 };
  const folders = new Map<string, FolderSummary>();

  for await (const found of walk(root)) {
    if (found.link) {
      scan.excluded.push({ path: found.path, size: 0, reason: "a link or junction; not followed" });
      continue;
    }
    let path: string;
    try {
      path = normalizePath(found.path);
    } catch (error) {
      if (!(error instanceof LayerError)) throw error;
      scan.excluded.push({ path: found.path, size: found.size, reason: error.message });
      continue;
    }
    const where = classify(kind, path);
    if (where.kind === "excluded") {
      scan.excluded.push({ path, size: found.size, reason: where.reason });
      continue;
    }
    const file: ScannedFile = {
      path: where.kind === "language" ? where.path : path,
      size: found.size,
      hash: options.hash ? await hashFile(`${root}/${found.path}`) : null,
    };
    if (where.kind === "layer") scan.layer.push(file);
    else if (where.kind === "writable") scan.writable.push(file);
    else (scan.languages[where.language] ??= []).push(file);

    const top = path.includes("/") ? path.slice(0, path.indexOf("/")) : "";
    const summary = folders.get(top.toLowerCase()) ?? { name: top, files: 0, bytes: 0 };
    summary.files++;
    summary.bytes += found.size;
    folders.set(top.toLowerCase(), summary);
    scan.bytes += found.size;
  }

  scan.folders = [...folders.values()].sort((a, b) => b.bytes - a.bytes);
  return scan;
}

/** Specific files from a folder — the install's own archives, which sit among much else. */
export async function scanNamed(root: string, names: readonly string[], options: ScanOptions): Promise<ScannedFile[]> {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const files: ScannedFile[] = [];
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isFile || !wanted.has(entry.name.toLowerCase())) continue;
    const full = `${root}/${entry.name}`;
    const { size } = await Deno.stat(full);
    files.push({ path: entry.name, size, hash: options.hash ? await hashFile(full) : null });
  }
  return files.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
}

/** A layer from scanned files. Every file must have been hashed: a layer is identified by content. */
export function toLayer(id: string, role: FileLayerRole, files: readonly ScannedFile[]): FileLayer {
  const entries: FileEntry[] = files.map((file) => {
    if (file.hash === null) throw new LayerError(`"${file.path}" was not hashed; scan with { hash: true }`);
    return { path: file.path, hash: file.hash, size: file.size };
  });
  return { id, role, entries };
}

export async function hashFile(path: string): Promise<string> {
  // The stream closes the file when it has been read to the end.
  const file = await Deno.open(path, { read: true });
  const digest = await crypto.subtle.digest("SHA-256", file.readable);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Found {
  /** Relative to the walk's root, `/`-separated, spelled as on disk. */
  path: string;
  size: number;
  link: boolean;
}

/**
 * Every file under `root`, depth first, in a stable order. Links and junctions are reported and
 * never followed: a junction inside a mod folder can point anywhere, including back up the tree.
 */
async function* walk(root: string, prefix = ""): AsyncGenerator<Found> {
  const entries: Deno.DirEntry[] = [];
  for await (const entry of Deno.readDir(prefix ? `${root}/${prefix}` : root)) entries.push(entry);
  entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymlink) {
      yield { path, size: 0, link: true };
    } else if (entry.isDirectory) {
      yield* walk(root, path);
    } else if (entry.isFile) {
      const { size } = await Deno.stat(`${root}/${path}`);
      yield { path, size, link: false };
    }
  }
}
