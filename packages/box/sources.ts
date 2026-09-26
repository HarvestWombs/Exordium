/** Where each file of a plan lives, when the plan was made from library entries. */

import type { ResolvedFile } from "@exordium/layers";
import { type Entry, type Library, type ManifestFile, sourcePath } from "@exordium/library";
import { BoxError } from "./types.ts";

/**
 * A `BoxSpec.source` for a plan resolved from these entries' layers: a referenced entry's file comes
 * from its folder, a pinned one's from the store.
 */
export function librarySources(library: Library, entries: readonly Entry[]): (file: ResolvedFile) => string {
  const byId = new Map(
    entries.map((entry) => [
      entry.id,
      {
        entry,
        files: new Map(
          [entry.files, ...Object.values(entry.languages)].flat().map((f) => [f.path.toLowerCase(), f]),
        ),
      },
    ]),
  );
  return (file) => {
    const owner = byId.get(file.layer);
    const manifest: ManifestFile | undefined = owner?.files.get(file.path.toLowerCase());
    if (!owner || !manifest) {
      throw new BoxError(`"${file.path}" comes from "${file.layer}", which is not among the entries`);
    }
    return sourcePath(library, owner.entry, manifest);
  };
}
