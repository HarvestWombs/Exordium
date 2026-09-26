/**
 * Paths and registry keys, normalised and checked.
 *
 * A layer comes from a mod someone downloaded, so nothing in it is trusted to stay inside the box:
 * absolute paths, drive letters and `..` are refused outright, as are names Windows cannot create.
 * Both paths and keys are case-insensitive on Windows, so each has a spelling (kept for display,
 * taken from the layer that wins) and a match form (lowercase, used for every comparison).
 */

import { LayerError, type RegistryRoot, type RegistryValue } from "./types.ts";

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const FORBIDDEN = /[<>:"|?*]/;

/** Characters below space: never part of a name Windows can create. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 0x20) return true;
  return false;
}

/** A layer path as the box stores it: `/`-separated, relative, no empty or dot segments. */
export function normalizePath(path: string): string {
  const raw = path.replace(/\\/g, "/");
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    throw new LayerError(`"${path}" is absolute; layer paths are relative`);
  }
  const segments = raw.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0) throw new LayerError(`"${path}" names no file`);
  for (const segment of segments) {
    if (segment === "..") throw new LayerError(`"${path}" climbs out of the box`);
    if (FORBIDDEN.test(segment) || hasControl(segment)) {
      throw new LayerError(`"${path}" has a character Windows does not allow in a name`);
    }
    if (/[. ]$/.test(segment)) {
      throw new LayerError(`"${path}" has a name ending in a dot or space, which Windows drops`);
    }
    if (RESERVED.test(segment)) throw new LayerError(`"${path}" uses the reserved device name "${segment}"`);
  }
  return segments.join("/");
}

/** How two paths are compared: Windows ignores case. */
export function pathKey(normalized: string): string {
  return normalized.toLowerCase();
}

/** Every folder above a path, nearest last: `a/b/c` gives `a`, `a/b`. */
export function ancestors(normalized: string): string[] {
  const segments = normalized.split("/");
  return segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join("/"));
}

const ROOTS: Record<string, RegistryRoot> = {
  hkcu: "HKCU",
  hkey_current_user: "HKCU",
  hklm: "HKLM",
  hkey_local_machine: "HKLM",
};

/**
 * A registry key as the box stores it: `HKCU\…` or `HKLM\…`, `\`-separated. Only those two roots —
 * the game reads nothing else, and a layer writing anywhere else would be reaching out of the box.
 * A forward slash is a legal character inside a key name, so only `\` separates.
 */
export function normalizeKey(key: string): string {
  const segments = key.split("\\").filter((segment) => segment !== "");
  const root = ROOTS[segments[0]?.toLowerCase() ?? ""];
  if (!root) throw new LayerError(`"${key}" is not under HKCU or HKLM`);
  if (segments.length < 2) throw new LayerError(`"${key}" names a root, not a key`);
  for (const segment of segments.slice(1)) {
    if (segment.includes("\x00")) throw new LayerError(`"${key}" contains a NUL`);
  }
  return [root, ...segments.slice(1)].join("\\");
}

export function keyMatch(normalized: string): string {
  return normalized.toLowerCase();
}

/** Refuses a value the registry could not hold, so a bad layer fails when it is read, not at launch. */
export function checkValue(where: string, value: RegistryValue): void {
  const fail = (why: string): never => {
    throw new LayerError(`${where}: ${why}`);
  };
  switch (value.type) {
    case "sz":
    case "expand_sz":
      if (value.data.includes("\x00")) fail("a string value cannot contain a NUL");
      break;
    case "multi_sz":
      for (const item of value.data) {
        if (item.includes("\x00")) fail("a string list cannot contain a NUL");
        if (item === "") fail("a string list cannot contain an empty string; it would end the list early");
      }
      break;
    case "dword":
      if (!Number.isInteger(value.data) || value.data < 0 || value.data > 0xffffffff) fail("a dword is 0–4294967295");
      break;
    case "qword":
      if (!/^\d+$/.test(value.data) || BigInt(value.data) > 0xffffffffffffffffn) {
        fail("a qword is a decimal string, 0–2^64−1");
      }
      break;
    case "binary":
      if (!/^([0-9a-f]{2})*$/.test(value.data)) fail("binary data is lowercase hex, two digits per byte");
      break;
  }
}
