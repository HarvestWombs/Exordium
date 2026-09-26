/**
 * The loader as the box's `Game.exe`.
 *
 * Plugins identify the game by the file version of `game.exe` — D2GL calls
 * `GetFileVersionInfoSizeA("game.exe")` and refuses to start on an unknown one. Pre-1.14 cores
 * carry no `Game.exe` (D2SE never needed one), so the box gets the loader under that name, and
 * the loader's `--stamp` writes this version into it, with the title's name and icon. Vault:
 * `Shared/Diablo-II/Process Startup.md`.
 */

export type FileVersion = readonly [number, number, number, number];

/**
 * Blizzard's `Game.exe` file version per core. Only versions confirmed in D2GL's own detection
 * table are listed; 1.07, 1.08 and 1.09b are not known, and are left unstamped rather than guessed.
 */
const GAME_EXE_VERSIONS: Readonly<Record<string, FileVersion>> = {
  "1.09d": [1, 0, 9, 22],
  "1.10f": [1, 0, 10, 39],
  "1.11": [1, 0, 11, 45],
  "1.11b": [1, 0, 11, 46],
  "1.12a": [1, 0, 12, 49],
  "1.13c": [1, 0, 13, 60],
  "1.13d": [1, 0, 13, 64],
};

/** The file version the core's `Game.exe` had, or null when it is not known. */
export function gameExeVersion(core: string | null | undefined): FileVersion | null {
  return core ? GAME_EXE_VERSIONS[core.trim().toLowerCase()] ?? null : null;
}
