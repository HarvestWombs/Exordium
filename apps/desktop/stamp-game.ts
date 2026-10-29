/**
 * The loader as each core's `Game.exe`, made at build time: one copy per core in
 * `native/loader/build/game/<core>/Game.exe`, carrying that core's own `Game.exe` file version
 * (plugins such as D2GL identify the game by `GetFileVersionInfo("game.exe")`). Boxes symlink the
 * copy for their core, so nothing is written per box and the copies can be signed once, here.
 *
 *   deno run -A apps/desktop/stamp-game.ts      (part of `deno task build:loader`)
 *
 * The version resource is written with the same Win32 calls as embed-icon.ts. The loader cannot
 * stamp itself here: it imports Storm.dll at load time, so it runs only beside a core.
 */
import { type FileVersion, gameExeVersion, STAMPED_CORES } from "@exordium/launch";

const RT_VERSION = 16;
const VERSION_ID = 1;
/** MAKELANGID(LANG_ENGLISH, SUBLANG_ENGLISH_US): the language loader.rc's version block uses. */
const LANG_EN_US = 0x0409;
/** What Task Manager shows as the process's name. */
export const GAME_EXE_NAME = "Diablo II";

const SYMBOLS = {
  BeginUpdateResourceW: { parameters: ["buffer", "bool"], result: "pointer" },
  UpdateResourceW: { parameters: ["pointer", "pointer", "pointer", "u16", "buffer", "u32"], result: "bool" },
  EndUpdateResourceW: { parameters: ["pointer", "bool"], result: "bool" },
  GetLastError: { parameters: [], result: "u32" },
} as const;

function utf16(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xFF, text.charCodeAt(i) >> 8);
  return out;
}

/** One node of a VS_VERSIONINFO tree: WORD length, value length, type, UTF-16 key, value, children. */
interface VersionNode {
  key: string;
  value: number[];
  /** In WORDs for text, bytes for binary. */
  valueLength: number;
  /** 1 text, 0 binary. */
  type: 0 | 1;
  children: VersionNode[];
}

function pad4(out: number[]): void {
  while (out.length % 4) out.push(0);
}

function writeNode(out: number[], node: VersionNode): void {
  const start = out.length;
  out.push(0, 0, 0, 0, 0, 0);
  out.push(...utf16(node.key), 0, 0);
  pad4(out);
  out.push(...node.value);
  for (const child of node.children) {
    pad4(out);
    writeNode(out, child);
  }
  const length = out.length - start;
  out[start] = length & 0xFF;
  out[start + 1] = length >> 8;
  out[start + 2] = node.valueLength & 0xFF;
  out[start + 3] = node.valueLength >> 8;
  out[start + 4] = node.type;
  out[start + 5] = 0;
}

function text(key: string, value: string): VersionNode {
  return { key, value: [...utf16(value), 0, 0], valueLength: value.length + 1, type: 1, children: [] };
}

/** A VS_VERSIONINFO resource: `version` as the file and product version, `name` as its description. */
export function versionResource(version: FileVersion, name: string): Uint8Array {
  const fixed = new DataView(new ArrayBuffer(52));
  const ms = (version[0] << 16 | version[1]) >>> 0;
  const ls = (version[2] << 16 | version[3]) >>> 0;
  fixed.setUint32(0, 0xFEEF04BD, true); // dwSignature
  fixed.setUint32(4, 0x00010000, true); // dwStrucVersion
  fixed.setUint32(8, ms, true); // file version
  fixed.setUint32(12, ls, true);
  fixed.setUint32(16, ms, true); // product version
  fixed.setUint32(20, ls, true);
  fixed.setUint32(24, 0x3F, true); // dwFileFlagsMask
  fixed.setUint32(32, 0x4, true); // dwFileOS: VOS__WINDOWS32
  fixed.setUint32(36, 0x1, true); // dwFileType: VFT_APP
  const dotted = version.join(".");
  const root: VersionNode = {
    key: "VS_VERSION_INFO",
    value: [...new Uint8Array(fixed.buffer)],
    valueLength: 52,
    type: 0,
    children: [
      {
        key: "StringFileInfo",
        value: [],
        valueLength: 0,
        type: 1,
        children: [{
          key: "040904b0",
          value: [],
          valueLength: 0,
          type: 1,
          children: [
            text("CompanyName", "Exordium"),
            text("FileDescription", name),
            text("FileVersion", dotted),
            text("InternalName", "Game"),
            text("OriginalFilename", "Game.exe"),
            text("ProductName", name),
            text("ProductVersion", dotted),
          ],
        }],
      },
      {
        key: "VarFileInfo",
        value: [],
        valueLength: 0,
        type: 1,
        children: [{ key: "Translation", value: [0x09, 0x04, 0xB0, 0x04], valueLength: 4, type: 0, children: [] }],
      },
    ],
  };
  const out: number[] = [];
  writeNode(out, root);
  return new Uint8Array(out);
}

function wide(value: string): Uint8Array {
  return new Uint8Array([...utf16(value), 0, 0]);
}

/** Replaces `exePath`'s version resource. */
export function stampVersion(exePath: string, version: FileVersion, name: string): void {
  const kernel32 = Deno.dlopen("kernel32.dll", SYMBOLS);
  const fail = (step: string): never => {
    throw new Error(`${step} failed for ${exePath} (Win32 error ${kernel32.symbols.GetLastError()})`);
  };
  try {
    const handle = kernel32.symbols.BeginUpdateResourceW(wide(exePath), false);
    if (handle === null) fail("BeginUpdateResource");
    let committed = false;
    try {
      const data = versionResource(version, name);
      const ok = kernel32.symbols.UpdateResourceW(
        handle,
        Deno.UnsafePointer.create(BigInt(RT_VERSION)),
        Deno.UnsafePointer.create(BigInt(VERSION_ID)),
        LANG_EN_US,
        data,
        data.length,
      );
      if (!ok) fail("UpdateResource");
      if (!kernel32.symbols.EndUpdateResourceW(handle, false)) fail("EndUpdateResource");
      committed = true;
    } finally {
      if (!committed) kernel32.symbols.EndUpdateResourceW(handle, true);
    }
  } finally {
    kernel32.close();
  }
}

/** Writes `<out>/<core>/Game.exe` for every pre-1.14 core from the built loader. Returns how many. */
export async function stampGames(loader: string, out: string): Promise<number> {
  await Deno.remove(out, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  for (const core of STAMPED_CORES) {
    const version = gameExeVersion(core);
    if (!version) throw new Error(`No Game.exe version known for core ${core}.`);
    await Deno.mkdir(`${out}/${core}`, { recursive: true });
    const exe = `${out}/${core}/Game.exe`;
    await Deno.copyFile(loader, exe);
    stampVersion(exe.replaceAll("/", "\\"), version, GAME_EXE_NAME);
  }
  return STAMPED_CORES.length;
}

if (import.meta.main) {
  const build = new URL("../../native/loader/build/", import.meta.url);
  const path = (name: string) => decodeURIComponent(new URL(name, build).pathname).replace(/^\/([a-z]:)/i, "$1");
  const count = await stampGames(path("exordium-game.exe"), path("game"));
  console.log(`Stamped ${count} copies of the loader as each core's Game.exe into ${path("game")}.`);
}
