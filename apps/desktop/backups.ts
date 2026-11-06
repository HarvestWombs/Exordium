/**
 * Copies of a title's save folder, so a corrupted or lost character can be brought back.
 *
 * Laid out per title, in the backups folder (Exordium's own by default, or one the player chose,
 * such as a cloud-synced folder):
 *
 *   <backups>/<box id>/<stamp>[-manual|-before-restore|-before-rebuild]/   the files, as they were
 *   <backups>/<box id>/<stamp>/backup.json                  what it holds, with every file's hash
 *
 * Taken automatically when the last copy of a title closes (the session settles), by hand from the
 * Backups tab, and before every restore. A backup identical to the newest one is not taken again.
 * Only automatic and before-restore backups are pruned; a manual one stays until the player deletes
 * it.
 *
 * Restoring writes the backup's files over the save folder and deletes nothing: a character made
 * since stays, and what was there is itself backed up first.
 */

const MANIFEST = "backup.json";
const ID = /^[0-9A-Za-z-]+$/;
export const DEFAULT_KEEP = 30;

export type BackupReason = "closed" | "manual" | "before-restore" | "before-rebuild";

export const CLASSES = ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"];

export interface Character {
  name: string;
  className: string;
  level: number;
  hardcore: boolean;
  dead: boolean;
  expansion: boolean;
  savedAt: string | null;
}

interface BackupFile {
  path: string;
  size: number;
  sha256: string;
}

interface Manifest {
  version: 1;
  createdAt: string;
  reason: BackupReason;
  title: string;
  /** The save folder it was taken from. */
  source: string;
  /** Over every file's path, size and hash: equal digests mean equal folders. */
  digest: string;
  files: BackupFile[];
  characters: Character[];
}

export interface BackupInfo {
  id: string;
  createdAt: string;
  reason: BackupReason;
  files: number;
  bytes: number;
  characters: Character[];
}

export type TakeResult =
  | { taken: BackupInfo }
  | { skipped: "empty" | "unchanged" };

/**
 * A `.d2s` header (the first 0x34 bytes), or null when it is not one. Saves before 1.09 (format 71 for
 * 1.00–1.06, 87 and 89 for 1.07–1.08) keep the name at 0x08, the flags at 0x18 and class and level at
 * 0x22 and 0x24, with no save time; 1.09 (92) and later (96) moved them (measured on D2SE's 1.00 and
 * 1.07 saves, 2026-11-06).
 */
export function readCharacter(header: Uint8Array): Character | null {
  if (header.length < 0x34) return null;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint32(0, true) !== 0xaa55aa55) return null;
  const old = view.getUint32(4, true) < 92;
  const nameBytes = old ? header.subarray(0x08, 0x18) : header.subarray(0x14, 0x24);
  const end = nameBytes.indexOf(0);
  const flags = header[old ? 0x18 : 0x24]!;
  const classId = header[old ? 0x22 : 0x28]!;
  const savedAt = old ? 0 : view.getUint32(0x30, true);
  return {
    name: new TextDecoder("windows-1252").decode(nameBytes.subarray(0, end < 0 ? 16 : end)),
    className: CLASSES[classId] ?? `Class ${classId}`,
    level: header[old ? 0x24 : 0x2b]!,
    hardcore: (flags & 0x04) !== 0,
    dead: (flags & 0x08) !== 0,
    expansion: (flags & 0x20) !== 0,
    savedAt: savedAt ? new Date(savedAt * 1000).toISOString() : null,
  };
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Every file under `root` with its contents; empty when the folder does not exist. A link to a file
 * is read as that file (a mod imported by linking has symlinked saves); links to folders are skipped.
 */
async function readTree(root: string, prefix = ""): Promise<{ path: string; bytes: Uint8Array<ArrayBuffer> }[]> {
  const found: { path: string; bytes: Uint8Array<ArrayBuffer> }[] = [];
  let entries: Deno.DirEntry[];
  try {
    entries = await Array.fromAsync(Deno.readDir(root));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return found;
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymlink) {
      const full = `${root}/${entry.name}`;
      if ((await Deno.stat(full).catch(() => null))?.isFile) found.push({ path, bytes: await Deno.readFile(full) });
      continue;
    }
    if (entry.isDirectory) found.push(...await readTree(`${root}/${entry.name}`, path));
    else if (entry.isFile) found.push({ path, bytes: await Deno.readFile(`${root}/${entry.name}`) });
  }
  return found;
}

async function digestOf(files: readonly BackupFile[]): Promise<string> {
  const text = files.map((f) => `${f.path}\0${f.size}\0${f.sha256}`).join("\n");
  return await sha256(new TextEncoder().encode(text));
}

function info(id: string, manifest: Manifest): BackupInfo {
  return {
    id,
    createdAt: manifest.createdAt,
    reason: manifest.reason,
    files: manifest.files.length,
    bytes: manifest.files.reduce((sum, file) => sum + file.size, 0),
    characters: manifest.characters,
  };
}

async function readManifest(folder: string): Promise<Manifest | null> {
  try {
    const manifest = JSON.parse(await Deno.readTextFile(`${folder}/${MANIFEST}`)) as Manifest;
    return manifest.version === 1 && Array.isArray(manifest.files) ? manifest : null;
  } catch {
    return null;
  }
}

/** A stored file path that stays inside its folder. */
function safePath(path: string): boolean {
  return path.length > 0 && !/^[\\/]|^[A-Za-z]:|(^|[\\/])\.\.([\\/]|$)/.test(path);
}

/** The backups of one title, newest first. */
export async function listBackups(titleFolder: string): Promise<BackupInfo[]> {
  const found: BackupInfo[] = [];
  try {
    for await (const entry of Deno.readDir(titleFolder)) {
      if (!entry.isDirectory || !ID.test(entry.name)) continue;
      const manifest = await readManifest(`${titleFolder}/${entry.name}`);
      if (manifest) found.push(info(entry.name, manifest));
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/**
 * Copies `saves` into a new backup under `titleFolder`. Nothing is taken from an empty or missing
 * folder, and nothing when it matches the newest backup and `skipIfUnchanged`. The copy is written
 * beside the others under a temporary name and renamed once complete, so a backup that exists is
 * always whole. Then automatic backups beyond `keep` are pruned, oldest first.
 */
export async function takeBackup(
  saves: string,
  titleFolder: string,
  options: { reason: BackupReason; title: string; keep: number; skipIfUnchanged: boolean; now?: Date },
): Promise<TakeResult> {
  const tree = await readTree(saves);
  if (tree.length === 0) return { skipped: "empty" };
  const files: BackupFile[] = [];
  for (const file of tree) files.push({ path: file.path, size: file.bytes.length, sha256: await sha256(file.bytes) });
  const digest = await digestOf(files);

  const existing = await listBackups(titleFolder);
  if (options.skipIfUnchanged && existing.length > 0) {
    const newest = await readManifest(`${titleFolder}/${existing[0]!.id}`);
    if (newest?.digest === digest) return { skipped: "unchanged" };
  }

  const now = options.now ?? new Date();
  const suffix = options.reason === "closed" ? "" : `-${options.reason}`;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  let id = `${stamp}${suffix}`;
  for (let n = 2; existing.some((b) => b.id === id); n++) id = `${stamp}-${n}${suffix}`;

  const characters: Character[] = [];
  for (const file of tree) {
    if (file.path.includes("/") || !file.path.toLowerCase().endsWith(".d2s")) continue;
    const character = readCharacter(file.bytes.subarray(0, 0x34));
    if (character) characters.push(character);
  }
  const manifest: Manifest = {
    version: 1,
    createdAt: now.toISOString(),
    reason: options.reason,
    title: options.title,
    source: saves,
    digest,
    files,
    characters,
  };

  await Deno.mkdir(titleFolder, { recursive: true });
  const partial = `${titleFolder}/.${id}.partial`;
  await Deno.remove(partial, { recursive: true }).catch(() => {});
  for (const file of tree) {
    const dest = `${partial}/${file.path}`;
    await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
    await Deno.writeFile(dest, file.bytes);
  }
  await Deno.writeTextFile(`${partial}/${MANIFEST}`, JSON.stringify(manifest, null, 2) + "\n");
  await Deno.rename(partial, `${titleFolder}/${id}`);

  await prune(titleFolder, options.keep);
  return { taken: info(id, manifest) };
}

/**
 * Removes a backup's folder. Windows often refuses for a moment after files were written (Defender
 * or the indexer still holds one, measured 2026-10-05), so it retries; still refused, the folder is
 * renamed out of the list and removed by a later prune.
 */
async function removeBackupFolder(titleFolder: string, id: string): Promise<void> {
  const folder = `${titleFolder}/${id}`;
  for (let attempt = 0;; attempt++) {
    try {
      await Deno.remove(folder, { recursive: true });
      return;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return;
      if (!(error instanceof Deno.errors.Busy) || attempt >= 4) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }
  await Deno.rename(folder, `${titleFolder}/.removed-${id}-${crypto.randomUUID().slice(0, 8)}`);
}

/** Removes every backup but manual ones beyond the newest `keep`, and leftovers. */
async function prune(titleFolder: string, keep: number): Promise<void> {
  const automatic = (await listBackups(titleFolder)).filter((b) => b.reason !== "manual");
  for (const old of automatic.slice(Math.max(1, keep))) await removeBackupFolder(titleFolder, old.id);
  const leftovers: string[] = [];
  for await (const entry of Deno.readDir(titleFolder)) {
    if (!entry.isDirectory) continue;
    if (/^\.(removed-.+|.+\.partial)$/.test(entry.name)) leftovers.push(entry.name);
  }
  for (const name of leftovers) await Deno.remove(`${titleFolder}/${name}`, { recursive: true }).catch(() => {});
}

export class BackupError extends Error {
  override name = "BackupError";
}

/**
 * Writes backup `id`'s files over `saves`. Deletes nothing; the caller backs `saves` up first.
 * Returns how many files were written; a file that already matches is left alone.
 *
 * Checked before anything is written, so a refused restore changes nothing: every backup file
 * against its recorded hash, and every file to replace for being writable. Players mark a character
 * read-only to protect it; that is theirs to undo, so such a file stops the restore and is named.
 */
export async function restoreBackup(titleFolder: string, id: string, saves: string): Promise<number> {
  if (!ID.test(id)) throw new BackupError("No such backup.");
  const folder = `${titleFolder}/${id}`;
  const manifest = await readManifest(folder);
  if (!manifest) throw new BackupError("No such backup.");
  const contents: { path: string; bytes: Uint8Array<ArrayBuffer> }[] = [];
  for (const file of manifest.files) {
    if (!safePath(file.path)) throw new BackupError(`The backup names a file outside it: ${file.path}`);
    const bytes = await Deno.readFile(`${folder}/${file.path}`).catch(() => null);
    if (!bytes || bytes.length !== file.size || await sha256(bytes) !== file.sha256) {
      throw new BackupError(`The backup is damaged: ${file.path} no longer matches. Nothing was restored.`);
    }
    contents.push({ path: file.path, bytes });
  }
  const changed: typeof contents = [];
  const locked: string[] = [];
  for (const file of contents) {
    const dest = `${saves}/${file.path}`;
    const current = await Deno.readFile(dest).catch(() => null);
    if (current && current.length === file.bytes.length && await sha256(current) === await sha256(file.bytes)) continue;
    changed.push(file);
    if (!current) continue;
    try {
      (await Deno.open(dest, { write: true })).close();
    } catch (error) {
      if (!(error instanceof Deno.errors.PermissionDenied)) throw error;
      locked.push(file.path);
    }
  }
  if (locked.length > 0) {
    throw new BackupError(
      `Nothing was restored: ${locked.join(", ")} ${locked.length === 1 ? "is" : "are"} read-only. ` +
        "Clear Read-only in the file's Properties to let a restore replace it.",
    );
  }
  for (const file of changed) {
    const dest = `${saves}/${file.path}`;
    await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
    await Deno.writeFile(dest, file.bytes);
  }
  return changed.length;
}

/** Deletes one backup. */
export async function deleteBackup(titleFolder: string, id: string): Promise<void> {
  if (!ID.test(id) || !(await readManifest(`${titleFolder}/${id}`))) throw new BackupError("No such backup.");
  await removeBackupFolder(titleFolder, id);
}
