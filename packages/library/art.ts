/**
 * A title's artwork: images in its own folder, named by its exordium.mod.json.
 *
 * - **banner**: the header of the mod's page, 4:1; 1920×480 is suggested.
 * - **icon**: the library list and the box's Game.exe (the taskbar), 1:1; 256×256 is suggested and the maximum.
 * - **portrait**: the library grid card, 2:3; 600×900 is suggested.
 *
 * A D2SE import has none of these; its `ModBanner=<file>.bmp` (a 250×60 strip) is shown as it is, from
 * the mod's folder, until a banner is named.
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

/** Where the Art page saves an image chosen for a title, in its folder. Never a name a mod would ship. */
export function chosenArtPath(kind: ArtKind): string {
  return `art/chosen-${kind}.png`;
}

/** A chosen image must be a PNG. An icon is at most 256×256, which is what Game.exe can carry. */
export function checkArt(kind: ArtKind, png: Uint8Array): void {
  const { width, height } = pngSize(png);
  if (kind === "icon" && (width > 256 || height > 256)) throw new ArtError("An icon is at most 256×256");
}
