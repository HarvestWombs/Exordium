/**
 * Unpacking a downloaded mod into the install's `MODS` folder.
 *
 * Archives are extracted with 7-Zip, which reads everything: the copy Exordium ships
 * (`native/7zip`, 7z.exe and 7z.dll; decided 2026-10-14 so every machine unpacks the same way), else
 * an installed 7-Zip, else Windows' own `tar.exe` (bsdtar/libarchive, in System32 since Windows 10
 * 1803). Windows builds that tar without LZMA ("LZMA codec is unsupported"), and nearly every real
 * `.7z` is LZMA/LZMA2, so only the last resort cannot read a 7z. Both run without a console window (native.ts). A mod is a folder
 * holding `D2SE_SETUP.ini` or `exordium.mod.json`, however deep the archive put it. An archive that
 * only holds another archive is unpacked once more. Installing never overwrites: a mod folder that
 * already exists in `MODS` is reported and left alone.
 */

import { machineSnapshot } from "@exordium/registry";
import { runHidden } from "./native.ts";

const EXTRACTABLE = /\.(zip|7z|rar|tar|tgz|gz|bz2|xz)$/i;
const MARKERS = ["d2se_setup.ini", "exordium.mod.json"];
const MAX_DEPTH = 4;

export class InstallError extends Error {
  override name = "InstallError";
}

export function canExtract(file: string): boolean {
  return EXTRACTABLE.test(file);
}

function tarPath(): string {
  return `${Deno.env.get("SystemRoot") ?? "C:\\Windows"}\\System32\\tar.exe`;
}

/**
 * 7-Zip's console program: Exordium's own copy first (beside the packaged exe in `native/7zip`, or
 * the repository's `native/7zip` in development), then an installed 7-Zip from its registry key or
 * the usual folders; null when there is none.
 */
export async function sevenZipPath(): Promise<string | null> {
  const candidates: string[] = [];
  const exe = Deno.execPath().replaceAll("\\", "/");
  const packaged = !/(^|\/)deno(\.exe)?$/i.test(exe);
  candidates.push(
    packaged
      ? `${exe.replace(/\/[^/]*$/, "")}/native/7zip/7z.exe`
      : decodeURIComponent(new URL("../../native/7zip/7z.exe", import.meta.url).pathname).replace(/^\/([a-z]:)/i, "$1"),
  );
  try {
    for (const key of ["HKLM\\SOFTWARE\\7-Zip", "HKCU\\Software\\7-Zip"]) {
      for (const entry of (await machineSnapshot([key])).entries) {
        if ("value" in entry && entry.name.toLowerCase() === "path" && entry.value.type === "sz") {
          candidates.push(`${entry.value.data.replace(/[\\/]+$/, "")}\\7z.exe`);
        }
      }
    }
  } catch {
    // No registry access: the folders below still apply.
  }
  for (const base of [Deno.env.get("ProgramFiles"), Deno.env.get("ProgramFiles(x86)"), Deno.env.get("ProgramW6432")]) {
    if (base) candidates.push(`${base}\\7-Zip\\7z.exe`);
  }
  for (const path of candidates) {
    if ((await Deno.stat(path).catch(() => null))?.isFile) return path;
  }
  return null;
}

const win = (path: string) => path.replace(/\//g, "\\");

/** Extracts `archive` into `into` (created), with 7-Zip when installed, else Windows' tar. */
export async function extract(archive: string, into: string): Promise<void> {
  await Deno.mkdir(into, { recursive: true });
  const name = archive.split(/[\\/]/).pop();
  const sevenZip = await sevenZipPath();
  if (sevenZip) {
    // x: keep folders; -y: answer yes; -bso0 -bsp0: no output. Exit 1 is warnings only.
    const code = await runHidden(sevenZip, ["x", "-y", "-bso0", "-bsp0", `-o${win(into)}`, win(archive)]);
    if (code > 1) throw new InstallError(`Could not unpack ${name} (7-Zip exited with ${code}).`);
    return;
  }
  if (/\.7z$/i.test(archive)) {
    throw new InstallError(
      `${name} is a 7z archive, which needs 7-Zip: Windows' own unpacker cannot read LZMA. Install 7-Zip (7-zip.org) and try again.`,
    );
  }
  const code = await runHidden(tarPath(), ["-xf", win(archive), "-C", win(into)]);
  if (code !== 0) throw new InstallError(`Could not unpack ${name} (tar exited with ${code}).`);
}

/**
 * The shallowest folders under `root` that hold a mod marker. Links are never followed. Several at
 * the same depth are all mods: some archives carry more than one.
 */
export async function findMods(root: string): Promise<string[]> {
  let level = [root];
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const found: string[] = [];
    const next: string[] = [];
    for (const folder of level) {
      const names: string[] = [];
      for await (const entry of Deno.readDir(folder)) {
        if (entry.isSymlink) continue;
        if (entry.isFile) names.push(entry.name.toLowerCase());
        else if (entry.isDirectory) next.push(`${folder}/${entry.name}`);
      }
      if (MARKERS.some((marker) => names.includes(marker))) found.push(folder);
    }
    if (found.length > 0) return found;
    level = next;
  }
  return [];
}

/** Archives sitting in `root`'s top level (the "zip holding a 7z" case). */
async function nestedArchives(root: string): Promise<string[]> {
  const archives: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    if (entry.isFile && canExtract(entry.name)) archives.push(`${root}/${entry.name}`);
  }
  return archives;
}

export async function copyTree(from: string, to: string): Promise<number> {
  await Deno.mkdir(to, { recursive: true });
  let files = 0;
  for await (const entry of Deno.readDir(from)) {
    if (entry.isSymlink) continue;
    if (entry.isDirectory) files += await copyTree(`${from}/${entry.name}`, `${to}/${entry.name}`);
    else if (entry.isFile) {
      await Deno.copyFile(`${from}/${entry.name}`, `${to}/${entry.name}`);
      files++;
    }
  }
  return files;
}

async function countFiles(root: string): Promise<number> {
  let files = 0;
  for await (const entry of Deno.readDir(root)) {
    if (entry.isSymlink) continue;
    if (entry.isDirectory) files += await countFiles(`${root}/${entry.name}`);
    else if (entry.isFile) files++;
  }
  return files;
}

/** Bytes under `root`: what an extraction has written so far. */
async function treeBytes(root: string): Promise<number> {
  let bytes = 0;
  try {
    for await (const entry of Deno.readDir(root)) {
      if (entry.isSymlink) continue;
      const path = `${root}/${entry.name}`;
      if (entry.isDirectory) bytes += await treeBytes(path);
      else if (entry.isFile) bytes += (await Deno.stat(path).catch(() => null))?.size ?? 0;
    }
  } catch {
    // Not there yet, or changing under us: the next poll counts again.
  }
  return bytes;
}

/**
 * Moves a folder, instantly when both ends are on one drive (a rename), otherwise by copying and
 * deleting. Returns how many files it holds.
 */
async function moveTree(from: string, to: string): Promise<number> {
  try {
    await Deno.rename(from, to);
    return await countFiles(to);
  } catch {
    const files = await copyTree(from, to);
    await Deno.remove(from, { recursive: true }).catch(() => {});
    return files;
  }
}

/** A folder name Windows accepts, from an archive's own folder name or a title. */
export function folderName(name: string): string {
  const printable = [...name].map((char) => (char.charCodeAt(0) < 32 ? " " : char)).join("");
  const cleaned = printable.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return cleaned || "Mod";
}

export interface InstallResult {
  installed: { name: string; path: string; files: number }[];
  /** Where the archive was unpacked, when no mod was found in it: the files are kept there. */
  unpacked: string | null;
  skipped: { name: string; reason: string }[];
}

export interface InstallOptions {
  /** How many bytes the archive unpacks to, when known (from the source's listing): drives progress. */
  expectedBytes?: number;
  /** Called about twice a second while extracting, with bytes written so far. */
  onExtract?: (written: number, expected: number) => void;
  /** Called as each mod folder is moved into MODS. */
  onInstall?: (name: string) => void;
  /** Where to keep the unpacked files when the archive holds no mod. Default: leave them in workDir. */
  keepDir?: string;
}

/**
 * Unpacks `archive` into `workDir` and moves every mod found into `modsDir`. Put `workDir` on the same
 * drive as `modsDir` and the move is a rename. When the archive holds no mod its files are kept (in
 * `keepDir` when given) for the player to look at. Never overwrites a mod folder.
 */
export async function installArchive(
  archive: string,
  workDir: string,
  modsDir: string,
  titleForLooseFiles: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  if (!canExtract(archive)) {
    throw new InstallError(
      `${archive.split(/[\\/]/).pop()} is not an archive Exordium can unpack; run or open it yourself.`,
    );
  }
  await Deno.remove(workDir, { recursive: true }).catch(() => {});
  const expected = options.expectedBytes ?? 0;
  let polling = true;
  const poll = (async () => {
    while (polling) {
      options.onExtract?.(await treeBytes(workDir), expected);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  })();
  try {
    await extract(archive, workDir);
    let mods = await findMods(workDir);
    if (mods.length === 0) {
      for (const inner of await nestedArchives(workDir)) {
        await extract(inner, `${inner}.unpacked`);
      }
      mods = await findMods(workDir);
    }
    polling = false;
    await poll;
    options.onExtract?.(await treeBytes(workDir), expected);

    if (mods.length === 0) {
      if (!options.keepDir) return { installed: [], unpacked: win(workDir), skipped: [] };
      await Deno.remove(options.keepDir, { recursive: true }).catch(() => {});
      await Deno.mkdir(options.keepDir.slice(0, options.keepDir.lastIndexOf("/")), { recursive: true });
      await moveTree(workDir, options.keepDir);
      return { installed: [], unpacked: win(options.keepDir), skipped: [] };
    }

    const result: InstallResult = { installed: [], unpacked: null, skipped: [] };
    for (const mod of mods) {
      // Files straight at the archive's top: the folder is named after the title instead.
      const name = folderName(mod === workDir ? titleForLooseFiles : mod.split("/").pop()!);
      const target = `${modsDir}/${name}`;
      const exists = await Deno.stat(target).then(() => true).catch(() => false);
      if (exists) {
        result.skipped.push({ name, reason: `MODS\\${name} already exists; it was left as it is.` });
        continue;
      }
      options.onInstall?.(name);
      const files = mod === workDir ? await copyTree(mod, target) : await moveTree(mod, target);
      result.installed.push({ name, path: win(target), files });
    }
    await Deno.remove(workDir, { recursive: true }).catch(() => {});
    return result;
  } finally {
    polling = false;
    await poll;
  }
}
