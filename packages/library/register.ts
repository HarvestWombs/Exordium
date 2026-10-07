/**
 * Turning a D2SE import into library entries — referenced, so nothing is copied.
 *
 * The import must have been hashed: an entry is identified by content, and the pre-launch check
 * compares against these hashes. Ids are stable for the same install, so registering again updates
 * entries instead of duplicating them.
 */

import type { D2SEImport, ScannedFile } from "@exordium/d2se";
import { type Entry, LibraryError, type ManifestFile } from "./types.ts";
import type { Library } from "./library.ts";

/** Every entry an import describes: the install's archives, each core read, each mod read. */
export function entriesFromD2SE(imported: D2SEImport, now: Date = new Date()): Entry[] {
  const install = folderPath(imported.layout.root);
  const tag = installTag(install);
  const at = now.toISOString();
  const base = (folder: string) => ({ type: "d2se" as const, install, folder });
  const entries: Entry[] = [];

  if (imported.game.length > 0) {
    entries.push({
      id: `game-${tag}`,
      kind: "game",
      name: "Diablo II archives",
      version: null,
      core: null,
      source: { kind: "referenced", folder: install },
      origin: base(""),
      files: manifest(imported.game, "the install's archives"),
      languages: {},
      saves: null,
      setup: null,
      addedAt: at,
      checkedAt: at,
    });
  }

  for (const core of imported.cores) {
    entries.push({
      id: `core-${slug(core.version)}-${tag}`,
      kind: "core",
      name: `Core ${core.version}`,
      version: core.version,
      core: core.version,
      source: { kind: "referenced", folder: core.folder ? `${install}/${core.folder}` : install },
      origin: base(core.version),
      files: manifest(core.scan.layer, `core ${core.version}`),
      languages: languages(core.scan.languages, `core ${core.version}`),
      saves: null,
      setup: null,
      addedAt: at,
      checkedAt: at,
    });
  }

  for (const mod of imported.mods) {
    const folder = `${install}/MODS/${mod.folder}`;
    entries.push({
      id: `mod-${slug(mod.folder)}-${tag}`,
      kind: "mod",
      name: mod.setup?.mod.title ?? mod.folder,
      version: mod.setup?.mod.version ?? null,
      core: mod.setup?.mod.core ?? null,
      source: { kind: "referenced", folder },
      origin: base(mod.folder),
      files: manifest(mod.scan.layer, mod.folder),
      languages: languages(mod.scan.languages, mod.folder),
      // D2SE keeps a mod's characters in its own save folder; the box links to it.
      saves: `${folder}/save`,
      setup: mod.setup,
      addedAt: at,
      checkedAt: at,
    });
  }
  return entries;
}

export type RegisterAction = "added" | "updated" | "unchanged";

/**
 * Saves entries, keeping each existing entry's `addedAt`. An entry whose files and settings have not
 * changed is left exactly as it was, so registering twice is harmless.
 */
export async function register(
  library: Library,
  entries: readonly Entry[],
): Promise<{ id: string; action: RegisterAction }[]> {
  const results: { id: string; action: RegisterAction }[] = [];
  for (const entry of entries) {
    const existing = await library.get(entry.id);
    if (existing && sameContent(existing, entry)) {
      results.push({ id: entry.id, action: "unchanged" });
      continue;
    }
    await library.save(existing ? { ...entry, addedAt: existing.addedAt } : entry);
    results.push({ id: entry.id, action: existing ? "updated" : "added" });
  }
  return results;
}

/** Same files, same settings, same place — timestamps of the check itself do not count. */
export function sameContent(a: Entry, b: Entry): boolean {
  const strip = (e: Entry) => JSON.stringify({ ...e, addedAt: "", checkedAt: "" });
  return strip(a) === strip(b);
}

function manifest(files: readonly ScannedFile[], what: string): ManifestFile[] {
  return files.map((file) => {
    if (file.hash === null) {
      throw new LibraryError(`${what}: "${file.path}" was not hashed; import with { hash: true }`);
    }
    return { path: file.path, source: file.source, size: file.size, mtime: file.mtime, hash: file.hash };
  });
}

function languages(byCode: Record<string, ScannedFile[]>, what: string): Record<string, ManifestFile[]> {
  return Object.fromEntries(Object.entries(byCode).map(([code, files]) => [code, manifest(files, what)]));
}

export function folderPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** A short, stable tag for an install, so two installs' mods of the same name do not collide. */
export function installTag(install: string): string {
  // FNV-1a over the lowercased path: disambiguation, not security.
  let hash = 0x811c9dc5;
  for (const char of folderPath(install).toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 40);
  return s || "unnamed";
}
