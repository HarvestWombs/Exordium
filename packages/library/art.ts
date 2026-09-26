/**
 * A title's artwork, as PNG in Exordium's library, never in the mod's folder.
 *
 * - **banner**: the header of the mod's page, 1920×500 or larger.
 * - **icon**: the library list, and the box's Game.exe (the taskbar). At most 256×256.
 * - **portrait**: for a grid view later, 600×900.
 *
 * This is the format for Exordium's own titles. A D2SE import has none of these; its
 * `ModBanner=<file>.bmp` (a 250×60 strip) is shown as it is, from the mod's folder, when no banner
 * is set here.
 */

export const ART_KINDS = ["banner", "icon", "portrait"] as const;
export type ArtKind = typeof ART_KINDS[number];

export class ArtError extends Error {
  override name = "ArtError";
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 24 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Width and height from a PNG's IHDR. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (!isPng(bytes)) throw new ArtError("Not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * `<root>/art/<key>/<kind>.png`. A key names a title: `[a-z0-9._-]`, as the server makes them
 * (`mod-<slug>`, `core-<version>`).
 */
export class ArtStore {
  readonly folder: string;

  constructor(exordiumRoot: string) {
    this.folder = `${exordiumRoot.replace(/\\/g, "/").replace(/\/+$/, "")}/art`;
  }

  private dir(key: string): string {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(key)) throw new ArtError(`"${key}" is not a valid art key`);
    return `${this.folder}/${key}`;
  }

  path(key: string, kind: ArtKind): string {
    return `${this.dir(key)}/${kind}.png`;
  }

  async read(key: string, kind: ArtKind): Promise<Uint8Array | null> {
    try {
      return await Deno.readFile(this.path(key, kind));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return null;
      throw error;
    }
  }

  async has(key: string, kind: ArtKind): Promise<boolean> {
    try {
      return (await Deno.stat(this.path(key, kind))).isFile;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return false;
      throw error;
    }
  }

  /** Saves a PNG. An icon is at most 256×256, which is what Game.exe can carry. */
  async save(key: string, kind: ArtKind, png: Uint8Array): Promise<void> {
    const { width, height } = pngSize(png);
    if (kind === "icon" && (width > 256 || height > 256)) throw new ArtError("An icon is at most 256×256");
    const dir = this.dir(key);
    await Deno.mkdir(dir, { recursive: true });
    const temp = `${dir}/${kind}.${crypto.randomUUID()}.tmp`;
    await Deno.writeFile(temp, png);
    await Deno.rename(temp, this.path(key, kind));
  }

  async remove(key: string, kind: ArtKind): Promise<void> {
    await Deno.remove(this.path(key, kind)).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }
}
