/**
 * Resolving a stack into a plan: what the box presents, and which layer each part came from.
 *
 * The rules (vault: `Projects/Exordium/Architecture/Layers.md`):
 *
 * - Layers apply lowest first; a higher layer replaces whatever it shares with a lower one.
 * - Names are compared as Windows compares them, ignoring case; the spelling shown is the winning
 *   layer's.
 * - A tombstone removes a path or value from everything below — and for a folder or a registry key,
 *   everything under it.
 * - A file and a folder cannot share a name. A file replaces a folder of the same name below it, and
 *   a file inside a folder replaces a file that had the folder's name — the same way overlay
 *   filesystems behave, so a mod can turn either into the other.
 * - Only the top layer of a stack may be writable, and there is at most one.
 */

import {
  type FileEntry,
  type FileLayer,
  type FileLayerRole,
  LayerError,
  type Plan,
  type RegistryLayer,
  type RegistryLayerRole,
  type ResolvedFile,
  type ResolvedValue,
  type Stack,
} from "./types.ts";
import { ancestors, checkValue, keyMatch, normalizeKey, normalizePath, pathKey } from "./names.ts";

const FILE_ORDER: Record<FileLayerRole, number> = { core: 0, mod: 1, writable: 2 };
const REGISTRY_ORDER: Record<RegistryLayerRole, number> = { base: 0, mod: 1, profile: 2, writable: 3 };

export function resolve(stack: Stack): Plan {
  checkLayers("file", stack.files, FILE_ORDER);
  checkLayers("registry", stack.registry, REGISTRY_ORDER);
  return { files: resolveFiles(stack.files), registry: resolveRegistry(stack.registry) };
}

/**
 * Unique ids, roles in stack order (core below mod below writable; base below mod below profile
 * below writable), and a writable layer only at the top. Several `mod` or `core` layers may sit
 * together — a mod and its patch, say — but a role never appears below one that should sit under it.
 */
function checkLayers<Role extends string>(
  what: string,
  layers: readonly { id: string; role: Role }[],
  order: Record<Role, number>,
): void {
  const ids = new Set<string>();
  let last = -1;
  layers.forEach((layer, i) => {
    if (ids.has(layer.id)) throw new LayerError(`Two ${what} layers are both "${layer.id}"`);
    ids.add(layer.id);
    const rank = order[layer.role];
    if (rank === undefined) throw new LayerError(`${what} layer "${layer.id}" has an unknown role "${layer.role}"`);
    if (rank < last) {
      throw new LayerError(`${what} layer "${layer.id}" (${layer.role}) sits above a layer it belongs under`);
    }
    last = rank;
    if (layer.role === "writable" && i !== layers.length - 1) {
      throw new LayerError(`${what} layer "${layer.id}" is writable but not on top`);
    }
  });
}

function resolveFiles(layers: readonly FileLayer[]): ResolvedFile[] {
  const files = new Map<string, ResolvedFile>();
  // How many files each folder holds, so replacing a folder does not mean scanning every file.
  const folders = new Map<string, number>();

  const add = (key: string, file: ResolvedFile) => {
    if (!files.has(key)) { for (const folder of ancestors(key)) folders.set(folder, (folders.get(folder) ?? 0) + 1); }
    files.set(key, file);
  };
  const remove = (key: string) => {
    if (!files.delete(key)) return;
    for (const folder of ancestors(key)) {
      const count = (folders.get(folder) ?? 1) - 1;
      if (count > 0) folders.set(folder, count);
      else folders.delete(folder);
    }
  };
  const removeUnder = (key: string) => {
    if (!folders.has(key)) return;
    const prefix = `${key}/`;
    for (const existing of [...files.keys()]) if (existing.startsWith(prefix)) remove(existing);
  };

  for (const layer of layers) {
    const seen = new Set<string>();
    for (const entry of layer.entries) {
      const path = normalizePath(entry.path);
      const key = pathKey(path);
      if (seen.has(key)) throw new LayerError(`Layer "${layer.id}" lists "${path}" twice`);
      seen.add(key);
      if ("deleted" in entry) {
        remove(key);
        removeUnder(key);
        continue;
      }
      checkFile(layer.id, path, entry);
      // A file here replaces a folder of this name below, and any file named like a folder above it.
      removeUnder(key);
      for (const folder of ancestors(key)) remove(folder);
      add(key, { path, hash: entry.hash, size: entry.size, layer: layer.id, role: layer.role });
    }
  }
  return [...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, file]) => file);
}

function checkFile(layer: string, path: string, entry: FileEntry): void {
  if (!/^[0-9a-f]{64}$/.test(entry.hash)) {
    throw new LayerError(`Layer "${layer}", "${path}": the hash must be lowercase hex SHA-256`);
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    throw new LayerError(`Layer "${layer}", "${path}": the size must be a whole number of bytes`);
  }
}

function resolveRegistry(layers: readonly RegistryLayer[]): ResolvedValue[] {
  // Keyed by `key match` + NUL + `name match`: a NUL cannot occur in either.
  const values = new Map<string, ResolvedValue>();
  for (const layer of layers) {
    const seen = new Set<string>();
    for (const entry of layer.entries) {
      const key = normalizeKey(entry.key);
      const keyId = keyMatch(key);
      if ("deleted" in entry) {
        if (entry.name === undefined) {
          // A whole key: its own values and every subkey's.
          const prefix = `${keyId}\\`;
          for (const id of [...values.keys()]) {
            const [valueKey] = id.split("\x00");
            if (valueKey === keyId || valueKey!.startsWith(prefix)) values.delete(id);
          }
        } else {
          values.delete(`${keyId}\x00${entry.name.toLowerCase()}`);
        }
        continue;
      }
      const id = `${keyId}\x00${entry.name.toLowerCase()}`;
      if (seen.has(id)) throw new LayerError(`Layer "${layer.id}" sets ${key} "${entry.name}" twice`);
      seen.add(id);
      checkValue(`Layer "${layer.id}", ${key} "${entry.name}"`, entry.value);
      values.set(id, { key, name: entry.name, value: entry.value, layer: layer.id, role: layer.role });
    }
  }
  return [...values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, value]) => value);
}
