/**
 * Reading a whole D2SE install: the launcher's settings, the install's own archives, every core
 * and every mod, with the problems that would stop a mod running. Read-only throughout.
 *
 * A D2SE root is recognised without guessing: `D2SE.exe` beside `D2SE.ini` and a `MODS` folder,
 * with `D2SE\CORES\<version>\` inside. Cores hold one version's DLLs and `patch_d2.mpq`; the large
 * archives every version shares (`d2data.mpq` …) sit in the root, and become the `game` layer.
 */

import { decodeIni, parseIni } from "./ini.ts";
import { type LauncherSettings, type ModSetup, readLauncherSettings, readModSetup } from "./setup.ts";
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
 */
export const INSTALL_FILES = ["d2.lng", "ijl11.dll", "binkw32.dll", "smackw32.dll"] as const;

/** The install's PlugY folder, which D2SE falls back to for PlugY.dll; see `readD2SE`. */
export const PLUGY_FOLDER = "PlugY";

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
  /** Folder names under `D2SE\CORES`, e.g. `1.10f`. */
  cores: string[];
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
  if (!(await has("D2SE.exe", false)) || !(await has("MODS", true)) || !(await has("D2SE/CORES", true))) return null;
  // `CORES` also collects D2SE's own folders ("Debug Logs"); a core is a version-named folder.
  const cores = (await folders(`${root}/D2SE/CORES`)).filter((name) => CORE_NAME.test(name));
  return { root, cores, mods: await folders(`${root}/MODS`) };
}

const CORE_NAME = /^\d+\.\d+[a-z]?$/i;

export type ProblemLevel = "error" | "warning";

export interface Problem {
  level: ProblemLevel;
  message: string;
}

export interface CoreImport {
  version: string;
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

  const launcherText = await readText(`${root}/D2SE.ini`);
  const archives = await scanNamed(root, GAME_ARCHIVES, options);
  const present = new Set(archives.map((f) => f.path.toLowerCase()));
  // D2SE's "PlugY folder for a proper installed PlugY.dll": the PlugY a core without its own copy
  // loads, and the folder PlugY reads its images from. It belongs with the install, so to the game layer.
  const wrappers = await scanNamed(root, [...RENDERER_WRAPPERS, ...INSTALL_FILES], options);
  const game = [...archives, ...wrappers, ...await scanTree(root, PLUGY_FOLDER, options)];

  const cores: CoreImport[] = [];
  for (const version of pick(layout.cores, options.cores)) {
    cores.push({ version, scan: await scanFolder(`${root}/D2SE/CORES/${version}`, "core", options) });
  }
  const coreScan = (version: string | null | undefined) =>
    version ? cores.find((c) => c.version.toLowerCase() === version.toLowerCase())?.scan ?? null : null;

  const mods: ModImport[] = [];
  for (const folder of pick(layout.mods, options.mods)) {
    const dir = `${root}/MODS/${folder}`;
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
  if (setup.loads.d2se && setup.loads.d2seDll) need(setup.loads.d2seDll, "ModUseD2SE");

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
  for (const system of ["nefex", "d2extra", "d2seUtility"] as const) {
    if (setup.loads[system]) {
      problems.push({ level: "warning", message: `Uses ${system}, which Exordium's loader does not load yet.` });
    }
  }
  return problems;
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
