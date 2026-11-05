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
  /**
   * Relative to the scanned folder, as found. The same as `path` except for a language file, whose
   * `path` is relative to its `Language_<code>` folder.
   */
  source: string;
  size: number;
  /** Last modified, in milliseconds since the epoch; `null` where the filesystem does not say. */
  mtime: number | null;
  /** Lowercase hex SHA-256, or `null` when the scan did not hash. */
  hash: string | null;
}

/** What a file looked like when it was last hashed, so an unchanged file need not be read again. */
export interface KnownFile {
  size: number;
  mtime: number | null;
  hash: string;
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
  /** How many files were actually read to hash them; the rest reused a known hash. */
  hashed: number;
  /**
   * The mod's top-level `data` folder as spelled on disk, when `linkData` left it unwalked; else null.
   * Its files are in no list above.
   */
  data: string | null;
}

export interface ScanOptions {
  hash: boolean;
  /**
   * Hashes from an earlier scan, keyed by `source` lowercased. A file with the same size and a known,
   * unchanged timestamp keeps its hash without being read — which is what makes checking a
   * referenced mod before every launch cheap.
   */
  known?: ReadonlyMap<string, KnownFile>;
  /**
   * Hash the player's files (a mod's saves) too. Off for the library, which links a mod's save folder
   * rather than recording it, so reading every character file on every check would be wasted.
   */
  hashWritable?: boolean;
  /**
   * Hashes by full path, lowercased with `/` separators, shared by every folder one import reads.
   * Checked after `known` with the same size-and-timestamp rule, and every file this scan hashes is
   * recorded in it, so a caller that keeps it between runs reads only the files that changed.
   */
  cache?: Map<string, KnownFile>;
  /**
   * Leave a mod's top-level `data` folder unwalked and report only its name (`FolderScan.data`).
   * The game reads loose files from `data\` beside Game.exe, and only with -direct, so a box links
   * the folder whole rather than file by file; its files never need listing or hashing.
   */
  linkData?: boolean;
  /** Byte progress while an uncached file is being hashed. Cached files do not call this. */
  onHash?: (read: number, total: number) => void;
}

async function hashOrReuse(full: string, source: string, size: number, mtime: number | null, options: ScanOptions) {
  if (!options.hash) return { hash: null, read: false };
  const known = options.known?.get(source.toLowerCase());
  if (known && mtime !== null && known.mtime === mtime && known.size === size) return { hash: known.hash, read: false };
  const key = full.replaceAll("\\", "/").toLowerCase();
  const cached = options.cache?.get(key);
  if (cached && mtime !== null && cached.mtime === mtime && cached.size === size) {
    return { hash: cached.hash, read: false };
  }
  const hash = await hashFile(full, options.onHash ? (read) => options.onHash!(read, size) : undefined);
  if (mtime !== null) options.cache?.set(key, { size, mtime, hash });
  return { hash, read: true };
}

export async function scanFolder(root: string, kind: FolderKind, options: ScanOptions): Promise<FolderScan> {
  const scan: FolderScan = {
    root,
    kind,
    layer: [],
    writable: [],
    languages: {},
    excluded: [],
    folders: [],
    bytes: 0,
    hashed: 0,
    data: null,
  };
  const folders = new Map<string, FolderSummary>();
  const skip = kind === "mod" && options.linkData
    ? (path: string) => {
      if (path.toLowerCase() !== "data") return false;
      scan.data = path;
      return true;
    }
    : undefined;

  for await (const found of walk(root, "", skip)) {
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
    const skip = where.kind === "writable" && options.hashWritable === false;
    const { hash, read } = skip
      ? { hash: null, read: false }
      : await hashOrReuse(`${root}/${found.path}`, path, found.size, found.mtime, options);
    if (read) scan.hashed++;
    const file: ScannedFile = {
      path: where.kind === "language" ? where.path : path,
      source: path,
      size: found.size,
      mtime: found.mtime,
      hash,
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
    // These are explicit, trusted top-level game filenames. Follow their file symlinks so an
    // Exordium library can reference the source install without allowing links while walking mods.
    if ((!entry.isFile && !entry.isSymlink) || !wanted.has(entry.name.toLowerCase())) continue;
    const full = `${root}/${entry.name}`;
    const info = await Deno.stat(full);
    if (!info.isFile) continue;
    const mtime = info.mtime?.getTime() ?? null;
    const { hash } = await hashOrReuse(full, entry.name, info.size, mtime, options);
    files.push({ path: entry.name, source: entry.name, size: info.size, mtime, hash });
  }
  return files.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
}

/**
 * Every file under one subfolder of `root`, found by name case-insensitively, with paths that keep
 * the subfolder (`PlugY/PlugY.dll`). Links are skipped, as everywhere. Empty when it is absent.
 */
export async function scanTree(root: string, folder: string, options: ScanOptions): Promise<ScannedFile[]> {
  let name: string | null = null;
  for await (const entry of Deno.readDir(root)) {
    if (entry.isDirectory && entry.name.toLowerCase() === folder.toLowerCase()) name = entry.name;
  }
  if (name === null) return [];
  const files: ScannedFile[] = [];
  for await (const found of walk(`${root}/${name}`)) {
    if (found.link) continue;
    const path = `${name}/${found.path}`;
    const { hash } = await hashOrReuse(`${root}/${path}`, path, found.size, found.mtime, options);
    files.push({ path, source: path, size: found.size, mtime: found.mtime, hash });
  }
  return files;
}

/** A layer from scanned files. Every file must have been hashed: a layer is identified by content. */
export function toLayer(id: string, role: FileLayerRole, files: readonly ScannedFile[]): FileLayer {
  const entries: FileEntry[] = files.map((file) => {
    if (file.hash === null) throw new LayerError(`"${file.path}" was not hashed; scan with { hash: true }`);
    return { path: file.path, hash: file.hash, size: file.size };
  });
  return { id, role, entries };
}

export async function hashFile(path: string, onProgress?: (read: number) => void): Promise<string> {
  // The stream closes the file when it has been read to the end.
  const file = await Deno.open(path, { read: true });
  let read = 0;
  async function* counted(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    for await (const chunk of file.readable) {
      read += chunk.byteLength;
      onProgress!(read);
      // Deno's file stream may be backed by ArrayBufferLike; digest requires an owned ArrayBuffer.
      yield new Uint8Array(chunk);
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", onProgress ? counted() : file.readable);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Found {
  /** Relative to the walk's root, `/`-separated, spelled as on disk. */
  path: string;
  size: number;
  mtime: number | null;
  link: boolean;
}

/**
 * Every file under `root`, depth first, in a stable order. A link to a file counts as that file: a
 * mod imported by linking is a tree of file symlinks into the original folder. A link or junction to
 * a folder is reported and never followed, since it can point anywhere, including back up the tree;
 * so is a link whose target is gone.
 */
async function* walk(root: string, prefix = "", skip?: (path: string) => boolean): AsyncGenerator<Found> {
  const entries: Deno.DirEntry[] = [];
  for await (const entry of Deno.readDir(prefix ? `${root}/${prefix}` : root)) entries.push(entry);
  entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  // A folder's files are stat'ed together rather than one by one: a mod's data tree runs to
  // thousands of files, and one at a time that alone took most of a second.
  const infos = new Map<string, Deno.FileInfo | null>();
  const files = entries.filter((entry) => entry.isFile || entry.isSymlink);
  for (let i = 0; i < files.length; i += STAT_BATCH) {
    await Promise.all(
      files.slice(i, i + STAT_BATCH).map(async (entry) => {
        const full = `${root}/${prefix ? `${prefix}/` : ""}${entry.name}`;
        infos.set(entry.name, await Deno.stat(full).catch((error) => entry.isSymlink ? null : Promise.reject(error)));
      }),
    );
  }
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymlink) {
      const info = infos.get(entry.name);
      if (info?.isFile) yield { path, size: info.size, mtime: info.mtime?.getTime() ?? null, link: false };
      else yield { path, size: 0, mtime: null, link: true };
    } else if (entry.isDirectory) {
      if (!skip?.(path)) yield* walk(root, path, skip);
    } else if (entry.isFile) {
      const info = infos.get(entry.name)!;
      yield { path, size: info.size, mtime: info.mtime?.getTime() ?? null, link: false };
    }
  }
}

/** How many stats run at once. */
const STAT_BATCH = 64;
