/**
 * Pinning: copying a referenced entry into the store, where it can never change.
 *
 * Every file is hashed while it is copied and must match the entry's manifest. A file that no
 * longer matches has changed since the last check, and pinning refuses rather than store a version
 * nobody looked at — the caller refreshes first. Content already in the store is not copied again,
 * so pinning a second version of a mod costs only what changed.
 */

import { crypto } from "@std/crypto";
import { hashFile } from "@exordium/d2se";
import { type Entry, LibraryError, type ManifestFile } from "./types.ts";
import type { Library } from "./library.ts";
import { slug } from "./register.ts";

export interface PinOptions {
  /** Shown to the user and used in the pinned entry's id; a short content hash when absent. */
  label?: string | null;
  now?: Date;
}

export async function pin(library: Library, id: string, options: PinOptions = {}): Promise<Entry> {
  const entry = await library.get(id);
  if (!entry) throw new LibraryError(`No entry "${id}"`);
  if (entry.source.kind !== "referenced") throw new LibraryError(`"${id}" is already a pinned copy`);
  const folder = entry.source.folder;

  for (const file of allFiles(entry)) await storeFile(library, `${folder}/${file.source}`, file.hash);

  const label = options.label ?? null;
  const pinned: Entry = {
    ...entry,
    id: `${entry.id}@${label ? slug(label) : await contentTag(entry)}`,
    source: { kind: "stored", pinnedFrom: entry.id, pinnedAt: (options.now ?? new Date()).toISOString(), label },
  };
  await library.save(pinned);
  return pinned;
}

/** Stored files whose content no longer matches their hash, or that are missing from the store. */
export async function verifyStored(library: Library, entry: Entry): Promise<string[]> {
  if (entry.source.kind !== "stored") return [];
  const bad: string[] = [];
  for (const file of allFiles(entry)) {
    try {
      if ((await hashFile(library.storePath(file.hash))) !== file.hash) bad.push(file.source);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      bad.push(file.source);
    }
  }
  return bad;
}

/** Where a box should link a file from: the original folder, or the store. */
export function sourcePath(library: Library, entry: Entry, file: ManifestFile): string {
  return entry.source.kind === "referenced" ? `${entry.source.folder}/${file.source}` : library.storePath(file.hash);
}

export function allFiles(entry: Entry): ManifestFile[] {
  return [...entry.files, ...Object.values(entry.languages).flat()];
}

/** Copies `from` into the store under `hash`, verifying the bytes as they are copied. */
async function storeFile(library: Library, from: string, hash: string): Promise<void> {
  const dest = library.storePath(hash);
  try {
    await Deno.stat(dest);
    return; // Content-addressed: already there means already this content.
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
  const temp = `${dest}.${crypto.randomUUID()}.tmp`;
  try {
    const source = await Deno.open(from, { read: true });
    const [forHash, forCopy] = source.readable.tee();
    const target = await Deno.open(temp, { write: true, createNew: true });
    const [digest] = await Promise.all([crypto.subtle.digest("SHA-256", forHash), forCopy.pipeTo(target.writable)]);
    const actual = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (actual !== hash) {
      throw new LibraryError(`${from} has changed since it was last checked; refresh before pinning`);
    }
    await Deno.rename(temp, dest);
  } catch (error) {
    await Deno.remove(temp).catch(() => {});
    throw error;
  }
}

/** A short tag from the entry's content, so the same content pinned twice gets the same id. */
async function contentTag(entry: Entry): Promise<string> {
  const text = allFiles(entry).map((f) => `${f.source.toLowerCase()}\t${f.hash}`).sort().join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 5).map((b) => b.toString(16).padStart(2, "0")).join("");
}
