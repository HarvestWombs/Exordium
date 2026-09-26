/**
 * The layer model: what a profile's box contains, as plain data.
 *
 * A box has two stacks — files and registry — each ordered lowest first, where a higher layer
 * replaces what it shares with a lower one, and only the top layer of each may be writable. The
 * design, and why it is data before it is anything on disk, is in the HarvestLabs vault:
 * `Projects/Exordium/Architecture/Layers.md`.
 */

/** A file stack's layers, lowest first. */
export type FileLayerRole = "core" | "mod" | "writable";

/** A registry stack's layers, lowest first. */
export type RegistryLayerRole = "base" | "mod" | "profile" | "writable";

export interface FileEntry {
  /** Relative to the box root, `/`-separated. Matched case-insensitively, as Windows does. */
  path: string;
  /** Lowercase hex SHA-256 of the content. */
  hash: string;
  size: number;
}

/**
 * Removes a path, and everything under it, from the layers below — a file or folder the game
 * deleted while it ran, or one a mod needs gone from the core.
 */
export interface FileTombstone {
  path: string;
  deleted: true;
}

export interface FileLayer {
  /** Unique within a stack: normally the library entry's id. */
  id: string;
  role: FileLayerRole;
  entries: (FileEntry | FileTombstone)[];
}

export type RegistryRoot = "HKCU" | "HKLM";

/**
 * A registry value. Only what Diablo II and its tools actually store: strings, string lists,
 * 32- and 64-bit numbers, and raw bytes. Kept JSON-friendly so a plan can be saved, shipped with
 * a mod, and diffed as text — which is why a qword is a decimal string and binary is hex.
 */
export type RegistryValue =
  | { type: "sz"; data: string }
  | { type: "expand_sz"; data: string }
  | { type: "multi_sz"; data: string[] }
  | { type: "dword"; data: number }
  | { type: "qword"; data: string }
  | { type: "binary"; data: string };

export interface RegistryEntry {
  /** `HKCU\Software\Blizzard Entertainment\Diablo II`; `HKEY_CURRENT_USER` is accepted too. */
  key: string;
  /** The value name; `""` is the key's default value. Matched case-insensitively. */
  name: string;
  value: RegistryValue;
}

/** Removes one value, or — with no `name` — a whole key with its values and subkeys. */
export interface RegistryTombstone {
  key: string;
  name?: string;
  deleted: true;
}

export interface RegistryLayer {
  id: string;
  role: RegistryLayerRole;
  entries: (RegistryEntry | RegistryTombstone)[];
}

/** Both stacks of a box, each lowest first. */
export interface Stack {
  files: FileLayer[];
  registry: RegistryLayer[];
}

/** One path as the box presents it, and the layer it came from. */
export interface ResolvedFile {
  /** Spelled as the winning layer spells it. */
  path: string;
  hash: string;
  size: number;
  layer: string;
  role: FileLayerRole;
}

/** One registry value as the box presents it, and the layer it came from. */
export interface ResolvedValue {
  /** Normalised: `HKCU\…` or `HKLM\…`, spelled as the winning layer spells it. */
  key: string;
  name: string;
  value: RegistryValue;
  layer: string;
  role: RegistryLayerRole;
}

/**
 * A stack resolved: every path and every value the box presents, each attributed to the layer it
 * came from, sorted so that two plans of the same stack are identical regardless of input order.
 */
export interface Plan {
  files: ResolvedFile[];
  registry: ResolvedValue[];
}

export class LayerError extends Error {
  override name = "LayerError";
}
