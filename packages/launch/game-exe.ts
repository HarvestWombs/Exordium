/** The file versions of Blizzard's original `Game.exe` for each supported core. */

export type FileVersion = readonly [number, number, number, number];

/**
 * Blizzard's `Game.exe` file version per core: 1.09d to 1.13d as D2GL's own detection table has
 * them, the rest read from Blizzard's own `Game.exe` of each version (HarvestLabs' cores, 2026-10-05).
 * 1.11 and 1.11b carry two other version records first; theirs is the last.
 */
const GAME_EXE_VERSIONS: Readonly<Record<string, FileVersion>> = {
  "1.00": [1, 0, 0, 1],
  "1.01": [1, 0, 0, 1],
  "1.02": [1, 0, 2, 0],
  "1.03": [1, 0, 3, 0],
  "1.04b": [1, 0, 4, 1],
  "1.04c": [1, 0, 4, 2],
  "1.05": [1, 0, 5, 0],
  "1.05b": [1, 0, 5, 1],
  "1.06": [1, 0, 6, 0],
  "1.06b": [1, 0, 6, 0],
  "1.07": [1, 0, 7, 0],
  "1.08": [1, 0, 8, 28],
  "1.09": [1, 0, 9, 19],
  "1.09b": [1, 0, 9, 20],
  "1.09d": [1, 0, 9, 22],
  "1.10f": [1, 0, 10, 39],
  "1.11": [1, 0, 11, 45],
  "1.11b": [1, 0, 11, 46],
  "1.12a": [1, 0, 12, 49],
  "1.13c": [1, 0, 13, 60],
  "1.13d": [1, 0, 13, 64],
  // Blizzard's own exe stays in a 1.14 box; listed so the version is known, never stamped.
  "1.14d": [1, 14, 3, 71],
};

/** Every Diablo II core for which Exordium has a known launch path. */
export const SUPPORTED_CORES: readonly string[] = Object.keys(GAME_EXE_VERSIONS);

/** The file version the core's `Game.exe` had, or null when it is not known. */
export function gameExeVersion(core: string | null | undefined): FileVersion | null {
  return core ? GAME_EXE_VERSIONS[core.trim().toLowerCase()] ?? null : null;
}
