import { isSingleExeCore, launchSettings, type ModSetup } from "@exordium/d2se";
import type { Plan } from "@exordium/layers";
import { gameExeVersion } from "./game-exe.ts";
import type { ArchiveLoad, LaunchProblem, LoaderPlan, LoaderSettings, PluginLoad } from "./types.ts";

const CLASSIC_ARCHIVES = ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"];
const EXPANSION_ARCHIVES = ["d2exp.mpq", "d2Xmusic.mpq", "d2Xtalk.mpq", "d2Xvideo.mpq"];
const GAME_DLLS = ["D2Launch.dll", "D2Client.dll", "D2Multi.dll"];

/**
 * Plugin systems built only for the pre-1.14 DLLs. 1.14 folded those DLLs into Game.exe, so a plugin
 * that patches D2Client.dll and the rest has nothing to patch there.
 */
const PRE_114_PLUGINS: Partial<Record<PluginLoad["kind"], string>> = {
  d2mod: "D2Mod",
  nefex: "Nefex",
  d2extra: "D2Extra",
  d2seUtility: "D2SE Utility",
  d2seMod: "A D2SE mod DLL",
};

export interface BuildLoaderPlanOptions {
  /**
   * Whether expansion archives are required. D2SE uses the expansion flag returned by game setup;
   * Exordium defaults to the common Lord of Destruction path.
   */
  expansion?: boolean;
}

/**
 * Battle.net is allowed only when the mod declares a custom realm with a server address. A mod with
 * no realm (the usual case) must not connect to official Battle.net through Exordium's loader, so the
 * loader greys the main-menu Battle.net button and blocks the connect. The gateway address is what a
 * realm needs: a realm object without one does not count.
 */
export function battlenetAllowed(setup: ModSetup): boolean {
  return (setup.realm?.gateway ?? "").trim().length > 0;
}

export function buildLoaderPlan(
  plan: Plan,
  setup: ModSetup,
  options: BuildLoaderPlanOptions = {},
): LoaderPlan {
  const files = new Set(plan.files.map((file) => file.path.toLowerCase()));
  const problems: LaunchProblem[] = [];
  const has = (path: string) => files.has(path.replace(/\\/g, "/").toLowerCase());
  const need = (path: string, why: string) => {
    if (!has(path)) problems.push({ level: "error", message: `${why} needs ${path}, which is not in the box.` });
  };

  // 1.14 and later: Blizzard's own Game.exe is the game; see exe-version.ts in @exordium/d2se.
  const singleExe = isSingleExeCore(setup.mod.core);
  const nativeGameExe = false;
  const archives: ArchiveLoad[] = [];
  for (const path of CLASSIC_ARCHIVES) archives.push({ kind: "classic", path, priority: 1000, required: true });
  if (options.expansion ?? true) {
    for (const path of EXPANSION_ARCHIVES) archives.push({ kind: "expansion", path, priority: 3000, required: true });
  }
  if (setup.loads.patchD2) {
    // 1.00 (Diablo II) and 1.07 (Lord of Destruction) are the base releases, with no patch to load:
    // the catalog ships them a 0-byte placeholder and a D2SE install has none (ModUsePatch_D2=0).
    const core = setup.mod.core?.trim().toLowerCase();
    const required = core !== "1.00" && core !== "1.07";
    archives.push({ kind: "patch", path: "patch_d2.mpq", priority: 5000, required });
  }

  // The mod's MPQs, each above the last, as many as it lists (D2SE stops at three).
  const mpqs = setup.loads.mpqs;
  mpqs.forEach((path, i) => archives.push({ kind: "mod", path, priority: 6000 + i * 1000, required: true }));

  // The language MPQ always last, above every mod MPQ: it is the player's language choice, and a mod's
  // own pack carries its text tables for that language, whichever MPQ holds the default ones. (D2SE
  // put it between ModMPQ1 and ModMPQ2.)
  const language = setup.player.language?.toUpperCase() ?? null;
  if (language && language !== "MOD") {
    archives.push({ kind: "language", path: `${language}.mpq`, priority: 6000 + mpqs.length * 1000, required: true });
  }

  // An optional archive (a base release's patch_d2.mpq) is loaded when it is there; the loader skips it
  // otherwise, so only the required ones have to be in the box.
  for (const archive of archives) if (archive.required) need(archive.path, `${archive.kind} archive load`);

  const settings = launchSettings(setup);
  const plugins: PluginLoad[] = [];
  if (settings.plugY) {
    // D2SE's order: a PlugY.dll the mod or core carries (the layers already put the mod's first), else
    // the install's PlugY folder.
    const path = !has("PlugY.dll") && has("PlugY/PlugY.dll") ? "PlugY/PlugY.dll" : "PlugY.dll";
    plugins.push({ kind: "plugy", path, required: true, init: "_Init@4", release: "_Release@0" });
  }
  if (setup.loads.d2mod) {
    plugins.push({ kind: "d2mod", path: "D2Mod.dll", required: true, init: 10000, release: 10001 });
  }
  if (setup.loads.nefex) plugins.push({ kind: "nefex", path: "Nefex.dll", required: true, init: null, release: null });
  if (setup.loads.d2extra) {
    plugins.push({ kind: "d2extra", path: "D2Extra.dll", required: true, init: null, release: null });
  }
  for (const dll of setup.loads.dlls) {
    plugins.push({ kind: "custom", path: dll, required: true, init: null, release: null });
  }
  if (setup.loads.d2seUtility) {
    plugins.push({ kind: "d2seUtility", path: "D2SE_Utility.dll", required: true, init: 10000, release: 10001 });
  }
  if (setup.loads.d2se && setup.loads.d2seDll) {
    plugins.push({ kind: "d2seMod", path: setup.loads.d2seDll, required: true, init: 2, release: "ModRelease" });
  }

  if (singleExe) {
    need("Game.exe", `core ${setup.mod.core}`);
    for (const plugin of plugins) {
      const name = PRE_114_PLUGINS[plugin.kind];
      if (name) {
        problems.push({
          level: "error",
          message: `${name} is built for the pre-1.14 game DLLs; core ${setup.mod.core} has none for it to load into.`,
        });
      }
    }
    if (archives.some((archive) => archive.kind === "mod" || archive.kind === "language")) {
      problems.push({
        level: "error",
        message:
          `Custom mod and language MPQs are not supported yet on core ${setup.mod.core}; it runs through Blizzard's single Game.exe.`,
      });
    }
  } else if (nativeGameExe) {
    need("Game.exe", `core ${setup.mod.core}`);
    for (const plugin of plugins) {
      problems.push({
        level: "error",
        message:
          `${plugin.kind} plugins are not supported yet on core ${setup.mod.core}; it runs through its original Game.exe.`,
      });
    }
    if (archives.some((archive) => archive.kind === "mod" || archive.kind === "language")) {
      problems.push({
        level: "error",
        message:
          `Custom mod and language MPQs are not supported yet on core ${setup.mod.core}; it runs through its original Game.exe.`,
      });
    }
  } else {
    for (const dll of GAME_DLLS) need(dll, "game DLL handoff");
  }
  for (const plugin of plugins) need(plugin.path, `${plugin.kind} plugin load`);

  const exeVersion = gameExeVersion(setup.mod.core);
  if (!exeVersion && !singleExe) {
    problems.push({
      level: "warning",
      message: `The Game.exe version of core ${setup.mod.core ?? "(none)"} is not known; ` +
        "plugins that check it, such as D2GL, will refuse to start.",
    });
  }

  return {
    settings,
    battlenetAllowed: battlenetAllowed(setup),
    commandLine: gameCommandLine(settings),
    gameVersion: gameVersion(setup.mod.core),
    core: setup.mod.core?.trim().toLowerCase() || null,
    gameExeVersion: exeVersion,
    singleExe,
    nativeGameExe,
    archives,
    plugins,
    gameDlls: singleExe || nativeGameExe ? [] : GAME_DLLS,
    problems,
  };
}

/**
 * The game's command line, from the player's D2SE settings. The renderer is always explicit, so the
 * registry's `VideoConfig\Render` is never consulted. `WindowMode` means `-w` only for DirectDraw
 * (the game's own GDI window). With Glide the window belongs to the wrapper, which is configured on
 * its own terms; D2GL refuses to start when `-w` is passed at all. D3D and OpenGL have no windowed
 * mode in these versions, as D2SE_SETUP.ini's own comment says.
 */
export function gameCommandLine(settings: LoaderSettings): string {
  const renderer = { ddraw: "", d3d: "-d3d", opengl: "-opengl", glide: "-3dfx" }[settings.renderer];
  return [
    renderer,
    settings.renderer === "ddraw" && settings.windowed ? "-w" : "",
    settings.noSound ? "-ns" : "",
    settings.direct ? "-direct" : "",
    settings.txt ? "-txt" : "",
    settings.skipToBNet ? "-skiptobnet" : "",
    settings.startAct ? `-act${settings.startAct}` : "",
    settings.seed ? `-seed ${settings.seed}` : "",
  ].filter(Boolean).join(" ");
}

/** `1.10f` as Game.exe spells its own version for Fog: `v1.10`. */
export function gameVersion(core: string | null | undefined): string | null {
  const match = core?.trim().match(/^(\d+)\.(\d+)/);
  return match ? `v${match[1]}.${match[2]}` : null;
}
