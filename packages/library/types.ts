/**
 * The library's records: what Exordium knows about each game install, core and mod.
 *
 * Decided 2026-09-26 (vault: `Projects/Exordium/Architecture/Library.md`): an entry is
 * **referenced** by default — it records where the files already are, and the box links straight to
 * them, so a modder's edits show on the next launch as they do under D2SE. Only a **pinned** version
 * is copied, into a content-addressed store, where it can never change again.
 */

import type { ModSetup } from "@exordium/d2se";

export type EntryKind = "game" | "core" | "mod";

/** One file of an entry, as it was when last checked. */
export interface ManifestFile {
  /** Where the box presents it: relative, `/`-separated. */
  path: string;
  /** Where it is inside the entry's folder — differs from `path` only for a language file. */
  source: string;
  size: number;
  /** Milliseconds since the epoch, or `null` where the filesystem does not say. */
  mtime: number | null;
  /** Lowercase hex SHA-256. */
  hash: string;
}

export type EntrySource =
  /** Files stay where they are, in `folder`; checked before every launch. */
  | { kind: "referenced"; folder: string }
  /** A pinned copy in the store; can never change. */
  | { kind: "stored"; pinnedFrom: string; pinnedAt: string; label: string | null };

/** Where an entry came from. */
export interface D2SEOrigin {
  type: "d2se";
  /** The D2SE install's root. */
  install: string;
  /** The mod's folder name, the core's version, or `""` for the install's own archives. */
  folder: string;
}

export interface Entry {
  /** Stable, lowercase, safe as a file name: `mod-the-black-soul1-3fa2c1d0`. */
  id: string;
  kind: EntryKind;
  name: string;
  /** A mod's own version; a core's version. */
  version: string | null;
  /** The core a mod needs. */
  core: string | null;
  source: EntrySource;
  origin: D2SEOrigin;
  /** What the entry contributes to a box. */
  files: ManifestFile[];
  /** `Language_<code>` folders, by code, each relative to its folder. */
  languages: Record<string, ManifestFile[]>;
  /**
   * The mod's own save folder, which a box links to rather than copying — so D2SE and Exordium share
   * characters (decided 2026-09-26). Never part of `files`, never pinned.
   */
  saves: string | null;
  /** A D2SE mod's settings, including what D2SE loads for it. */
  setup: ModSetup | null;
  /** ISO timestamps. */
  addedAt: string;
  checkedAt: string;
}

export class LibraryError extends Error {
  override name = "LibraryError";
}
