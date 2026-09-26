/**
 * A box's identity as a hash — what makes two installations comparable.
 *
 * The writable layers are left out on purpose: they hold one player's saves and settings, which
 * differ between any two players running the identical mod. What remains is what the library
 * supplies, which is exactly what "are we running the same thing" means.
 *
 * - `files` is the one a mod's community can publish and a player can check against before
 *   wondering why they desync on a private realm.
 * - `registry` covers the read-only settings, including the profile's own choices (renderer,
 *   resolution), so it is useful for reusing a realised box, not for comparing players.
 */

import type { Plan, RegistryValue, Stack } from "./types.ts";
import { keyMatch, pathKey } from "./names.ts";
import { resolve } from "./resolve.ts";

export interface Fingerprint {
  files: string;
  registry: string;
  /** Both together: identical only when every read-only file and value is. */
  combined: string;
}

export async function fingerprint(stack: Stack): Promise<Fingerprint> {
  const plan = resolve({
    files: stack.files.filter((layer) => layer.role !== "writable"),
    registry: stack.registry.filter((layer) => layer.role !== "writable"),
  });
  const files = await sha256(canonicalFiles(plan));
  const registry = await sha256(canonicalRegistry(plan));
  return { files, registry, combined: await sha256(`files:${files}\nregistry:${registry}\n`) };
}

/**
 * One line per file, in plan order. Names are compared as Windows compares them, so the spelling
 * is not part of the identity — two copies differing only in case are the same install.
 */
function canonicalFiles(plan: Plan): string {
  return plan.files.map((file) => `${pathKey(file.path)}\t${file.hash}\t${file.size}\n`).join("");
}

/** Key and name ignore case, as Windows does; the value itself does not. */
function canonicalRegistry(plan: Plan): string {
  return plan.registry
    .map((entry) => `${keyMatch(entry.key)}\t${entry.name.toLowerCase()}\t${canonicalValue(entry.value)}\n`)
    .join("");
}

function canonicalValue(value: RegistryValue): string {
  return `${value.type}\t${JSON.stringify(value.data)}`;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
