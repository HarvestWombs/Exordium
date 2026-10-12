/**
 * Cores from HarvestLabs' own host: the browser's Cores tab and setup's second step.
 *
 * Exordium ships no game files. Cores are per-version Blizzard files (the DLLs, `Patch_D2.mpq` and
 * `Game.exe`) kept in the HarvestWombs/Exordium-Cores repository (moved off Google Drive 2026-10-11).
 * Its workflow zips each core folder and publishes a release with a catalog, `cores.json`, which
 * lists each zip with its size, SHA-256 and download link.
 * A zip holds one folder named for the version, e.g. `1.10/`.
 *
 * Installing downloads the zip, checks it against the catalog, unpacks it in the library and
 * moves the folder into `cores/<name>`. Zips are named as mods name cores (`1.10f`, not `1.10`).
 * Like mods, a core is never installed over one that exists. 1.14 cores are the install itself
 * (Blizzard's installer provides them), so they are listed but not installed here.
 */

import { isSingleExeCore, LIBRARY_FOLDERS } from "@exordium/d2se";
import { extract } from "./install.ts";

/**
 * The catalog, `cores.json` in the cores repository's latest release; pushing a change to a core
 * folder there publishes a new one. `EXORDIUM_CORES_URL` overrides it (tests, a mirror; a Drive share
 * link still works, see directUrl).
 */
export const CORES_CATALOG_URL = "https://github.com/HarvestWombs/Exordium-Cores/releases/latest/download/cores.json";

const CATALOG_TTL_MS = 60 * 60 * 1000;

export interface CatalogCore {
  /** Blizzard's name for the patch, as the zip is named: `1.10`. */
  version: string;
  /** The name a mod's `D2Core` uses, and the folder under the library's `cores/`: `1.10f`. */
  core: string;
  file: string;
  size: number;
  sha256: string;
  /**
   * Where to download it, when not beside the catalog. A release's catalog names its own release's
   * zips, so a catalog cached before a newer release still downloads the zips it was hashed from.
   * Google Drive gives every file its own id, so a Drive-hosted catalog lists each zip's link too.
   */
  url?: string;
}

export interface Catalog {
  version: 1;
  cores: CatalogCore[];
}

export interface CoreEntry extends CatalogCore {
  /** `installed`: in the library's `cores/` (or the install's own 1.14). `install`: the install itself. */
  status: "available" | "installed" | "install";
  job: CoreJob | null;
}

export type CoreJobState = "downloading" | "verifying" | "installing" | "installed" | "failed";

export interface CoreJob {
  core: string;
  state: CoreJobState;
  received: number;
  total: number;
  error?: string;
}

const CORE_NAME = /^\d+\.\d+[a-z]?$/i;
const FILE_NAME = /^[\w.-]+\.zip$/i;
const SHA256 = /^[0-9a-f]{64}$/;

/** The catalog's entries that are well formed; anything else is dropped rather than trusted. */
export function parseCatalog(input: unknown): Catalog {
  const list = (input as { cores?: unknown })?.cores;
  if (!Array.isArray(list)) throw new Error("The cores catalog has no list of cores.");
  const cores: CatalogCore[] = [];
  for (const raw of list) {
    const c = raw as Record<string, unknown>;
    if (
      typeof c.version === "string" && CORE_NAME.test(c.version) &&
      typeof c.core === "string" && CORE_NAME.test(c.core) &&
      typeof c.file === "string" && FILE_NAME.test(c.file) &&
      typeof c.size === "number" && Number.isInteger(c.size) && c.size > 0 &&
      typeof c.sha256 === "string" && SHA256.test(c.sha256.toLowerCase())
    ) {
      const entry: CatalogCore = {
        version: c.version,
        core: c.core,
        file: c.file,
        size: c.size,
        sha256: c.sha256.toLowerCase(),
      };
      if (typeof c.url === "string" && /^https:\/\//i.test(c.url)) entry.url = c.url;
      cores.push(entry);
    }
  }
  return { version: 1, cores };
}

function catalogUrl(): string {
  return directUrl(Deno.env.get("EXORDIUM_CORES_URL") ?? CORES_CATALOG_URL);
}

/**
 * A Google Drive share link (`drive.google.com/file/d/<id>/view`, `open?id=`, `uc?id=`) as the
 * address that returns the file itself; anything else unchanged. `confirm=t` skips the page Drive
 * shows instead of a file it has not virus-scanned.
 */
export function directUrl(url: string): string {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!/(^|\.)drive\.google\.com$|^drive\.usercontent\.google\.com$/i.test(parsed.hostname)) return url;
  const id = /\/file\/d\/([\w-]+)/.exec(parsed.pathname)?.[1] ?? parsed.searchParams.get("id");
  if (!id || !/^[\w-]+$/.test(id)) return url;
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

let cached: { url: string; at: number; catalog: Catalog } | null = null;

/** The catalog, fetched at most hourly; null while no host is set. */
export async function catalog(refresh = false): Promise<Catalog | null> {
  const url = catalogUrl();
  if (!url) return null;
  if (!refresh && cached?.url === url && Date.now() - cached.at < CATALOG_TTL_MS) return cached.catalog;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`The cores catalog could not be read (${response.status}).`);
  const parsed = parseCatalog(await response.json());
  cached = { url, at: Date.now(), catalog: parsed };
  return parsed;
}

const jobs = new Map<string, CoreJob>();

async function isDir(path: string): Promise<boolean> {
  return (await Deno.stat(path).catch(() => null))?.isDirectory ?? false;
}

/**
 * Each catalog core with whether this install has it, and its install job if one ran. A 1.14
 * single-exe core is left out: it is the install itself, adds nothing a 1.13c core does not, and is
 * not offered here (2026-10-06). The code that can still launch one is untouched.
 */
export async function coreEntries(root: string | null, list: Catalog, _rootCore: string | null): Promise<CoreEntry[]> {
  const entries: CoreEntry[] = [];
  for (const c of list.cores) {
    if (isSingleExeCore(c.core)) continue;
    let status: CoreEntry["status"] = "available";
    if (root && await isDir(`${root}/${LIBRARY_FOLDERS.cores}/${c.core}`)) status = "installed";
    entries.push({
      ...c,
      status,
      job: jobs.get(c.core.toLowerCase()) ?? null,
    });
  }
  return entries;
}

export class CoreInstallError extends Error {
  override name = "CoreInstallError";
}

/**
 * Starts installing `core` into the library's `cores` folder. Refuses a 1.14 core, a core already
 * there, a root that is not the library, and a second install of the same core at once.
 */
export async function startCoreInstall(root: string, core: string, downloads: string): Promise<CoreJob> {
  const list = await catalog();
  const entry = list?.cores.find((c) => c.core.toLowerCase() === core.toLowerCase());
  if (!entry) throw new CoreInstallError(`No core ${core} in the catalog.`);
  if (isSingleExeCore(entry.core)) {
    throw new CoreInstallError(`${entry.core} is the Diablo II install itself; Blizzard's installer provides it.`);
  }
  const coresDir = `${root}/${LIBRARY_FOLDERS.cores}`;
  if (!(await isDir(coresDir))) throw new CoreInstallError(`No cores folder in ${root}: run setup first.`);
  const target = `${coresDir}/${entry.core}`;
  if (await isDir(target)) throw new CoreInstallError(`Core ${entry.core} is already installed.`);
  const key = entry.core.toLowerCase();
  const running = jobs.get(key);
  if (running && running.state !== "installed" && running.state !== "failed") return running;

  const job: CoreJob = { core: entry.core, state: "downloading", received: 0, total: entry.size };
  jobs.set(key, job);
  const url = entry.url ? directUrl(entry.url) : new URL(entry.file, catalogUrl()).href;
  void runInstall(job, entry, url, root, target, `${downloads}/cores`);
  return job;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function runInstall(job: CoreJob, entry: CatalogCore, url: string, root: string, target: string, folder: string) {
  const archive = `${folder}/${entry.file}`;
  const staging = `${root}/.exordium-staging/core-${entry.core}`;
  try {
    await Deno.mkdir(folder, { recursive: true });
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`The download failed (${response.status}).`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
      job.received += chunk.length;
      if (job.received > entry.size) throw new Error("The download is larger than the catalog says.");
    }
    job.state = "verifying";
    const bytes = new Uint8Array(job.received);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    if (bytes.length !== entry.size || await sha256Hex(bytes) !== entry.sha256) {
      throw new Error("The download does not match the catalog's checksum; nothing was installed.");
    }
    await Deno.writeFile(archive, bytes);

    job.state = "installing";
    await Deno.remove(staging, { recursive: true }).catch(() => {});
    await extract(archive, staging);
    const unpacked = `${staging}/${entry.version}`;
    if (!(await isDir(unpacked))) throw new Error(`The zip has no ${entry.version} folder.`);
    if (await isDir(target)) throw new Error(`Core ${entry.core} appeared while installing; left as it was.`);
    await Deno.rename(unpacked, target);
    job.state = "installed";
    await Deno.remove(archive).catch(() => {});
  } catch (error) {
    job.state = "failed";
    job.error = (error as Error).message;
  } finally {
    await Deno.remove(staging, { recursive: true }).catch(() => {});
    // The shared staging folder goes too once empty; a mod being unpacked keeps it.
    await Deno.remove(`${root}/.exordium-staging`).catch(() => {});
  }
}

/**
 * Writes `cores.json` for the zips in `folder`, to upload beside them. Returns the catalog. Download
 * links already in an existing `cores.json` (Drive's per-file links) are kept for zips of the same name.
 */
export async function writeCatalog(folder: string): Promise<Catalog> {
  const links = new Map<string, string>();
  try {
    for (const c of parseCatalog(JSON.parse(await Deno.readTextFile(`${folder}/cores.json`))).cores) {
      if (c.url) links.set(c.file.toLowerCase(), c.url);
    }
  } catch {
    // No catalog yet.
  }
  const cores: CatalogCore[] = [];
  for await (const entry of Deno.readDir(folder)) {
    const match = entry.isFile ? /^(\d+\.\d+[a-z]?)\.zip$/i.exec(entry.name) : null;
    if (!match) continue;
    const version = match[1]!;
    const bytes = await Deno.readFile(`${folder}/${entry.name}`);
    const core: CatalogCore = {
      version,
      core: version,
      file: entry.name,
      size: bytes.length,
      sha256: await sha256Hex(bytes),
    };
    const link = links.get(entry.name.toLowerCase());
    if (link) core.url = link;
    cores.push(core);
  }
  const order = (v: string) => v.replace(/\d+/g, (n) => n.padStart(3, "0"));
  cores.sort((a, b) => order(a.version).localeCompare(order(b.version)));
  const result: Catalog = { version: 1, cores };
  await Deno.writeTextFile(`${folder}/cores.json`, JSON.stringify(result, null, 2) + "\n");
  return result;
}

if (import.meta.main) {
  const folder = (Deno.args[0] ?? "Cores").replace(/\\/g, "/");
  const written = await writeCatalog(folder);
  console.log(`Wrote ${folder}/cores.json: ${written.cores.length} cores.`);
}
