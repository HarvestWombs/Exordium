/**
 * A box: a profile's resolved layers, realised as a real folder the game can run in.
 *
 * Vault: `Projects/Exordium/Architecture/Launcher.md`. Every file is a link to where its bytes
 * already are — a referenced mod or core folder, or the store — except what the game writes, which is
 * copied. A D2SE mod's `save\` is a junction to the mod's own save folder, so D2SE and Exordium share
 * characters.
 */

import type { Plan, ResolvedFile } from "@exordium/layers";

/** How one file reaches the box. */
export type LinkMode = "hardlink" | "symlink" | "copy";

export interface BoxSpec {
  /** The profile's id; the box's folder name. */
  id: string;
  plan: Plan;
  /** The absolute path of a file's bytes: a referenced folder or the store. */
  source(file: ResolvedFile): string;
  /** A folder to present as `save\` through a junction, or `null` for none. */
  saves: string | null;
  /**
   * Folders presented whole through a junction, as `save\` is: a mod's `data\`, which the game reads
   * loose from beside Game.exe with -direct. The plan must hold nothing under them.
   */
  folders?: readonly FolderLink[];
  /**
   * Whether a file's source must never be written — true for a pinned version in the store. A
   * protected file's `.ini` is copied rather than linked, and any protected file found written
   * through a link is copied from then on. An unprotected file — a referenced mod's — is always
   * linked, so a plugin saving its settings updates the mod folder exactly as it does under D2SE.
   * Default: nothing is protected.
   */
  protect?(file: ResolvedFile, source: string): boolean;
}

export interface RealiseOptions {
  /** Link modes to try, in order. Default: symlink, then hardlink. Copies are opt-in. */
  modes?: readonly LinkMode[];
  /** Called after each bounded batch while a new box is being linked. */
  onProgress?: (completed: number, total: number) => void;
}

/** A folder in the box that is a junction to `target`. */
export interface FolderLink {
  /** Relative to the box's game folder: `data`. */
  path: string;
  target: string;
}

/** A file as the box holds it, and what its source looked like when the box was built. */
export interface BoxFile {
  path: string;
  mode: LinkMode;
  source: string;
  /** The source must never be written (see `BoxSpec.protect`). */
  protected: boolean;
  hash: string;
  size: number;
  mtime: number | null;
}

/** `box.json`: what the box's `game` folder contains, so it can be reused and checked. */
export interface BoxState {
  id: string;
  /** Identifies what was realised: the plan, the saves folder and the copy rules. */
  digest: string;
  realisedAt: string;
  files: BoxFile[];
  saves: string | null;
  /** Folder links (see `BoxSpec.folders`); absent in a box built before they existed. */
  folders?: FolderLink[];
  /** Protected paths found written through a link after a run, copied from then on. Learned once. */
  learnedCopy: string[];
}

export interface Realised {
  /** The folder the game runs in. */
  folder: string;
  /** The previous box was intact and describes the same plan, so nothing was rebuilt. */
  reused: boolean;
  counts: Record<LinkMode, number>;
  /** Said once rather than per file: e.g. that symlinks were unavailable and hardlinks were tried. */
  notes: string[];
}

export interface IntegrityIssue {
  path: string;
  level: "error" | "warning";
  kind:
    | "missing"
    | "size"
    | "hash"
    | "link"
    | "source"
    | "unexpected"
    | "digest"
    | "folder-link";
  message: string;
}

export interface IntegrityReport {
  ok: boolean;
  checkedFiles: number;
  checkedHashes: number;
  expectedDigest: string | null;
  actualDigest: string | null;
  issues: IntegrityIssue[];
}

export interface AfterRun {
  /**
   * Linked files whose source changed during the run: the game, a plugin, or someone editing the
   * mod wrote to it. For a referenced mod that is what D2SE does too, and is only reported; for a
   * `protected` (pinned) source it means the store was written, and the path is copied from then on.
   */
  writtenThrough: { path: string; source: string; protected: boolean }[];
  /** Copied files the game changed. Copies are the box's own; the next launch rebuilds them. */
  changedCopies: string[];
  /** Links the game replaced with a file of its own; the next launch rebuilds the box. */
  replaced: string[];
  /** Files the run created in the box that no layer supplied (logs, new configs). */
  newFiles: string[];
}

export class BoxError extends Error {
  override name = "BoxError";
}
