/**
 * 1.14 cores: the install root itself.
 *
 * From 1.14 on, Blizzard's `Game.exe` is the whole game (Storm, Fog, D2Win, D2Client and the rest
 * compiled in), so a 1.14 install has no core folder: its root `Game.exe` and `patch_d2.mpq` are the
 * core. D2SE has no 1.14 core; the version comes from the exe's own version resource. Vault:
 * `Shared/Diablo-II/Process Startup.md`, "1.14d: one executable".
 */

export type FileVersion = readonly [number, number, number, number];

/** The root files that make up a 1.14 core. The rest of the install is the `game` layer. */
export const SINGLE_EXE_CORE_FILES = ["game.exe", "patch_d2.mpq", "blizzarderror.exe"] as const;

/** VS_FIXEDFILEINFO's signature, which precedes its version numbers. */
const FIXED_FILE_INFO = 0xFEEF04BD;

/** A PE file's `FileVersion` from its version resource, or null when it has none. */
export function fileVersion(bytes: Uint8Array): FileVersion | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The resource is 4-byte aligned; its fixed part is signature, struct version, then MS and LS words.
  for (let at = 0; at + 16 <= bytes.length; at += 4) {
    if (view.getUint32(at, true) !== FIXED_FILE_INFO) continue;
    const ms = view.getUint32(at + 8, true);
    const ls = view.getUint32(at + 12, true);
    return [ms >>> 16, ms & 0xFFFF, ls >>> 16, ls & 0xFFFF];
  }
  return null;
}

/**
 * The core a 1.14 `Game.exe` is: `1.14.3.71` is `1.14d`, the third number being the patch letter
 * (1.14a is `1.14.0.64`). Null for anything that is not 1.14.
 */
export function singleExeCoreName(version: FileVersion | null): string | null {
  if (!version || version[0] !== 1 || version[1] !== 14 || version[2] > 25) return null;
  return `1.14${String.fromCharCode(97 + version[2])}`;
}

/** Whether a core is one executable (1.14 and later), which the loader cannot become. */
export function isSingleExeCore(core: string | null | undefined): boolean {
  return /^1\.14[a-z]?$/i.test(core?.trim() ?? "");
}

/** The 1.14 core an install root holds, from its `Game.exe`; null when it has none. */
export async function rootCoreName(root: string): Promise<string | null> {
  try {
    return singleExeCoreName(fileVersion(await Deno.readFile(`${root}/Game.exe`)));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}
