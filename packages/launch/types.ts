/**
 * The native loader's input, as plain data.
 *
 * Vault: `Projects/Exordium/Architecture/Launcher.md`. This mirrors the parts of D2SE's
 * `FUN_0040d390` that decide what must be visible and loaded before the game loop starts.
 */

import type { LaunchSettings, Renderer } from "@exordium/d2se";
import type { FileVersion } from "./game-exe.ts";

export type ArchiveKind = "classic" | "expansion" | "patch" | "mod" | "language";

export interface ArchiveLoad {
  kind: ArchiveKind;
  /** The archive name from D2SE's load order, using the setup file spelling for custom MPQs. */
  path: string;
  /** D2SE's priority value passed to its MPQ opener. Higher wins. */
  priority: number;
  required: boolean;
}

export type PluginKind = "plugy" | "d2mod" | "d2extra" | "nefex" | "custom";

export interface PluginLoad {
  kind: PluginKind;
  path: string;
  required: boolean;
  /** Export name or ordinal D2SE calls after loading, when known. */
  init: string | number | null;
  /** Export name or ordinal D2SE calls while unloading, when known. */
  release: string | number | null;
}

export interface LoaderSettings extends LaunchSettings {
  renderer: Renderer;
}

export interface LaunchProblem {
  level: "error" | "warning";
  message: string;
}

export interface LoaderPlan {
  settings: LoaderSettings;
  /**
   * Whether the game may reach Battle.net. True when the mod declares a custom realm or the player
   * turned the lockdown off; otherwise
   * the loader greys the main-menu Battle.net button and blocks the connect, so Exordium is never a
   * way onto official Battle.net. See battlenetAllowed in @exordium/launch.
   */
  battlenetAllowed: boolean;
  /** The game's command line, as `Game.exe` would be given it; see `gameCommandLine`. */
  commandLine: string;
  /**
   * What Game.exe hands `FOG_InitErrorMgr` as its version: `v<major>.<minor>` of the core, so
   * `1.10f` is `v1.10`. Null when the setup names no core the loader can read.
   */
  gameVersion: string | null;
  /**
   * The core as mods name it (`1.13d`): what tells the loader which export ordinals the core's DLLs
   * use, since 1.11 and 1.11b, or 1.13c and 1.13d, share a `gameVersion` but not their ordinals.
   */
  core: string | null;
  /** The file version the box's `Game.exe` (the loader) is stamped with; null when not known. */
  gameExeVersion: FileVersion | null;
  /** A 1.14 core: the box keeps Blizzard's own `Game.exe`; the loader cannot become this game. */
  singleExe: boolean;
  /**
   * A core that still needs Blizzard's own `Game.exe` for now. Kept for architecture edges; release
   * builds should prefer `exordium-game.exe` over remote injection.
   */
  nativeGameExe: boolean;
  archives: ArchiveLoad[];
  plugins: PluginLoad[];
  /** Core game DLLs D2SE refuses to continue without before entering D2Launch; none for 1.14. */
  gameDlls: string[];
  problems: LaunchProblem[];
}

export class LaunchError extends Error {
  override name = "LaunchError";
}
