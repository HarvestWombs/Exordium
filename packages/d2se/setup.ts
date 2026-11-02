/**
 * `D2SE_SETUP.ini`, typed — and `D2SE.ini`, the launcher's own.
 *
 * A mod's setup file is more than a core version. D2SE *loads* things on the mod's behalf, and
 * this file is the only record of what: D2Mod.dll and the other mod systems, up to three extra
 * MPQs above `patch_d2.mpq`, a language folder, PlugY. Plain `Game.exe` does none of that, which
 * is why Exordium runs its own loader (vault: `Projects/Exordium/Decisions/A Profile Is a Box of
 * Layers.md`) and why every field here is kept.
 *
 * Defaults are the ones the file's own comments state (`default=3`, `default=0` …). The file has
 * two halves: `[USERSETTINGS]`, the player's checkboxes, and `[Protected]`, the modder's settings.
 */

import { type Ini, iniFlag, iniNumber, iniText } from "./ini.ts";

export type Renderer = "ddraw" | "d3d" | "opengl" | "glide";

const RENDERERS: Record<number, Renderer> = { 0: "ddraw", 1: "d3d", 2: "opengl", 3: "glide" };

export interface ModSetup {
  /** The D2SE version that wrote it: `2.2.0`. */
  createdFor: string | null;
  /** Whether the file ends with D2SE's integrity marker. */
  intact: boolean;

  /** `[USERSETTINGS]` — the player's own choices. */
  player: {
    renderer: Renderer;
    /** The raw number, kept when it is not one D2SE documents. */
    rendererCode: number;
    windowed: boolean;
    noSound: boolean;
    hardcore: boolean;
    plugY: boolean;
    direct: boolean;
    txt: boolean;
    language: string | null;
    skipToBNet?: boolean;
    seed?: string | null;
    startAct?: 1 | 2 | 3 | 4 | 5 | null;
    perspective?: boolean;
    lowQuality?: boolean;
    gamma?: number | null;
    vsync?: boolean;
    noCompress?: boolean;
    noFixAspect?: boolean;
    backgroundSound?: boolean;
  };

  /** `[Protected]` — the modder's settings. */
  mod: {
    /** `D2Core`: the version the mod needs, `1.10f`. D2SE refuses a mod without it. */
    core: string | null;
    name: string | null;
    title: string | null;
    /** `ModMajorVersion` + `ModMinorVersion` + `ModRevision`, as D2SE shows them: `1.0.0`. */
    version: string | null;
    banner: string | null;
    readme: string | null;
    description: string | null;
    homepage: string | null;
    board: string | null;
    /** Whether the player may choose `-direct` / `-txt` themselves. */
    modable: boolean;
    forceDirect: boolean;
    forceTxt: boolean;
    allowHardcore: boolean;
    allowSinglePlayerMultistart: boolean;
    allowPlugY: boolean;
  };

  /** What D2SE loads into the game on the mod's behalf. */
  loads: {
    nefex: boolean;
    d2mod: boolean;
    d2extra: boolean;
    /** `ModDll1`, `ModDll2` …, in order. */
    dlls: string[];
    /** Whether `patch_d2.mpq` is loaded at all. */
    patchD2: boolean;
    /** `ModMPQ1`, `ModMPQ2` …, lowest priority first; all above `patch_d2.mpq`. No limit. */
    mpqs: string[];
  };

  /** A private realm the mod plays on, or `null` when none is set. */
  realm: {
    gateway: string | null;
    timezone: string | null;
    gatewayName: string | null;
    selected: string | null;
    port: string | null;
  } | null;
}

const U = "USERSETTINGS";
const P = "Protected";

export function readModSetup(ini: Ini): ModSetup {
  const rendererCode = iniNumber(ini, U, "Renderer") ?? 3;
  const version = [
    iniText(ini, P, "ModMajorVersion"),
    iniText(ini, P, "ModMinorVersion"),
    iniText(ini, P, "ModRevision"),
  ]
    .filter((part): part is string => part !== null)
    .join("");

  const dlls: string[] = [];
  for (let i = 1; i < 100; i++) {
    const dll = iniText(ini, P, `ModDll${i}`);
    if (dll === null) break;
    dlls.push(dll);
  }
  // D2SE defines ModMPQ1..3; any further ModMPQ<n> keys are read too, in number order. A gap is
  // skipped, as before: ModMPQ1 and ModMPQ3 without ModMPQ2 are both loaded.
  const mpqs: string[] = [];
  for (let i = 1; i < 100; i++) {
    const mpq = iniText(ini, P, `ModMPQ${i}`);
    if (mpq !== null) mpqs.push(mpq);
  }

  const realm = {
    gateway: iniText(ini, P, "RealmGateway"),
    timezone: iniText(ini, P, "RealmTimezone"),
    gatewayName: iniText(ini, P, "RealmGatewayName"),
    selected: iniText(ini, P, "RealmSelected"),
    port: iniText(ini, P, "RealmPort"),
  };

  return {
    createdFor: iniText(ini, "D2SE", "CreatedFor"),
    intact: ini.intact,
    player: {
      renderer: RENDERERS[rendererCode] ?? "glide",
      rendererCode,
      windowed: iniFlag(ini, U, "WindowMode", false),
      noSound: iniFlag(ini, U, "NoSound", false),
      hardcore: iniFlag(ini, U, "EnableHC", true),
      // D2SE reads it with a default of 1 (D2SE.exe 0x40E225).
      plugY: iniFlag(ini, U, "EnablePlugY", true),
      direct: iniFlag(ini, U, "Direct", false),
      txt: iniFlag(ini, U, "Txt", false),
      language: iniText(ini, U, "Language"),
    },
    mod: {
      core: iniText(ini, P, "D2Core"),
      name: iniText(ini, P, "ModName"),
      title: iniText(ini, P, "ModTitle"),
      version: version === "" ? null : version,
      banner: iniText(ini, P, "ModBanner"),
      readme: iniText(ini, P, "ModReadme"),
      description: iniText(ini, P, "ModDescription"),
      homepage: iniText(ini, P, "ModHP"),
      board: iniText(ini, P, "ModBoard"),
      modable: iniFlag(ini, P, "Modable", false),
      // Only forced when explicitly written. The stock D2SE template comments these keys out; treating
      // comments as enabled makes table compiles look for loose txt files many MPQ-only mods do not ship.
      forceDirect: iniFlag(ini, P, "ModForceDirect", false),
      forceTxt: iniFlag(ini, P, "ModForceTxt", false),
      allowHardcore: iniFlag(ini, P, "ModAllowHC", true),
      allowSinglePlayerMultistart: iniFlag(ini, P, "ModAllowSPFeature", false),
      allowPlugY: iniFlag(ini, P, "ModAllowPlugY", false),
    },
    loads: {
      nefex: iniFlag(ini, P, "ModUseNefex", false),
      d2mod: iniFlag(ini, P, "ModUseD2Mod", false),
      d2extra: iniFlag(ini, P, "ModUseD2Extra", false),
      dlls,
      patchD2: iniFlag(ini, P, "ModUsePatch_D2", true),
      mpqs,
    },
    realm: Object.values(realm).some((v) => v !== null) ? realm : null,
  };
}

/** How the game should actually start, once the player's choices meet the modder's permissions. */
export interface LaunchSettings {
  renderer: Renderer;
  windowed: boolean;
  noSound: boolean;
  /** `-direct`: read loose files from `data\` before the MPQs. */
  direct: boolean;
  /** `-txt`: compile `.txt` tables at startup rather than reading `.bin`. */
  txt: boolean;
  hardcore: boolean;
  plugY: boolean;
  language: string | null;
  skipToBNet: boolean;
  seed: string | null;
  startAct: 1 | 2 | 3 | 4 | 5 | null;
  /** `-per`: perspective, on the Glide, OpenGL and Direct3D renderers. */
  perspective: boolean;
  /** `-lq`: low quality. */
  lowQuality: boolean;
  /** `-gamma N`: the game's own default is 155. */
  gamma: number | null;
  /** `-vsync`. */
  vsync: boolean;
  /** `-nocompress`: keep sprites uncompressed in memory. */
  noCompress: boolean;
  /** `-nofixaspect`: 1.13 and later. */
  noFixAspect: boolean;
  /** `-sndbkg`: keep the sound playing behind other windows. 1.13 and later. */
  backgroundSound: boolean;
}

/**
 * D2SE's own rules, read from D2SE.exe (0x40E1A3 reads the setup, 0x40D605 builds the flags):
 * - `-direct` is on when the mod is `Modable` and the player ticked Direct, **or when PlugY is on**,
 *   or when the mod is not `Modable` and writes `ModForceDirect=1`. PlugY reads its images loose
 *   from disk, and mods that ship PlugY rely on this: Synthesis's D2Tweaks reads interface XML that
 *   exists only loose, and without `-direct` it corrupts Storm's open-file list and crashes on
 *   entering a game.
 * - `-txt` is on when the mod is `Modable` and the player ticked Txt, or when the mod is not
 *   `Modable` and writes `ModForceTxt=1`.
 * - Hardcore and PlugY need both the modder's permission and the player's checkbox.
 */
export function launchSettings(setup: ModSetup): LaunchSettings {
  const { player, mod } = setup;
  return {
    renderer: player.renderer,
    windowed: player.windowed,
    noSound: player.noSound,
    direct: (mod.modable ? player.direct : mod.forceDirect) || (mod.allowPlugY && player.plugY),
    txt: mod.modable ? player.txt : mod.forceTxt,
    hardcore: mod.allowHardcore && player.hardcore,
    plugY: mod.allowPlugY && player.plugY,
    language: player.language,
    skipToBNet: player.skipToBNet ?? false,
    seed: player.seed ?? null,
    startAct: player.startAct ?? null,
    perspective: player.perspective ?? false,
    lowQuality: player.lowQuality ?? false,
    gamma: player.gamma ?? null,
    vsync: player.vsync ?? false,
    noCompress: player.noCompress ?? false,
    noFixAspect: player.noFixAspect ?? false,
    backgroundSound: player.backgroundSound ?? false,
  };
}

/** `D2SE.ini`: which mod D2SE last ran, and the command line it gives the unmodded game. */
export interface LauncherSettings {
  createdFor: string | null;
  intact: boolean;
  activeFolder: string | null;
  commandLine: string | null;
}

export function readLauncherSettings(ini: Ini): LauncherSettings {
  return {
    createdFor: iniText(ini, "D2SE", "CreatedFor"),
    intact: ini.intact,
    activeFolder: iniText(ini, U, "ActiveFolder"),
    commandLine: iniText(ini, U, "D2CMDLine"),
  };
}
