/**
 * Exordium's own library: the game files, cores and mods it runs. The game layer normally links to
 * the player's Diablo II install; cores and mods are installed into the library itself.
 *
 *   <Exordium>/library/
 *     exordium-library.json      the marker; the D2SE reader reads a folder with it (findD2SE)
 *     game/                      the install's game layer: its MPQs, D2.LNG, video DLLs and graphics
 *                                wrappers
 *     cores/<version>/           cores, copied from the install's D2SE or installed from the Cores tab;
 *                                a 1.14 install's own core is copied here too (copyInstallCore)
 *     mods/<folder>/             mods, imported from the install (with their exordium.mod.json) or
 *                                installed from Browse
 *     plugy/                     the player's own PlugY, for a title whose mod brings none
 *
 * The folders are LIBRARY_FOLDERS; the install keeps D2SE's own (D2SE_FOLDERS), and the reader takes
 * either. Automatic game setup prefers symbolic links, falls back to hardlinks on the same volume,
 * then copies. The player can still explicitly copy or move the files instead.
 */

import {
  GAME_ARCHIVES,
  INSTALL_FILES,
  LIBRARY_FOLDERS,
  LIBRARY_MARKER,
  LIBRARY_PLUGY,
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

/** How many files a file or folder holds, links not followed: what a linking job counts by. */
async function filesIn(path: string): Promise<number> {
  const info = await Deno.lstat(path).catch(() => null);
  if (!info || info.isSymlink) return 0;
  if (info.isFile) return 1;
  if (!info.isDirectory) return 0;
  let total = 0;
  for await (const entry of Deno.readDir(path)) total += await filesIn(`${path}/${entry.name}`);
  return total;
}

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
  for (const folder of [...Object.values(LIBRARY_FOLDERS), LIBRARY_PLUGY]) {
    await Deno.mkdir(`${root}/${folder}`, { recursive: true });
  }
  const marker = `${root}/${LIBRARY_MARKER}`;
  if (!(await isLibrary(root))) {
    await Deno.writeTextFile(
      marker,
      JSON.stringify({ version: 1, install: slash(install), createdAt: new Date().toISOString() }, null, 2) + "\n",
    );
  }
}

export type TransferMode = "auto" | "symlink" | "hardlink" | "copy" | "move";
type UsedTransferMode = Exclude<TransferMode, "auto" | "move"> | "move";

/** Records how the game layer was populated so diagnostics and repairs can explain its ownership. */
export async function recordLibraryTransfer(
  library: string,
  requested: TransferMode,
  methods: Readonly<Record<UsedTransferMode, number>>,
): Promise<void> {
  const marker = `${slash(library)}/${LIBRARY_MARKER}`;
  const current = JSON.parse(await Deno.readTextFile(marker)) as Record<string, unknown>;
  await Deno.writeTextFile(
    marker,
    JSON.stringify({ ...current, version: 2, gameTransfer: { requested, methods } }, null, 2) + "\n",
  );
}

// ---- Copy jobs --------------------------------------------------------------------------------------

/** `archive`: a mod archive unpacked for the converter to review (startTask), not yet in the library. */
export type CopyKind = "game" | "core" | "mod" | "archive";

/** A mod an unpacked archive holds, for the converter to review and move into the library. */
export interface UnpackedMod {
  folder: string;
  /** The unpacked folder, `/`-separated. */
  path: string;
  title: string;
  core: string | null;
}

export interface CopyJob {
  id: string;
  kind: CopyKind;
  /** What is copied: "Game files", a core's version, a mod's folder. */
  label: string;
  /** `queued`: waiting for the copies ahead of it (startCopy's `queue`). */
  state: "queued" | "copying" | "done" | "failed" | "cancelled";
  /** Cancel was asked for: the copy stops before its next file and removes what it wrote. */
  cancelling: boolean;
  copied: number;
  total: number;
  /**
   * How the files are placed. Linking takes the same time for a large file as for a small one, so a
   * linking job's progress is `filesDone` of `files` rather than bytes. `unpack`: an archive being
   * unpacked, `copied` of `total` bytes written (`total` is 0 when the archive does not say).
   */
  mode: TransferMode | "unpack";
  files: number;
  filesDone: number;
  step: CopyStep | null;
  /** What an unpacked archive holds, once it is unpacked. */
  found: UnpackedMod[] | null;
  error: string | null;
  startedAt: string;
  /** Files placed by each method. Automatic jobs can use more than one fallback. */
  methods: Record<UsedTransferMode, number>;
}

/**
 * What a job is doing once its files are in, while its `then` runs: copying a 1.14 install's core,
 * or reading the new files' hashes. Null while files are still being placed, and once it is done.
 */
export type CopyStep = { kind: "core"; core: string } | { kind: "hashes" };

class CopyCancelled extends Error {}

const jobs = new Map<string, CopyJob>();
/** Queued copies run one after another, so several large mods do not fight over the disk. */
let queue: Promise<void> = Promise.resolve();

export function copyJobs(): CopyJob[] {
  return [...jobs.values()].map((job) => ({ ...job }));
}

export function copyJob(id: string): CopyJob | null {
  const job = jobs.get(id);
  return job ? { ...job } : null;
}

/**
 * Stops a copy: one still waiting never starts, and one running stops before its next file (a file
 * under way finishes first). Only the `.partial` copy is removed, so the source is never touched.
 */
export function cancelCopy(id: string): CopyJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.state === "queued") job.state = "cancelled";
  else if (job.state === "copying") job.cancelling = true;
  return { ...job };
}

async function transferFile(from: string, to: string, job: CopyJob, mode: TransferMode): Promise<void> {
  const choices: UsedTransferMode[] = mode === "auto"
    ? ["symlink", "hardlink", "copy"]
    : [mode === "move" ? "copy" : mode];
  let lastError: Error | null = null;
  for (const choice of choices) {
    try {
      if (choice === "symlink") await Deno.symlink(from, to, { type: "file" });
      else if (choice === "hardlink") await Deno.link(from, to);
      else await Deno.copyFile(from, to);
      job.methods[choice]++;
      return;
    } catch (error) {
      lastError = error as Error;
      await Deno.remove(to).catch(() => {});
    }
  }
  throw lastError ?? new Error(`Could not place ${from}.`);
}

async function transferTree(from: string, to: string, job: CopyJob, mode: TransferMode): Promise<void> {
  const info = await Deno.lstat(from);
  if (info.isSymlink) return;
  if (info.isFile) {
    if (job.cancelling) throw new CopyCancelled();
    await transferFile(from, to, job, mode);
    job.copied += info.size;
    job.filesDone++;
    return;
  }
  await Deno.mkdir(to, { recursive: true });
  for await (const entry of Deno.readDir(from)) {
    await transferTree(`${from}/${entry.name}`, `${to}/${entry.name}`, job, mode);
  }
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
 *
 * With `queue`, the copy waits (`queued`) until every queued copy before it has finished: the
 * converter queues each mod it imports and moves on, so the player keeps working while they copy.
 */
function newJob(kind: CopyKind, label: string, mode: CopyJob["mode"], state: CopyJob["state"]): CopyJob {
  const job: CopyJob = {
    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    label,
    state,
    cancelling: false,
    copied: 0,
    total: 0,
    mode,
    files: 0,
    filesDone: 0,
    step: null,
    found: null,
    error: null,
    startedAt: new Date().toISOString(),
    methods: { symlink: 0, hardlink: 0, copy: 0, move: 0 },
  };
  jobs.set(job.id, job);
  return job;
}

/**
 * Work that is not a copy, followed like one: the same job list, progress and status. `work` keeps
 * the job's `copied`, `total` and `step` up to date as it goes. It starts at once, outside the copy
 * queue, and cannot be cancelled.
 */
export function startTask(
  kind: CopyKind,
  label: string,
  mode: CopyJob["mode"],
  work: (job: CopyJob) => Promise<void>,
): CopyJob {
  const job = newJob(kind, label, mode, "copying");
  void (async () => {
    try {
      await work(job);
      job.step = null;
      job.state = "done";
    } catch (error) {
      job.state = "failed";
      job.error = (error as Error).message;
    }
  })();
  return { ...job };
}

export function startCopy(
  kind: CopyKind,
  label: string,
  pairs: { from: string; to: string }[],
  options: {
    skipExisting?: boolean;
    move?: boolean;
    mode?: TransferMode;
    queue?: boolean;
    /** Runs once the files are in; `step` says what it is doing, for the job's status. */
    then?: (job: Readonly<CopyJob>, step: (step: CopyStep) => void) => Promise<void>;
  } = {},
): CopyJob {
  const running = [...jobs.values()].find((j) =>
    j.kind === kind && j.label === label && (j.state === "copying" || j.state === "queued")
  );
  if (running) return { ...running };
  const job = newJob(kind, label, options.move ? "move" : options.mode ?? "copy", options.queue ? "queued" : "copying");
  const run = async () => {
    if (job.state === "cancelled") return;
    job.state = "copying";
    const todo: { from: string; to: string; bytes: number; files: number }[] = [];
    const linking = job.mode === "auto" || job.mode === "symlink" || job.mode === "hardlink";
    try {
      for (const pair of pairs) {
        const from = slash(pair.from);
        const to = slash(pair.to);
        if (await Deno.lstat(to).then(() => true, () => false)) {
          if (options.skipExisting) continue;
          throw new Error(`${to.split("/").pop()} is already in Exordium's library; it was not replaced.`);
        }
        const bytes = await sizeOf(from);
        const files = linking ? await filesIn(from) : 0;
        job.total += bytes;
        job.files += files;
        todo.push({ from, to, bytes, files });
      }
      for (const { from, to, bytes, files } of todo) {
        if (job.cancelling) throw new CopyCancelled();
        await Deno.mkdir(to.replace(/\/[^/]+$/, ""), { recursive: true });
        const move = options.move || options.mode === "move";
        if (move && await Deno.rename(from, to).then(() => true, () => false)) {
          // Same drive: an instant rename moved it in one step, no bytes streamed.
          job.methods.move++;
          job.copied += bytes;
          job.filesDone += files;
          continue;
        }
        const partial = `${to}.partial`;
        await Deno.remove(partial, { recursive: true }).catch(() => {});
        await transferTree(from, partial, job, options.mode ?? "copy");
        await Deno.rename(partial, to);
        // Move across drives: the copy is in place, so the source can go.
        if (move) {
          await Deno.remove(from, { recursive: true }).catch(() => {});
          job.methods.move += job.methods.copy;
          job.methods.copy = 0;
        }
      }
      await options.then?.({ ...job, methods: { ...job.methods } }, (step) => void (job.step = step));
      job.step = null;
      job.state = "done";
    } catch (error) {
      for (const { to } of todo) await Deno.remove(`${to}.partial`, { recursive: true }).catch(() => {});
      if (error instanceof CopyCancelled) {
        job.state = "cancelled";
        return;
      }
      job.state = "failed";
      job.error = (error as Error).message;
    }
  };
  if (options.queue) queue = queue.then(run);
  else void run();
  return { ...job };
}
