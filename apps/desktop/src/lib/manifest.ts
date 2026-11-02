import type { ModManifest } from "../types.ts";

/** What a form may leave half-typed, tidied for the file: blank lines, and links with no address. */
export function cleanManifest(manifest: ModManifest): ModManifest {
  const lines = (list: string[] | null | undefined) => (list ?? []).map((line) => line.trim()).filter(Boolean);
  return {
    ...manifest,
    links: (manifest.links ?? []).filter((link) => link.url.trim()),
    loads: { ...manifest.loads, mpqs: lines(manifest.loads?.mpqs), dlls: lines(manifest.loads?.dlls) },
  };
}
