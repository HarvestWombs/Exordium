import { tr } from "../lib/i18n.ts";
import type { ArtKind } from "../types.ts";

export function artUrl(root: string | null, key: string, kind: ArtKind, version: number): string {
  return `/api/art?root=${encodeURIComponent(root ?? "")}&key=${encodeURIComponent(key)}&kind=${kind}&v=${version}`;
}

export function screenshotUrl(root: string, key: string, name: string): string {
  return `/api/screenshots?root=${encodeURIComponent(root)}&key=${encodeURIComponent(key)}&name=${
    encodeURIComponent(name)
  }`;
}

export const ART_SLOTS: { kind: ArtKind; label: string; hint: string }[] = [
  {
    kind: "banner",
    label: tr("BANNER"),
    hint: tr("The title's page header. Wide, 4:1. Suggested: 1920×480."),
  },
  {
    kind: "icon",
    label: tr("ICON"),
    hint: tr("The library list and Game.exe in the taskbar. Square, 1:1. Suggested: 256×256."),
  },
  {
    kind: "portrait",
    label: tr("PORTRAIT"),
    hint: tr("The grid view's capsule. Portrait, 2:3. Suggested: 600×900."),
  },
];

/** What the picker offers. Anything the WebView can decode works; these are the usual ones. */
export const ART_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/x-icon,image/svg+xml,.ico";

/** The longest side kept for a banner or portrait; larger images are scaled down to it. */
export const ART_MAX_SIDE = 4096;

/**
 * Any image the WebView decodes (PNG, JPEG, WebP, GIF's first frame, BMP, AVIF, ICO, SVG) as a PNG,
 * which is what the Art page saves: the icon goes into Game.exe and shortcuts as PNG-in-ICO. An icon
 * is fitted inside 256×256 and centred on a transparent square; a banner or portrait keeps its size
 * up to ART_MAX_SIDE. A PNG that already fits is sent unchanged.
 */
export async function artAsPng(file: File, kind: ArtKind): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(tr("{name} is not an image this app can read.", { name: file.name }));
    }
    const width = img.naturalWidth || 256;
    const height = img.naturalHeight || 256;
    const limit = kind === "icon" ? 256 : ART_MAX_SIDE;
    const fits = width <= limit && height <= limit && (kind !== "icon" || width === height);
    if (file.type === "image/png" && fits) return file;
    const scale = Math.min(1, limit / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = kind === "icon" ? Math.max(w, h) : w;
    canvas.height = kind === "icon" ? Math.max(w, h) : h;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(tr("Could not convert that image."));
    context.imageSmoothingQuality = "high";
    context.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error(tr("Could not convert that image."));
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
