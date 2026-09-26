/** Library entries as layers for a box ([[Architecture/Layers]] in the vault). */

import type { FileLayer, FileLayerRole } from "@exordium/layers";
import type { Entry, EntryKind } from "./types.ts";

const ROLE: Record<EntryKind, FileLayerRole> = { game: "game", core: "core", mod: "mod" };

export interface EntryLayerOptions {
  /**
   * A selected D2SE language code, such as `ENG`. `MOD` means the mod's own files, so no language
   * folder is overlaid.
   */
  language?: string | null;
}

/** The files an entry contributes, as a layer in its kind's place in the stack. */
export function entryLayer(entry: Entry, options: EntryLayerOptions | number = {}): FileLayer {
  // `entryLayer` is commonly passed straight to `Array.map`, whose second argument is the index.
  const language = typeof options === "number" ? null : options.language?.toUpperCase();
  const languageFiles = language && language !== "MOD" ? entry.languages[language] ?? [] : [];
  return {
    id: entry.id,
    role: ROLE[entry.kind],
    entries: [...entry.files, ...languageFiles].map((file) => ({
      path: file.path,
      hash: file.hash,
      size: file.size,
    })),
  };
}
