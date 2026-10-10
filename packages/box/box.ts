/**
 * Building, reusing, checking and removing boxes.
 *
 * Laid out beside the library, in Exordium's own folder:
 *
 *   <root>/boxes/<id>/game/       the folder the game runs in
 *   <root>/boxes/<id>/box.json    what it contains
 *
 * A box is always built beside the old one and swapped in only once complete, so a failed build
 * leaves the previous box untouched. Nothing here writes outside `<root>/boxes`, except creating a
 * mod's empty save folder when D2SE never has.
 *
 * **Characters are the one thing that must never be lost.** A box's `save` is a junction to the
 * mod's real save folder. Deletes never enter a link (see removeOwnTree), the junction is still
 * removed on its own first, and every delete is confined to the boxes
 * folder, so a mistake elsewhere cannot reach a player's saves.
 */

import { crypto } from "@std/crypto";
import { hashFile } from "@exordium/d2se";
import type { Plan, ResolvedFile } from "@exordium/layers";
import {
  type AfterRun,
  BoxError,
  type BoxFile,
  type BoxSpec,
  type BoxState,
  type FolderLink,
  type IntegrityReport,
  type LinkMode,
  type Realised,
  type RealiseOptions,
} from "./types.ts";

const ID = /^[a-z0-9][a-z0-9.@-]*$/;
const SAVE = "save";
const DEFAULT_MODES: readonly LinkMode[] = ["symlink", "hardlink"];

/** Plugins keep their settings in `.ini` files and some rewrite them; a protected one is copied. */
const SETTINGS = /\.ini$/i;

export class Boxes {
  readonly root: string;

  private constructor(exordiumRoot: string) {
    this.root = `${exordiumRoot.replace(/\\/g, "/").replace(/\/+$/, "")}/boxes`;
  }

  /** `exordiumRoot` is Exordium's own data folder, where the library also lives. */
  static async open(exordiumRoot: string): Promise<Boxes> {
    const boxes = new Boxes(exordiumRoot);
    await Deno.mkdir(boxes.root, { recursive: true });
    return boxes;
  }

  folder(id: string): string {
    if (!ID.test(id)) throw new BoxError(`"${id}" is not a valid box id`);
    return `${this.root}/${id}`;
  }

  async state(id: string): Promise<BoxState | null> {
    try {
      return JSON.parse(await Deno.readTextFile(`${this.folder(id)}/box.json`)) as BoxState;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return null;
      throw error;
    }
  }

  async realise(spec: BoxSpec, options: RealiseOptions = {}): Promise<Realised> {
    const folder = this.folder(spec.id);
    const game = `${folder}/game`;
    const previous = await this.state(spec.id);
    const learned = new Set((previous?.learnedCopy ?? []).map((p) => p.toLowerCase()));
    const copy = (path: string) => learned.has(path.toLowerCase()) || SETTINGS.test(path);
    const sources = spec.plan.files.map((file) => {
      const source = spec.source(file);
      return { file, source, protected: spec.protect?.(file, source) ?? false };
    });
    const folderLinks = [...(spec.folders ?? [])];
    const digest = await planDigest(
      spec.plan,
      spec.saves,
      [...learned].sort(),
      sources.filter((s) => s.protected).map((s) => s.file.path.toLowerCase()),
      folderLinks,
    );

    const counts: Record<LinkMode, number> = { hardlink: 0, symlink: 0, copy: 0 };
    if (previous && previous.digest === digest && await intact(game, previous)) {
      await this.sweep(folder); // what an earlier swap could not delete yet
      for (const file of previous.files) counts[file.mode]++;
      return { folder: game, reused: true, counts, notes: [] };
    }

    for (const file of spec.plan.files) {
      if (file.path.toLowerCase() === SAVE || file.path.toLowerCase().startsWith(`${SAVE}/`)) {
        throw new BoxError(`"${file.path}" is inside save${"\\"}, which belongs to the player's own save folder`);
      }
      const inside = folderLinks.find((link) => under(file.path, link.path));
      if (inside) throw new BoxError(`"${file.path}" is inside ${inside.path}, which is linked whole`);
    }
    for (const link of folderLinks) {
      if (under(link.path, SAVE) || link.path.includes("..")) throw new BoxError(`"${link.path}" cannot be linked`);
    }

    await Deno.mkdir(folder, { recursive: true });
    const building = `${folder}/game.${crypto.randomUUID()}.building`;
    const notes = new Set<string>();
    // A mode that failed for a source drive fails for every file on it; stop asking.
    const failed = new Map<string, Set<LinkMode>>();
    const files: BoxFile[] = [];
    try {
      await Deno.mkdir(building);
      for (const { file, source, protected: guarded } of sources) {
        const dest = `${building}/${file.path}`;
        await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
        const modes = guarded && copy(file.path) ? (["copy"] as const) : (options.modes ?? DEFAULT_MODES);
        const drive = driveOf(source);
        const mode = await place(source, dest, modes, failed.get(drive) ?? new Set(), (m, why) => {
          if (!failed.has(drive)) failed.set(drive, new Set());
          failed.get(drive)!.add(m);
          notes.add(`${m} is not available for files on ${drive} (${why}); used the next option`);
        });
        counts[mode]++;
        const info = await Deno.stat(source);
        files.push({
          path: file.path,
          mode,
          source,
          protected: guarded,
          hash: file.hash,
          size: info.size,
          mtime: info.mtime?.getTime() ?? null,
        });
      }
      if (spec.saves) {
        await Deno.mkdir(spec.saves, { recursive: true });
        await Deno.symlink(spec.saves, `${building}/${SAVE}`, { type: "junction" });
      }
      for (const link of folderLinks) {
        const dest = `${building}/${link.path}`;
        await Deno.mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
        await Deno.symlink(link.target, dest, { type: "junction" });
      }
    } catch (error) {
      await this.removeTree(building);
      throw error;
    }

    // Swap by renames, deleting last: a delete can fail on a handle something else holds (antivirus
    // scanning the old files, a window still open on the folder), and that must never leave a
    // half-deleted box. The old folder is moved aside, the new one in, and the old one swept.
    const retired = `${folder}/game.${crypto.randomUUID()}.old`;
    try {
      await Deno.rename(game, retired);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        await this.removeTree(building);
        throw new BoxError(`The box for "${spec.id}" is in use and cannot be replaced: ${(error as Error).message}`);
      }
    }
    await Deno.rename(building, game);
    await this.sweep(folder);
    await writeJson(
      `${folder}/box.json`,
      {
        id: spec.id,
        digest,
        realisedAt: new Date().toISOString(),
        files,
        saves: spec.saves,
        folders: folderLinks,
        learnedCopy: previous?.learnedCopy ?? [],
      } satisfies BoxState,
    );
    return { folder: game, reused: false, counts, notes: [...notes] };
  }

  /** Checks that an existing box still matches the plan and bytes it was built from. */
  async verify(spec: BoxSpec): Promise<IntegrityReport> {
    const state = await this.state(spec.id);
    if (!state) throw new BoxError(`No box "${spec.id}"`);
    const game = `${this.folder(spec.id)}/game`;
    const sources = spec.plan.files.map((file) => {
      const source = spec.source(file);
      return { file, source, protected: spec.protect?.(file, source) ?? false };
    });
    const learned = state.learnedCopy ?? [];
    const folderLinks = [...(spec.folders ?? [])];
    const expectedDigest = await planDigest(
      spec.plan,
      spec.saves,
      learned,
      sources.filter((s) => s.protected).map((s) => s.file.path.toLowerCase()),
      folderLinks,
    );
    const issues: IntegrityReport["issues"] = [];
    let checkedHashes = 0;

    if (state.digest !== expectedDigest) {
      issues.push({
        path: "box.json",
        level: "error",
        kind: "digest",
        message: "The box was built from a different plan and should be rebuilt.",
      });
    }

    const expected = new Map(sources.map(({ file }) => [file.path.toLowerCase(), file]));
    for (const { file, source } of sources) {
      const path = `${game}/${file.path}`;
      let info: Deno.FileInfo;
      try {
        info = await Deno.lstat(path);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          issues.push({ path: file.path, level: "error", kind: "missing", message: "Missing from the box." });
          continue;
        }
        throw error;
      }
      if (info.isSymlink) {
        if (!samePath(await Deno.realPath(path).catch(() => null), await Deno.realPath(source).catch(() => null))) {
          issues.push({
            path: file.path,
            level: "error",
            kind: "link",
            message: "Link no longer points to its source.",
          });
        }
        continue;
      }
      if (info.size !== file.size) {
        issues.push({
          path: file.path,
          level: "error",
          kind: "size",
          message: `Expected ${file.size} bytes, found ${info.size}.`,
        });
        continue;
      }
      checkedHashes++;
      const actual = await hashFile(path);
      if (actual !== file.hash) {
        issues.push({ path: file.path, level: "error", kind: "hash", message: "Content hash does not match." });
      }
    }

    for (const link of folderLinks) {
      const path = `${game}/${link.path}`;
      try {
        const info = await Deno.lstat(path);
        if (!info.isSymlink) {
          issues.push({
            path: link.path,
            level: "error",
            kind: "folder-link",
            message: "Folder junction was replaced.",
          });
        } else if (
          !samePath(await Deno.realPath(path).catch(() => null), await Deno.realPath(link.target).catch(() => null))
        ) {
          issues.push({
            path: link.path,
            level: "error",
            kind: "folder-link",
            message: "Folder junction points elsewhere.",
          });
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          issues.push({ path: link.path, level: "error", kind: "folder-link", message: "Folder junction is missing." });
        } else throw error;
      }
    }

    if (spec.saves) {
      try {
        if (!(await Deno.lstat(`${game}/${SAVE}`)).isSymlink) {
          issues.push({ path: SAVE, level: "error", kind: "folder-link", message: "Save junction was replaced." });
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          issues.push({ path: SAVE, level: "error", kind: "folder-link", message: "Save junction is missing." });
        } else throw error;
      }
    }

    const known = new Set([...(state.files ?? []), ...(state.folders ?? [])].map((f) => f.path.toLowerCase()));
    for await (const path of walkOwn(game)) {
      const key = path.toLowerCase();
      if (key === SAVE || expected.has(key) || known.has(key)) continue;
      issues.push({
        path,
        level: "warning",
        kind: "unexpected",
        message: "Created inside the box; not part of the plan.",
      });
    }

    return {
      ok: !issues.some((issue) => issue.level === "error"),
      checkedFiles: spec.plan.files.length,
      checkedHashes,
      expectedDigest,
      actualDigest: state.digest,
      issues,
    };
  }

  /**
   * After the game exits: which linked files changed at their source, which links the game replaced
   * with files of its own, which copies changed, and what the run created. Cheap: sizes and
   * timestamps are compared first, and only a file that looks changed is re-hashed.
   *
   * A write through a link to a **protected** (pinned) source is learned, so that path is copied from
   * then on; one to a referenced mod is only reported, since D2SE writes there too. A replaced link or
   * a changed copy makes the next launch rebuild the box, so it starts again from the plan.
   */
  async afterRun(id: string): Promise<AfterRun> {
    const state = await this.state(id);
    if (!state) throw new BoxError(`No box "${id}"`);
    const game = `${this.folder(id)}/game`;
    const result: AfterRun = { writtenThrough: [], changedCopies: [], replaced: [], newFiles: [] };
    const stat = async (path: string) => {
      try {
        return await Deno.stat(path);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null;
        throw error;
      }
    };
    const changed = async (info: Deno.FileInfo | null, path: string, file: BoxFile) =>
      info === null ||
      ((info.size !== file.size || (info.mtime?.getTime() ?? null) !== file.mtime) &&
        (await hashFile(path)) !== file.hash);

    for (const file of state.files) {
      const inBox = `${game}/${file.path}`;
      if (file.mode === "copy") {
        const info = await stat(inBox);
        if (info === null || info.size !== file.size || (await hashFile(inBox)) !== file.hash) {
          result.changedCopies.push(file.path);
        }
        continue;
      }
      const source = await stat(file.source);
      if (await changed(source, file.source, file)) {
        result.writtenThrough.push({ path: file.path, source: file.source, protected: file.protected });
      }
      // A link the game replaced: a symlink that is no longer a link, or a hardlink that no longer
      // looks like its source.
      let own: Deno.FileInfo | null = null;
      try {
        own = await Deno.lstat(inBox);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
      const replaced = own === null ||
        (file.mode === "symlink"
          ? !own.isSymlink
          : source !== null && (own.size !== source.size || own.mtime?.getTime() !== source.mtime?.getTime()));
      if (replaced) result.replaced.push(file.path);
    }

    const known = new Set([...state.files, ...(state.folders ?? [])].map((f) => f.path.toLowerCase()));
    for await (const path of walkOwn(game)) {
      if (path.toLowerCase() === SAVE) continue;
      if (!known.has(path.toLowerCase())) result.newFiles.push(path);
    }

    const learn = result.writtenThrough.filter((w) => w.protected).map((w) => w.path);
    const rebuild = result.replaced.length > 0 || result.changedCopies.length > 0;
    if (learn.length > 0 || rebuild) {
      await writeJson(`${this.folder(id)}/box.json`, {
        ...state,
        learnedCopy: [...new Set([...state.learnedCopy, ...learn])].sort(),
        // An empty digest never matches, so the next realise rebuilds from the plan.
        digest: rebuild ? "" : state.digest,
      });
    }
    return result;
  }

  /** Deletes a box. Links go, their targets stay: a referenced mod, the store and the saves are untouched. */
  async remove(id: string): Promise<void> {
    await this.removeTree(this.folder(id));
  }

  /**
   * Deletes what earlier swaps left behind in a box's folder — retired `game.*.old` folders and
   * abandoned `game.*.building` ones. Best effort: whatever is still held is tried again next time.
   */
  private async sweep(folder: string): Promise<void> {
    for await (const entry of Deno.readDir(folder)) {
      if (!entry.isDirectory || !/^game\..+\.(old|building)$/.test(entry.name)) continue;
      await this.removeTree(`${folder}/${entry.name}`).catch(() => {});
    }
  }

  /**
   * Removes a folder inside the boxes folder, and nothing else. The save junction is removed on its
   * own first; then removeOwnTree, which never enters a link.
   */
  private async removeTree(path: string): Promise<void> {
    const normal = path.replace(/\\/g, "/");
    if (!normal.toLowerCase().startsWith(`${this.root.toLowerCase()}/`)) {
      throw new BoxError(`Refusing to delete ${path}: it is outside ${this.root}`);
    }
    try {
      await Deno.lstat(normal);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return;
      throw error;
    }
    for (const candidate of [`${normal}/${SAVE}`, `${normal}/game/${SAVE}`]) {
      try {
        if ((await Deno.lstat(candidate)).isSymlink) await Deno.remove(candidate);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    }
    await removeOwnTree(normal);
  }
}

/**
 * Deletes a folder, removing each link as a link and never entering it. Deno's recursive delete is
 * not used: on a tree of file symlinks into another drive it fails with "being used by another
 * process" (os error 32), which left a dead `game.*.old` copy behind every rebuild, while deleting
 * the same entries one by one succeeds.
 */
async function removeOwnTree(path: string): Promise<void> {
  const leaves: string[] = [];
  for await (const entry of Deno.readDir(path)) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory && !entry.isSymlink) await removeOwnTree(child);
    else leaves.push(child);
  }
  for (let i = 0; i < leaves.length; i += 64) {
    await Promise.all(leaves.slice(i, i + 64).map((leaf) => Deno.remove(leaf)));
  }
  await Deno.remove(path);
}

/** Places one file with the first mode that works, reporting any mode that failed. */
async function place(
  source: string,
  dest: string,
  modes: readonly LinkMode[],
  skip: ReadonlySet<LinkMode>,
  failed: (mode: LinkMode, why: string) => void,
): Promise<LinkMode> {
  for (const mode of modes) {
    if (skip.has(mode)) continue;
    try {
      if (mode === "hardlink") await Deno.link(source, dest);
      else if (mode === "symlink") await Deno.symlink(source, dest, { type: "file" });
      else await Deno.copyFile(source, dest);
      return mode;
    } catch (error) {
      if (mode === "copy" || error instanceof Deno.errors.NotFound) throw error;
      failed(mode, (error as Error).message.replace(/ \(os error \d+\).*$/s, ""));
    }
  }
  throw new BoxError(`No way to place ${source}`);
}

/** Every link or file in the box, not following links (so never into the saves). */
async function* walkOwn(root: string, prefix = ""): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(prefix ? `${root}/${prefix}` : root)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A link or junction (save, data) is reported as itself and never entered.
    if (entry.isDirectory && !entry.isSymlink) yield* walkOwn(root, path);
    else yield path;
  }
}

/** Whether a box still holds what its state says: every file present at the recorded size. */
async function intact(game: string, state: BoxState): Promise<boolean> {
  try {
    // In batches rather than one by one: a large mod's box holds thousands of links.
    for (let i = 0; i < state.files.length; i += 64) {
      const checks = await Promise.all(
        state.files.slice(i, i + 64).map(async (file) => {
          const info = await Deno.lstat(`${game}/${file.path}`);
          return file.mode === "symlink" ? info.isSymlink : info.size === file.size;
        }),
      );
      if (checks.includes(false)) return false;
    }
    if (state.saves && !(await Deno.lstat(`${game}/${SAVE}`)).isSymlink) return false;
    for (const link of state.folders ?? []) if (!(await Deno.lstat(`${game}/${link.path}`)).isSymlink) return false;
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

/** Identifies what a box holds: the plan's files, where saves point, and which paths are copied. */
export async function planDigest(
  plan: Plan,
  saves: string | null,
  learned: readonly string[],
  guarded: readonly string[] = [],
  folders: readonly FolderLink[] = [],
): Promise<string> {
  const lines = plan.files.map((f: ResolvedFile) => `${f.path.toLowerCase()}\t${f.hash}\t${f.layer}`);
  const links = folders.map((link) => `${link.path.toLowerCase()}>${link.target.toLowerCase()}`).sort();
  const text = `${lines.join("\n")}\nsaves\t${saves ?? ""}\nlearned\t${learned.join(",")}\nprotected\t${
    guarded.join(",")
  }\n${links.length ? `folders\t${links.join(",")}\n` : ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Whether `path` is `folder` or inside it, ignoring case. */
function under(path: string, folder: string): boolean {
  const p = path.toLowerCase();
  const f = folder.toLowerCase().replace(/\/+$/, "");
  return p === f || p.startsWith(`${f}/`);
}

function driveOf(path: string): string {
  const match = /^([a-zA-Z]:)|^(\/\/[^/]+\/[^/]+)/.exec(path.replace(/\\/g, "/"));
  return (match?.[1] ?? match?.[2] ?? "").toUpperCase();
}

function samePath(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.replace(/\\/g, "/").toLowerCase() === b.replace(/\\/g, "/").toLowerCase();
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temp, JSON.stringify(value, null, 2) + "\n");
  await Deno.rename(temp, path);
}
