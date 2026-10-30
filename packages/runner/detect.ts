import type { Runner, RunnerKind, RunnerSource } from "./types.ts";

/** The filesystem as detection sees it, injected so tests need no Wine installed. */
export interface DetectFs {
  /** Folder names directly inside `path`, or [] when it is missing. */
  dirs(path: string): string[];
  /** Whether `path` is a file (links followed). */
  isFile(path: string): boolean;
  /** The file's text, or null when it is missing. */
  readText(path: string): string | null;
}

export interface DetectEnv {
  HOME?: string | undefined;
  PATH?: string | undefined;
  XDG_DATA_HOME?: string | undefined;
  XDG_CONFIG_HOME?: string | undefined;
}

function make(kind: RunnerKind, source: RunnerSource, label: string, program: string): Runner {
  return { id: `${source}:${program}`, kind, source, label, program, protonPath: null };
}

/** A Wine build folder's binary: `bin/wine`, which on WoW64 builds runs 32-bit programs too. */
function wineIn(fs: DetectFs, folder: string): string | null {
  for (const name of ["bin/wine", "bin/wine64"]) {
    if (fs.isFile(`${folder}/${name}`)) return `${folder}/${name}`;
  }
  return null;
}

/** Proton keeps its Wine in `files/` (5.13 and later) or `dist/` (earlier). */
function protonWineIn(fs: DetectFs, folder: string): string | null {
  for (const dir of ["files", "dist"]) {
    const wine = wineIn(fs, `${folder}/${dir}`);
    if (wine) return wine;
  }
  return null;
}

function onPath(fs: DetectFs, env: DetectEnv, name: string): string | null {
  for (const dir of (env.PATH ?? "").split(":").filter(Boolean)) {
    if (fs.isFile(`${dir}/${name}`)) return `${dir}/${name}`;
  }
  return null;
}

/** Every Steam library: the default one, and those `libraryfolders.vdf` lists. */
function steamLibraries(fs: DetectFs, home: string, data: string): string[] {
  const roots = [`${home}/.steam/steam`, `${data}/Steam`, `${home}/.var/app/com.valvesoftware.Steam/data/Steam`];
  const libraries = new Set<string>();
  for (const root of roots) {
    const vdf = fs.readText(`${root}/steamapps/libraryfolders.vdf`);
    if (vdf === null) continue;
    libraries.add(root);
    for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(match[1]!.replace(/\\\\/g, "\\"));
  }
  return [...libraries];
}

/**
 * Every runner on this machine, in the order a default is picked: system Wine first (the one the
 * user installed on purpose), then the launchers' Wine builds, then Proton, then umu-run. Duplicates
 * (the same binary reached twice, as Steam's `~/.steam/steam` usually links `~/.local/share/Steam`)
 * are dropped by path.
 */
export function detectRunners(fs: DetectFs, env: DetectEnv): Runner[] {
  const home = env.HOME ?? "";
  const data = env.XDG_DATA_HOME || `${home}/.local/share`;
  const config = env.XDG_CONFIG_HOME || `${home}/.config`;
  const found: Runner[] = [];

  const system = onPath(fs, env, "wine") ?? onPath(fs, env, "wine64");
  if (system) found.push(make("wine", "system", "System Wine", system));

  const builds = (source: RunnerSource, parent: string, kind: RunnerKind = "wine") => {
    for (const name of fs.dirs(parent).sort()) {
      const wine = kind === "proton" ? protonWineIn(fs, `${parent}/${name}`) : wineIn(fs, `${parent}/${name}`);
      if (wine) found.push(make(kind, source, name, wine));
    }
  };
  builds("lutris", `${data}/lutris/runners/wine`);
  builds("lutris", `${data}/lutris/runners/proton`, "proton");
  builds("bottles", `${data}/bottles/runners`);
  builds("bottles", `${home}/.var/app/com.usebottles.bottles/data/bottles/runners`);
  for (const heroic of [`${config}/heroic`, `${home}/.var/app/com.heroicgameslauncher.hgl/config/heroic`]) {
    builds("heroic", `${heroic}/tools/wine`);
    builds("heroic", `${heroic}/tools/proton`, "proton");
  }
  for (const library of steamLibraries(fs, home, data)) {
    for (const name of fs.dirs(`${library}/steamapps/common`).filter((n) => n.startsWith("Proton")).sort()) {
      const wine = protonWineIn(fs, `${library}/steamapps/common/${name}`);
      if (wine) found.push(make("proton", "steam", name, wine));
    }
  }
  for (const root of [`${home}/.steam/root`, `${data}/Steam`]) {
    builds("steam", `${root}/compatibilitytools.d`, "proton");
  }

  const umu = onPath(fs, env, "umu-run");
  if (umu) found.push(make("umu", "system", "umu-run", umu));

  const seen = new Set<string>();
  return found.filter((runner) => !seen.has(runner.program) && !!seen.add(runner.program));
}

/** A path the user typed: a Wine binary, a build or Proton folder, or umu-run. */
export function customRunner(fs: DetectFs, path: string): Runner | null {
  const clean = path.replace(/\/+$/, "");
  if (/(^|\/)umu-run$/.test(clean) && fs.isFile(clean)) return make("umu", "custom", "umu-run", clean);
  const label = clean.split("/").pop() ?? clean;
  if (fs.isFile(clean)) return make("wine", "custom", label, clean);
  const proton = protonWineIn(fs, clean);
  if (proton) return make("proton", "custom", label, proton);
  const wine = wineIn(fs, clean);
  return wine ? make("wine", "custom", label, wine) : null;
}

/**
 * The runner `choice` names (a runner id, or a custom path), else the first detected; null when
 * there is none at all.
 */
export function pickRunner(fs: DetectFs, runners: readonly Runner[], choice: string): Runner | null {
  const wanted = choice.trim();
  if (!wanted) return runners[0] ?? null;
  return runners.find((runner) => runner.id === wanted) ?? customRunner(fs, wanted) ?? runners[0] ?? null;
}

/** The real filesystem, for the app. */
export const denoFs: DetectFs = {
  dirs(path) {
    try {
      return [...Deno.readDirSync(path)].filter((e) => e.isDirectory || e.isSymlink).map((e) => e.name);
    } catch {
      return [];
    }
  },
  isFile(path) {
    try {
      return Deno.statSync(path).isFile;
    } catch {
      return false;
    }
  },
  readText(path) {
    try {
      return Deno.readTextFileSync(path);
    } catch {
      return null;
    }
  },
};
