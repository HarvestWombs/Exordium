/**
 * Writes an .ico into a Windows executable's own resources, so Explorer, the Start menu and pinned
 * shortcuts show Exordium's icon without the app running. Ported from Excelsior's embed-icon.ts.
 *
 * `deno desktop` copies laufey's prebuilt launcher rather than linking a per-app binary, so there
 * is no build step where an icon could be compiled in; `desktop.app.icons` in deno.json only drops
 * an AppIcon.ico beside it. This is the job `rcedit` does, through the same Win32 calls.
 */

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
/** MAKELANGID(LANG_NEUTRAL, SUBLANG_NEUTRAL): found whatever the shell's language is. */
const LANG_NEUTRAL = 0;
/** The shell shows the icon group with the lowest id as the file's icon. */
const GROUP_ICON_ID = 1;

const SYMBOLS = {
  BeginUpdateResourceW: { parameters: ["buffer", "bool"], result: "pointer" },
  UpdateResourceW: { parameters: ["pointer", "pointer", "pointer", "u16", "buffer", "u32"], result: "bool" },
  EndUpdateResourceW: { parameters: ["pointer", "bool"], result: "bool" },
  GetLastError: { parameters: [], result: "u32" },
} as const;

function wide(text: string): Uint8Array {
  const buffer = new Uint8Array((text.length + 1) * 2);
  const view = new DataView(buffer.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return buffer;
}

/** MAKEINTRESOURCE: an integer id where a name pointer is expected. */
function intResource(id: number): Deno.PointerValue {
  return Deno.UnsafePointer.create(BigInt(id));
}

export interface IconEntry {
  /** The ICONDIRENTRY's first 12 bytes: size, colours, planes, bit depth, byte count. */
  header: Uint8Array;
  image: Uint8Array;
}

/** Splits an .ico into its images: ICONDIR is reserved(2) type(2) count(2), then 16 bytes per image. */
export function parseIco(bytes: Uint8Array): IconEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 6 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error("not an .ico file");
  }
  const entries: IconEntry[] = [];
  for (let i = 0; i < view.getUint16(4, true); i++) {
    const at = 6 + i * 16;
    const size = view.getUint32(at + 8, true);
    const offset = view.getUint32(at + 12, true);
    if (offset + size > bytes.length) throw new Error(`.ico entry ${i} runs past the end of the file`);
    entries.push({ header: bytes.slice(at, at + 12), image: bytes.slice(offset, offset + size) });
  }
  return entries;
}

/** GRPICONDIR: the file's directory with each 4-byte offset replaced by a 2-byte resource id. */
export function buildGroup(entries: IconEntry[]): Uint8Array {
  const out = new Uint8Array(6 + entries.length * 14);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  entries.forEach((entry, i) => {
    const at = 6 + i * 14;
    out.set(entry.header, at);
    view.setUint32(at + 8, entry.image.length, true);
    view.setUint16(at + 12, i + 1, true);
  });
  return out;
}

/** Embeds `icoPath`'s images into `exePath`; returns how many. Throws on failure. */
export function embedIcon(exePath: string, icoPath: string): number {
  const entries = parseIco(Deno.readFileSync(icoPath));
  if (entries.length === 0) throw new Error("the .ico contains no images");
  const kernel32 = Deno.dlopen("kernel32.dll", SYMBOLS);
  try {
    const fail = (what: string): never => {
      throw new Error(`${what} failed (GetLastError ${kernel32.symbols.GetLastError()})`);
    };
    // `false` keeps the resources already there: the launcher's RT_MANIFEST sets its DPI awareness
    // and comctl32 binding, and `true` would delete it.
    const handle = kernel32.symbols.BeginUpdateResourceW(wide(exePath), false);
    if (handle === null) fail("BeginUpdateResource");
    let committed = false;
    try {
      entries.forEach((entry, i) => {
        const ok = kernel32.symbols.UpdateResourceW(
          handle,
          intResource(RT_ICON),
          intResource(i + 1),
          LANG_NEUTRAL,
          entry.image,
          entry.image.length,
        );
        if (!ok) fail(`UpdateResource for icon ${i + 1}`);
      });
      const group = buildGroup(entries);
      const ok = kernel32.symbols.UpdateResourceW(
        handle,
        intResource(RT_GROUP_ICON),
        intResource(GROUP_ICON_ID),
        LANG_NEUTRAL,
        group,
        group.length,
      );
      if (!ok) fail("UpdateResource for the icon group");
      if (!kernel32.symbols.EndUpdateResourceW(handle, false)) fail("EndUpdateResource");
      committed = true;
    } finally {
      // A failure discards the pending update, so a half-built resource set is never written.
      if (!committed) kernel32.symbols.EndUpdateResourceW(handle, true);
    }
    return entries.length;
  } finally {
    kernel32.close();
  }
}
