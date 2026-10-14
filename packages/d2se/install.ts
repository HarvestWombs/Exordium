/**
 * Reading a whole D2SE install: the launcher's settings, the install's own archives, every core
 * and every mod, with the problems that would stop a mod running. Read-only throughout.
 *
 * A D2SE root is recognised without guessing: `D2SE.exe` beside `D2SE.ini` and a `MODS` folder,
 * with `D2SE\CORES\<version>\` inside. Cores hold one version's DLLs and `patch_d2.mpq`; the large
 * archives every version shares (`d2data.mpq` …) sit in the root, and become the `game` layer.
 *
 * A root whose `Game.exe` is 1.14 is a core too: 1.14 folded the DLLs into the exe, so the root's
 * `Game.exe` and `patch_d2.mpq` are that version's core (`exe-version.ts`).
 */

import { decodeIni, parseIni } from "./ini.ts";
import { type LauncherSettings, type ModSetup, readLauncherSettings, readModSetup } from "./setup.ts";
import { rootCoreName, SINGLE_EXE_CORE_FILES } from "./exe-version.ts";
import { type FolderScan, scanFolder, scanNamed, type ScannedFile, type ScanOptions, scanTree } from "./scan.ts";

/**
 * Renderer wrappers an install carries in its root: Sven's Glide wrapper and dgVoodoo here. D2SE.exe
 * sits in the root, so Windows finds these by name for every mod; a mod's own wrapper (D2GL in The
 * Black Soul) still wins, which the layers reproduce with mod over game. Only these names are taken:
 * the root also holds a 1.13c set of game DLLs no box should see.
 */
export const RENDERER_WRAPPERS = [
  "glide3x.dll",
  "ddraw.dll",
  "d3d8.dll",
  "d3d9.dll",
  "d3dimm.dll",
  "dgvoodoo.conf",
] as const;

/**
 * Other install files the game opens by name from its own folder. `D2.LNG` is a resource-only DLL of
 * language strings: D2Client loads it with `LoadLibraryExA("D2.LNG", NULL, LOAD_LIBRARY_AS_DATAFILE)`
 * when a game starts (1.10f D2Client+0x1260), and without it stops with "Unable to start LNG manager".
 * The video and image DLLs (`SmackW32.dll`, `binkw32.dll`, `ijl11.dll`) come too: D2Win imports
 * them, and cores taken from D2SE do not carry them (D2SE leaves them in the install's root), so
 * without these D2Win fails to load. A core that ships its own (every catalog core does) wins.
 */
export const INSTALL_FILES = ["d2.lng", "ijl11.dll", "binkw32.dll", "smackw32.dll"] as const;

/**
 * Marks Exordium's own library (apps/desktop/library-setup.ts). It holds the same three things as a
 * D2SE install, in its own folders (LIBRARY_FOLDERS); `findD2SE` reads either.
 */
export const LIBRARY_MARKER = "exordium-library.json";

/** Where a root keeps its game files, cores and mods, relative to it (`""` is the root itself). */
export interface LayoutFolders {
  game: string;
  cores: string;
  mods: string;
}

/** A D2SE install: the game files in the root, `D2SE\CORES\<version>`, `MODS\<folder>`. */
export const D2SE_FOLDERS: LayoutFolders = { game: "", cores: "D2SE/CORES", mods: "MODS" };

/** Exordium's library: `game\`, `cores\<version>`, `mods\<folder>`. */
export const LIBRARY_FOLDERS: LayoutFolders = { game: "game", cores: "cores", mods: "mods" };

/** `root` joined with one of its layout folders, and a name under it. */
export function layoutPath(root: string, folder: string, name?: string): string {
  return [root.replace(/[\\/]+$/, ""), folder, name].filter((part) => part).join("/");
}

/** The archives a Diablo II install ships, shared by every version: the `game` layer. */
export const GAME_ARCHIVES = [
  "d2data.mpq",
  "d2char.mpq",
  "d2sfx.mpq",
  "d2music.mpq",
  "d2speech.mpq",
  "d2video.mpq",
  "d2exp.mpq",
  "d2xmusic.mpq",
  "d2xtalk.mpq",
  "d2xvideo.mpq",
] as const;

export interface D2SELayout {
  root: string;
  /** D2SE_FOLDERS for a D2SE install, LIBRARY_FOLDERS for Exordium's library. */
  folders: LayoutFolders;
  library: boolean;
  /** Folder names under `D2SE\CORES`, e.g. `1.10f`, and the root's own 1.14 core when it has one. */
  cores: string[];
  /** The 1.14 core the root itself is (`1.14d`), from its `Game.exe`; null for an older root. */
  rootCore: string | null;
  /** Folder names under `MODS`. */
  mods: string[];
}

/** The install's layout, or `null` when `root` is not a D2SE install. */
export async function findD2SE(root: string): Promise<D2SELayout | null> {
  const has = async (path: string, dir: boolean) => {
    try {
      const info = await Deno.stat(`${root}/${path}`);
      return dir ? info.isDirectory : info.isFile;
    } catch {
      return false;
    }
  };
  const library = await has(LIBRARY_MARKER, false);
  if (!library && !(await has("D2SE.exe", false))) return null;
  const layout = library ? LIBRARY_FOLDERS : D2SE_FOLDERS;
  if (!(await has(layout.mods, true)) || !(await has(layout.cores, true))) return null;
  // `CORES` also collects D2SE's own folders ("Debug Logs"); a core is a version-named folder.
  const cores = (await folders(layoutPath(root, layout.cores))).filter((name) => CORE_NAME.test(name));
  // A 1.14 install is its own core; the library never is (its cores are all folders).
  const rootCore = library ? null : await rootCoreName(root);
  if (rootCore && !cores.some((name) => name.toLowerCase() === rootCore)) cores.push(rootCore);
  return { root, folders: layout, library, cores, rootCore, mods: await folders(layoutPath(root, layout.mods)) };
}

const CORE_NAME = /^\d+\.\d+[a-z]?$/i;

export type ProblemLevel = "error" | "warning";

export interface Problem {
  level: ProblemLevel;
  message: string;
}

export interface CoreImport {
  version: string;
  /** Relative to the root: `D2SE/CORES/1.10f` or `cores/1.10f`, or `""` for the root's own 1.14 core. */
  folder: string;
  /** 1.14 and later: the core is Blizzard's `Game.exe`, which the loader cannot become. */
  singleExe: boolean;
  scan: FolderScan;
}

export interface ModImport {
  folder: string;
  /** `null` when the mod has no `D2SE_SETUP.ini`, which D2SE itself refuses. */
  setup: ModSetup | null;
  scan: FolderScan;
  problems: Problem[];
}

export interface D2SEImport {
  layout: D2SELayout;
  launcher: LauncherSettings | null;
  game: ScannedFile[];
  /** `GAME_ARCHIVES` the root does not hold — the classic-only install lacks the expansion's. */
  missingGameArchives: string[];
  cores: CoreImport[];
  mods: ModImport[];
}

export interface ImportOptions extends ScanOptions {
  /** Only these cores (by version) and mods (by folder name); all when absent. */
  cores?: readonly string[];
  mods?: readonly string[];
}

export async function readD2SE(root: string, options: ImportOptions): Promise<D2SEImport | null> {
  const layout = await findD2SE(root);
  if (!layout) return null;
  const pick = (all: string[], wanted: readonly string[] | undefined) =>
    wanted ? all.filter((name) => wanted.some((w) => w.toLowerCase() === name.toLowerCase())) : all;

  const launcherText = layout.library ? null : await readText(`${root}/D2SE.ini`);
  // The game layer's files sit in the box's root whichever folder they come from: `path` stays as
  // scanned, `source` becomes relative to the root (`game/d2data.mpq` in the library).
  const gameDir = layoutPath(root, layout.folders.game);
  const fromRoot = (files: ScannedFile[]) =>
    layout.folders.game ? files.map((f) => ({ ...f, source: `${layout.folders.game}/${f.source}` })) : files;
  const archives = fromRoot(await scanNamed(gameDir, GAME_ARCHIVES, options));
  const present = new Set(archives.map((f) => f.path.toLowerCase()));
  // No PlugY from the install (D2SE's "PlugY folder" fallback): a mod that wants PlugY ships it, and
  // Exordium loads the mod's copy (2026-10-14).
  const wrappers = fromRoot(await scanNamed(gameDir, [...RENDERER_WRAPPERS, ...INSTALL_FILES], options));
  const game = [...archives, ...wrappers];

  const cores: CoreImport[] = [];
  for (const version of pick(layout.cores, options.cores)) {
    if (version === layout.rootCore) {
      cores.push({ version, folder: "", singleExe: true, scan: await scanRootCore(root, options) });
    } else {
      const folder = layoutPath("", layout.folders.cores, version);
      cores.push({ version, folder, singleExe: false, scan: await scanFolder(`${root}/${folder}`, "core", options) });
    }
  }
  const coreScan = (version: string | null | undefined) =>
    version ? cores.find((c) => c.version.toLowerCase() === version.toLowerCase())?.scan ?? null : null;

  const mods: ModImport[] = [];
  for (const folder of pick(layout.mods, options.mods)) {
    const dir = layoutPath(root, layout.folders.mods, folder);
    const setupText = await readText(`${dir}/D2SE_SETUP.ini`);
    const setup = setupText === null ? null : readModSetup(parseIni(setupText));
    const scan = await scanFolder(dir, "mod", options);
    mods.push({ folder, setup, scan, problems: modProblems(setup, scan, layout.cores, coreScan(setup?.mod.core)) });
  }

  return {
    layout,
    launcher: launcherText === null ? null : readLauncherSettings(parseIni(launcherText)),
    game,
    missingGameArchives: GAME_ARCHIVES.filter((name) => !present.has(name)),
    cores,
    mods,
  };
}

/**
 * What would stop a mod running, or make it run differently from D2SE. Exordium replicates what
 * D2SE loads (vault: `Projects/Exordium/Architecture/Launcher.md`), so a file the setup names but
 * neither the mod nor its core has is a mod that D2SE itself would have failed on.
 *
 * `core` is the scan of the mod's core, when it was read: D2SE looks in the mod folder first and
 * the core second, for files and for language folders alike. Without it, only the mod is checked.
 */
export function modProblems(
  setup: ModSetup | null,
  scan: FolderScan,
  cores: readonly string[],
  core: FolderScan | null = null,
): Problem[] {
  const problems: Problem[] = [];
  if (!setup) {
    return [{ level: "error", message: "No D2SE_SETUP.ini: the mod does not say which core it needs." }];
  }
  if (!setup.intact) {
    problems.push({
      level: "warning",
      message: "D2SE_SETUP.ini lacks D2SE's endoffile=4711 marker; D2SE would call it corrupt.",
    });
  }
  const version = setup.mod.core;
  if (!version) problems.push({ level: "error", message: "D2SE_SETUP.ini sets no D2Core." });
  else if (!cores.some((c) => c.toLowerCase() === version.toLowerCase())) {
    problems.push({ level: "error", message: `Needs core ${version}, which this install does not have.` });
  }

  const shipped = new Set([...scan.layer, ...(core?.layer ?? [])].map((f) => f.path.toLowerCase()));
  const need = (file: string, why: string) => {
    if (!shipped.has(file.replace(/\\/g, "/").toLowerCase())) {
      const where = core ? "neither the mod nor its core has" : "the mod folder does not have";
      problems.push({ level: "error", message: `${why} names ${file}, which ${where}.` });
    }
  };
  setup.loads.mpqs.forEach((mpq, i) => need(mpq, `ModMPQ${i + 1}`));
  setup.loads.dlls.forEach((dll, i) => need(dll, `ModDll${i + 1}`));
  if (setup.loads.d2mod) need("D2Mod.dll", "ModUseD2Mod");

  // `Language=MOD` means the mod's own files, with no language folder applied.
  const language = setup.player.language?.toUpperCase();
  if (language && language !== "MOD") {
    const available = new Set([...Object.keys(scan.languages), ...Object.keys(core?.languages ?? {})]);
    if (!available.has(language)) {
      problems.push({
        level: "warning",
        message:
          `Language ${language} is selected, but neither the mod nor its core has a Language_${language} folder.`,
      });
    }
  }
  for (const system of ["nefex", "d2extra"] as const) {
    if (setup.loads[system]) {
      problems.push({ level: "warning", message: `Uses ${system}, which Exordium's loader does not load yet.` });
    }
  }
  return problems;
}

/**
 * The root's 1.14 core: only its own files (`SINGLE_EXE_CORE_FILES`), never the root's leftover
 * pre-1.14 DLLs, which 1.14's `Game.exe` does not load. Its saves are the root's `save` folder, as a
 * D2SE core's are its own.
 */
async function scanRootCore(root: string, options: ImportOptions): Promise<FolderScan> {
  const layer = await scanNamed(root, SINGLE_EXE_CORE_FILES, options);
  const writable = await scanTree(root, "save", { ...options, hash: options.hash && (options.hashWritable ?? true) });
  const bytes = layer.reduce((sum, file) => sum + file.size, 0);
  return {
    root,
    kind: "core",
    layer,
    writable,
    languages: {},
    excluded: [],
    folders: [{ name: "", files: layer.length, bytes }],
    bytes,
    hashed: 0,
    data: null,
  };
}

/** A mod folder's `D2SE_SETUP.ini`, read; `null` when it has none. */
export async function readSetupFile(modFolder: string): Promise<ModSetup | null> {
  const text = await readText(`${modFolder}/D2SE_SETUP.ini`);
  return text === null ? null : readModSetup(parseIni(text));
}

async function folders(path: string): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(path)) if (entry.isDirectory) names.push(entry.name);
  return names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

async function readText(path: string): Promise<string | null> {
  try {
    return decodeIni(await Deno.readFile(path));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}
