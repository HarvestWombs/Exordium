/**
 * The library on disk.
 *
 * Decided 2026-09-25: it lives in `%LOCALAPPDATA%\Exordium` — Local, not Roaming, which syncs with a
 * domain profile and is not for gigabytes. Laid out as plain files a person can read:
 *
 *   <root>/library/entries/<id>.json     one entry each
 *   <root>/library/store/<ab>/<hash>     pinned content, by SHA-256
 *
 * Every write goes to a temporary file first and is renamed into place, so a crash leaves either the
 * old version or the new one, never half of either.
 */

import { type Entry, LibraryError } from "./types.ts";

const ID = /^[a-z0-9][a-z0-9.@-]*$/;

/** `%LOCALAPPDATA%\Exordium`, with `/` separators. */
export function defaultRoot(): string {
  const local = Deno.env.get("LOCALAPPDATA");
  if (!local) throw new LibraryError("LOCALAPPDATA is not set, so there is nowhere to keep the library");
  return `${local.replace(/\\/g, "/")}/Exordium`;
}

export class Library {
  readonly entries: string;
  readonly store: string;

  private constructor(readonly root: string) {
    this.entries = `${root}/library/entries`;
    this.store = `${root}/library/store`;
  }

  static async open(root: string = defaultRoot()): Promise<Library> {
    const library = new Library(root.replace(/\\/g, "/").replace(/\/+$/, ""));
    await Deno.mkdir(library.entries, { recursive: true });
    await Deno.mkdir(library.store, { recursive: true });
    return library;
  }

  async list(): Promise<Entry[]> {
    const entries: Entry[] = [];
    for await (const file of Deno.readDir(this.entries)) {
      if (!file.isFile || !file.name.endsWith(".json")) continue;
      entries.push(await this.read(`${this.entries}/${file.name}`));
    }
    return entries.sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<Entry | null> {
    checkId(id);
    try {
      return await this.read(this.entryPath(id));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return null;
      throw error;
    }
  }

  async save(entry: Entry): Promise<void> {
    checkId(entry.id);
    await writeAtomic(this.entryPath(entry.id), new TextEncoder().encode(JSON.stringify(entry, null, 2) + "\n"));
  }

  /** Forgets an entry. A referenced entry's files are untouched; stored content stays until pruned. */
  async remove(id: string): Promise<boolean> {
    checkId(id);
    try {
      await Deno.remove(this.entryPath(id));
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return false;
      throw error;
    }
  }

  /** Where pinned content with this hash lives. */
  storePath(hash: string): string {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new LibraryError(`"${hash}" is not a SHA-256`);
    return `${this.store}/${hash.slice(0, 2)}/${hash}`;
  }

  private entryPath(id: string): string {
    return `${this.entries}/${id}.json`;
  }

  private async read(path: string): Promise<Entry> {
    try {
      return JSON.parse(await Deno.readTextFile(path)) as Entry;
    } catch (error) {
      if (error instanceof SyntaxError) throw new LibraryError(`${path} is not valid JSON: ${error.message}`);
      throw error;
    }
  }
}

function checkId(id: string): void {
  if (!ID.test(id)) throw new LibraryError(`"${id}" is not a valid entry id`);
}

/** Writes `bytes` to `path` through a temporary file in the same folder, then renames it into place. */
export async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await Deno.writeFile(temp, bytes);
    await Deno.rename(temp, path);
  } catch (error) {
    await Deno.remove(temp).catch(() => {});
    throw error;
  }
}
