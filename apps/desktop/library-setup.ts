/**
 * Exordium's own library: the game files, cores and mods it runs, copied out of the player's Diablo II
 * install so that nothing launches from (or scans) the install itself (decided 2026-10-10).
 *
 *   <Exordium>/library/
 *     exordium-library.json      the marker; the D2SE reader reads a folder with it (findD2SE)
 *     game/                      the install's game layer: its MPQs, D2.LNG, video DLLs, wrappers
 *     cores/<version>/           cores, copied from the install's D2SE or installed from the Cores tab
 *     mods/<folder>/             mods, imported from the install (with their exordium.mod.json) or
 *                                installed from Browse
 *
 * The folders are LIBRARY_FOLDERS; the install keeps D2SE's own (D2SE_FOLDERS), and the reader takes
 * either. The install is read only by setup and by the mod import (the converter); every file is
 * copied, never linked, so the two are fully independent.
 */

import {
  GAME_ARCHIVES,
  INSTALL_FILES,
  LIBRARY_FOLDERS,
  LIBRARY_MARKER,
  PLUGY_FOLDER,
  RENDERER_WRAPPERS,
} from "@exordium/d2se";

/** Without these the game cannot start at all: Diablo II's data and Lord of Destruction's. */
const REQUIRED = ["d2data.mpq", "d2exp.mpq"];
const CORE_NAME = /^\d+\.\d+[a-z]?$/i;

const slash = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");

export function libraryFolder(exordiumRoot: string): string {
  return `${slash(exordiumRoot)}/library`;
}

export async function isLibrary(root: string | null | undefined): Promise<boolean> {
  if (!root) return false;
  return await Deno.stat(`${slash(root)}/${LIBRARY_MARKER}`).then((s) => s.isFile, () => false);
}

async function sizeOf(path: string): Promise<number> {
  const info = await Deno.lstat(path).catch(() => null);
  if (!info || info.isSymlink) return 0;
  if (info.isFile) return info.size;
  if (!info.isDirectory) return 0;
  let total = 0;
  for await (const entry of Deno.readDir(path)) total += await sizeOf(`${path}/${entry.name}`);
  return total;
}

async function namesIn(folder: string, dirs: boolean): Promise<string[]> {
  const names: string[] = [];
  try {
    for await (const entry of Deno.readDir(folder)) if (dirs ? entry.isDirectory : entry.isFile) names.push(entry.name);
  } catch {
    // Missing: none.
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

/** A file's or folder's size in bytes; links are not followed. */
export const folderSize = sizeOf;

/** The install's mod folders: those with a D2SE_SETUP.ini or an exordium.mod.json. */
export async function installModFolders(install: string): Promise<string[]> {
  const root = slash(install);
  const mods: string[] = [];
  for (const folder of await namesIn(`${root}/MODS`, true)) {
    const files = await namesIn(`${root}/MODS/${folder}`, false);
    if (files.some((name) => /^(d2se_setup\.ini|exordium\.mod\.json)$/i.test(name))) mods.push(folder);
  }
  return mods;
}

export interface InstallCheck {
  install: string;
  /** The game layer found: each file or folder Exordium copies, and its size. */
  gameFiles: { name: string; size: number }[];
  gameBytes: number;
  missing: string[];
  /** A missing required archive: the install cannot be used. */
  problem: string | null;
  d2se: boolean;
  cores: { version: string; size: number }[];
  /** Mod folders with a D2SE_SETUP.ini or an exordium.mod.json. */
  mods: string[];
}

/** What the install holds, read only. The "soft verify" setup shows before copying anything. */
export async function checkInstall(install: string): Promise<InstallCheck> {
  const root = slash(install);
  const files = new Map((await namesIn(root, false)).map((name) => [name.toLowerCase(), name]));
  const wanted = [...GAME_ARCHIVES, ...INSTALL_FILES, ...RENDERER_WRAPPERS];
  const gameFiles: InstallCheck["gameFiles"] = [];
  for (const name of wanted) {
    const actual = files.get(name);
    if (actual) gameFiles.push({ name: actual, size: await sizeOf(`${root}/${actual}`) });
  }
  const plugy = (await namesIn(root, true)).find((name) => name.toLowerCase() === PLUGY_FOLDER.toLowerCase());
  if (plugy) gameFiles.push({ name: plugy, size: await sizeOf(`${root}/${plugy}`) });
  const missing = GAME_ARCHIVES.filter((name) => !files.has(name));
  const lacking = REQUIRED.filter((name) => !files.has(name));
  const d2se = files.has("d2se.exe");
  const cores = [];
  for (const version of (await namesIn(`${root}/D2SE/CORES`, true)).filter((name) => CORE_NAME.test(name))) {
    cores.push({ version, size: await sizeOf(`${root}/D2SE/CORES/${version}`) });
  }
  const mods = await installModFolders(root);
  return {
    install: root,
    gameFiles,
    gameBytes: gameFiles.reduce((sum, file) => sum + file.size, 0),
    missing,
    problem: lacking.length
      ? `This is not a Diablo II: Lord of Destruction install: ${lacking.join(" and ")} ${
        lacking.length === 1 ? "is" : "are"
      } missing.`
      : null,
    d2se,
    cores,
    mods,
  };
}

/** Makes the library's folders and marker. Existing contents are left as they are. */
export async function createLibrary(library: string, install: string): Promise<void> {
  const root = slash(library);
  for (const folder of Object.values(LIBRARY_FOLDERS)) await Deno.mkdir(`${root}/${folder}`, { recursive: true });
  const marker = `${root}/${LIBRARY_MARKER}`;
  if (!(await isLibrary(root))) {
    await Deno.writeTextFile(
      marker,
      JSON.stringify({ version: 1, install: slash(install), createdAt: new Date().toISOString() }, null, 2) + "\n",
    );
  }
}

// ---- Copy jobs --------------------------------------------------------------------------------------

export type CopyKind = "game" | "core" | "mod";

export interface CopyJob {
  id: string;
  kind: CopyKind;
  /** What is copied: "Game files", a core's version, a mod's folder. */
  label: string;
  state: "copying" | "done" | "failed";
  copied: number;
  total: number;
  error: string | null;
  startedAt: string;
}

const jobs = new Map<string, CopyJob>();

export function copyJobs(): CopyJob[] {
  return [...jobs.values()].map((job) => ({ ...job }));
}

export function copyJob(id: string): CopyJob | null {
  const job = jobs.get(id);
  return job ? { ...job } : null;
}

async function copyTree(from: string, to: string, job: CopyJob): Promise<void> {
  const info = await Deno.lstat(from);
  if (info.isSymlink) return;
  if (info.isFile) {
    // The OS copy (CopyFileW on Windows): far faster than a userspace read/write loop, and it keeps
    // the file's timestamps. Progress is per file rather than per chunk, which is fine for mod files.
    await Deno.copyFile(from, to);
    job.copied += info.size;
    return;
  }
  await Deno.mkdir(to, { recursive: true });
  for await (const entry of Deno.readDir(from)) await copyTree(`${from}/${entry.name}`, `${to}/${entry.name}`, job);
}

/**
 * Copies each `from` to its `to` in the background, never over something that is there: a top-level
 * entry that exists is skipped when `skipExisting`, refused otherwise. Each entry is copied to a
 * `.partial` name first and renamed into place, so a failed copy leaves nothing half-done behind.
 *
 * With `move`, the source is removed once it is in place: on the same drive this is an instant
 * rename (no second copy, so it saves the space immediately); across drives it falls back to copy
 * then delete, which frees the source's drive once done. The caller is removing files from wherever
 * `from` is, so only use it where that is the user's choice.
 */
export function startCopy(
  kind: CopyKind,
  label: string,
  pairs: { from: string; to: string }[],
  options: { skipExisting?: boolean; move?: boolean; then?: () => Promise<void> } = {},
): CopyJob {
  const running = [...jobs.values()].find((j) => j.kind === kind && j.label === label && j.state === "copying");
  if (running) return { ...running };
  const job: CopyJob = {
    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    label,
    state: "copying",
    copied: 0,
    total: 0,
    error: null,
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  void (async () => {
    const todo: { from: string; to: string; bytes: number }[] = [];
    try {
      for (const pair of pairs) {
        const from = slash(pair.from);
        const to = slash(pair.to);
        if (await Deno.lstat(to).then(() => true, () => false)) {
          if (options.skipExisting) continue;
          throw new Error(`${to.split("/").pop()} is already in Exordium's library; it was not replaced.`);
        }
        const bytes = await sizeOf(from);
        job.total += bytes;
        todo.push({ from, to, bytes });
      }
      for (const { from, to, bytes } of todo) {
        await Deno.mkdir(to.replace(/\/[^/]+$/, ""), { recursive: true });
        if (options.move && await Deno.rename(from, to).then(() => true, () => false)) {
          // Same drive: an instant rename moved it in one step, no bytes streamed.
          job.copied += bytes;
          continue;
        }
        const partial = `${to}.partial`;
        await Deno.remove(partial, { recursive: true }).catch(() => {});
        await copyTree(from, partial, job);
        await Deno.rename(partial, to);
        // Move across drives: the copy is in place, so the source can go.
        if (options.move) await Deno.remove(from, { recursive: true }).catch(() => {});
      }
      await options.then?.();
      job.state = "done";
    } catch (error) {
      for (const { to } of todo) await Deno.remove(`${to}.partial`, { recursive: true }).catch(() => {});
      job.state = "failed";
      job.error = (error as Error).message;
    }
  })();
  return { ...job };
}
