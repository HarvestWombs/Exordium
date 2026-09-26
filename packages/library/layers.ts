/** Library entries as layers for a box ([[Architecture/Layers]] in the vault). */

import type { FileLayer, FileLayerRole } from "@exordium/layers";
import type { Entry, EntryKind } from "./types.ts";

const ROLE: Record<EntryKind, FileLayerRole> = { game: "game", core: "core", mod: "mod" };

/** The files an entry contributes, as a layer in its kind's place in the stack. */
export function entryLayer(entry: Entry): FileLayer {
  return {
    id: entry.id,
    role: ROLE[entry.kind],
    entries: entry.files.map((file) => ({ path: file.path, hash: file.hash, size: file.size })),
  };
}
