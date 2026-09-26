/**
 * The check before every launch: has a referenced entry's folder changed since it was last read?
 *
 * A modder edits their mod between runs, and the whole point of referencing is that those edits
 * show on the next launch. Size and timestamp spot a changed file without reading it; only changed
 * or new files are hashed, so checking an unchanged 1.5 GB mod reads nothing but its folder listing.
 */

import { GAME_ARCHIVES, type KnownFile, readSetupFile, scanFolder, scanNamed, type ScannedFile } from "@exordium/d2se";
import { type Entry, LibraryError, type ManifestFile } from "./types.ts";

export interface EntryChanges {
  added: string[];
  removed: string[];
  changed: string[];
  /** The mod's D2SE_SETUP.ini says something different now. */
  setup: boolean;
}

export interface Refreshed {
  entry: Entry;
  changes: EntryChanges;
  /** Files that had to be read and hashed. */
  hashed: number;
}

export function hasChanges(changes: EntryChanges): boolean {
  return changes.added.length > 0 || changes.removed.length > 0 || changes.changed.length > 0 || changes.setup;
}

/** Re-reads a referenced entry's folder. A stored entry never changes and comes back as it is. */
export async function refresh(entry: Entry, now: Date = new Date()): Promise<Refreshed> {
  const none: EntryChanges = { added: [], removed: [], changed: [], setup: false };
  if (entry.source.kind !== "referenced") return { entry, changes: none, hashed: 0 };
  const folder = entry.source.folder;
  try {
    if (!(await Deno.stat(folder)).isDirectory) throw new Deno.errors.NotFound();
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    throw new LibraryError(`${entry.name}: ${folder} is gone — was it moved or deleted?`);
  }

  const known = new Map<string, KnownFile>();
  const remember = (file: ManifestFile) => known.set(file.source.toLowerCase(), file);
  entry.files.forEach(remember);
  Object.values(entry.languages).forEach((files) => files.forEach(remember));

  let files: ScannedFile[];
  let languages: Record<string, ScannedFile[]> = {};
  let hashed = 0;
  if (entry.kind === "game") {
    files = await scanNamed(folder, GAME_ARCHIVES, { hash: true, known });
    hashed = files.filter((f) => !isKnown(known, f)).length;
  } else {
    const scan = await scanFolder(folder, entry.kind, { hash: true, known, hashWritable: false });
    files = scan.layer;
    languages = scan.languages;
    hashed = scan.hashed;
  }

  const setup = entry.kind === "mod" ? await readSetupFile(folder) : entry.setup;
  const next: Entry = {
    ...entry,
    files: files.map(toManifest),
    languages: Object.fromEntries(Object.entries(languages).map(([code, list]) => [code, list.map(toManifest)])),
    setup,
    version: entry.kind === "mod" ? setup?.mod.version ?? null : entry.version,
    core: entry.kind === "mod" ? setup?.mod.core ?? null : entry.core,
    name: entry.kind === "mod" ? setup?.mod.title ?? entry.origin.folder : entry.name,
    checkedAt: now.toISOString(),
  };

  const changes = diffFiles(
    [...entry.files, ...Object.values(entry.languages).flat()],
    [...next.files, ...Object.values(next.languages).flat()],
  );
  changes.setup = JSON.stringify(entry.setup) !== JSON.stringify(setup);
  return { entry: next, changes, hashed };
}

function isKnown(known: ReadonlyMap<string, KnownFile>, file: ScannedFile): boolean {
  const k = known.get(file.source.toLowerCase());
  return k !== undefined && file.mtime !== null && k.mtime === file.mtime && k.size === file.size;
}

function toManifest(file: ScannedFile): ManifestFile {
  return { path: file.path, source: file.source, size: file.size, mtime: file.mtime, hash: file.hash! };
}

function diffFiles(before: readonly ManifestFile[], after: readonly ManifestFile[]): EntryChanges {
  const old = new Map(before.map((f) => [f.source.toLowerCase(), f]));
  const changes: EntryChanges = { added: [], removed: [], changed: [], setup: false };
  for (const file of after) {
    const previous = old.get(file.source.toLowerCase());
    if (!previous) changes.added.push(file.source);
    else if (previous.hash !== file.hash) changes.changed.push(file.source);
    old.delete(file.source.toLowerCase());
  }
  changes.removed = [...old.values()].map((f) => f.source);
  return changes;
}
