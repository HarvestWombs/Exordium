/**
 * Exordium's own updates, from the GitHub releases of `UPDATE_REPO`.
 *
 * A release is tagged `v<version>` and carries one asset, `Exordium-<version>-win-x64.zip`: the
 * packaged app's own files at the zip's root, `exordium-files.json`, which lists each with its size
 * and SHA-256, and `exordium-files.json.sig`, an Ed25519 signature of that list (release.ts writes
 * all three). Before anything is replaced: the zip must match the digest GitHub records for the
 * asset, the list must be signed by a key in RELEASE_PUBLIC_KEYS, and every file must match the list.
 * GitHub's digest proves the download is what was uploaded; the signature proves HarvestLabs made it,
 * so a compromised GitHub account alone cannot ship an update.
 *
 * Exordium is portable: its state (exordium.json, boxes, backups, logs...) lives beside the exe. An
 * update replaces only the files the list names, so nothing else in the folder is touched.
 *
 * Applying swaps each file in place. Windows lets a running exe or a loaded DLL be renamed, so the old
 * one is renamed aside (`*.exordium-old`), the new one moved into its place, and Exordium restarts;
 * the next start deletes what was set aside (sweep). A failed swap puts every file back.
 */

import desktop from "./deno.json" with { type: "json" };
import { extract } from "./install.ts";

export const APP_VERSION: string = desktop.version;

/** Where releases are read from. `EXORDIUM_UPDATE_REPO` overrides it (tests, a fork). */
export const UPDATE_REPO = "HarvestWombs/Exordium";

export const FILE_LIST = "exordium-files.json";
export const SIGNATURE_FILE = "exordium-files.json.sig";

/**
 * The Ed25519 public keys (JWK `x`, base64url) whose signatures an update must carry. The private key
 * lives outside the repository (release.ts, `--keygen`). A new key is added here, released, and only
 * then used to sign; the old one is removed a release later.
 */
export const RELEASE_PUBLIC_KEYS: readonly string[] = [
  // HarvestLabs release key, made 2026-10-10.
  "DcL7G1F76eByyopotsQxRDPEIoyBo0i3xQp5mHYL-fI",
];
const ASSET = /^Exordium-.+-win-x64\.zip$/i;
const OLD = ".exordium-old";
const STAGING = ".exordium-update";

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
  browser_download_url: string;
  /** "sha256:<hex>": GitHub records it for every uploaded asset. */
  digest?: string | null;
}

export interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets: ReleaseAsset[];
}

export interface FileList {
  version: string;
  files: { path: string; size: number; sha256: string }[];
}

export interface AvailableUpdate {
  version: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string | null;
  prerelease: boolean;
  asset: { name: string; size: number; download: string; api: string; sha256: string | null };
}

export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "failed";

/** One release's notes, for the patch notes on the Updates page. */
export interface ReleaseNotes {
  version: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string | null;
  prerelease: boolean;
}

/** How many releases' notes a check keeps. */
const NOTES_KEPT = 10;

/**
 * The newest releases' notes, newest first: drafts never, pre-releases only when asked for, and the
 * running version's own always, so the page can say what the installed version brought.
 */
export function releaseNotes(releases: Release[], current: string, includePrereleases: boolean): ReleaseNotes[] {
  return releases
    .filter((release) => !release.draft && parseVersion(release.tag_name))
    .map((release) => ({ release, version: release.tag_name.replace(/^v/, "") }))
    .filter(({ release, version }) => !release.prerelease || includePrereleases || version === current)
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, NOTES_KEPT)
    .map(({ release, version }) => ({
      version,
      name: release.name?.trim() || `Exordium ${version}`,
      notes: release.body?.trim() ?? "",
      url: release.html_url,
      publishedAt: release.published_at,
      prerelease: release.prerelease,
    }));
}

/**
 * The newest version tag in a repository's releases feed (`releases.atom`), or null. The feed is a
 * plain page, outside the API's 60-an-hour limit, so a running Exordium can look at it often and
 * read the releases from the API only when it names something new.
 */
export function newestFeedTag(atom: string): string | null {
  let newest: string | null = null;
  for (const match of atom.matchAll(/\/releases\/tag\/([^"'<>\s]+)/g)) {
    const tag = decodeURIComponent(match[1]!).replace(/^v/, "");
    if (parseVersion(tag) && (newest === null || compareVersions(tag, newest) > 0)) newest = tag;
  }
  return newest;
}

export interface UpdateState {
  phase: UpdatePhase;
  current: string;
  repo: string;
  checkedAt: string | null;
  update: AvailableUpdate | null;
  /** The newest releases' notes from the last check that reached GitHub. */
  releases: ReleaseNotes[];
  received: number;
  error: string | null;
}

type Version = { core: [number, number, number]; pre: string | null };

/** "v1.2.3" or "1.2.3-beta.1"; null for anything else. */
export function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(text.trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null };
}

/** Semver order: a pre-release sorts before its release; pre-release parts compare as semver says. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i]! - y.core[i]!;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const xs = x.pre.split(".");
  const ys = y.pre.split(".");
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const p = xs[i];
    const q = ys[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && Number(p) !== Number(q)) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** The newest release above `current` that has the app's zip; pre-releases only when asked for. */
export function pickRelease(releases: Release[], current: string, includePrereleases: boolean): AvailableUpdate | null {
  let best: AvailableUpdate | null = null;
  for (const release of releases) {
    if (release.draft || (release.prerelease && !includePrereleases)) continue;
    if (!parseVersion(release.tag_name)) continue;
    const version = release.tag_name.replace(/^v/, "");
    if (compareVersions(version, current) <= 0) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;
    const asset = release.assets.find((a) => ASSET.test(a.name));
    if (!asset) continue;
    const digest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? "")?.[1]?.toLowerCase() ?? null;
    best = {
      version,
      name: release.name?.trim() || `Exordium ${version}`,
      notes: release.body?.trim() ?? "",
      url: release.html_url,
      publishedAt: release.published_at,
      prerelease: release.prerelease,
      asset: {
        name: asset.name,
        size: asset.size,
        download: asset.browser_download_url,
        api: asset.url,
        sha256: digest,
      },
    };
  }
  return best;
}

/** A path from a file list, safe to join under the app folder: relative, no `..`, no drive. */
function safePath(path: string): string | null {
  const clean = path.replace(/\\/g, "/");
  if (!clean || clean.startsWith("/") || /^[a-z]:/i.test(clean)) return null;
  if (clean.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  if (clean.toLowerCase() === FILE_LIST) return null;
  return clean;
}

export function parseFileList(input: unknown): FileList {
  const raw = input as { version?: unknown; files?: unknown };
  if (typeof raw?.version !== "string" || !Array.isArray(raw.files)) {
    throw new UpdateError(`The update's ${FILE_LIST} is not a file list.`);
  }
  const files: FileList["files"] = [];
  for (const file of raw.files as Record<string, unknown>[]) {
    const path = typeof file?.path === "string" ? safePath(file.path) : null;
    if (
      !path || typeof file.size !== "number" || typeof file.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(file.sha256)
    ) {
      throw new UpdateError(`The update's ${FILE_LIST} has a bad entry.`);
    }
    files.push({ path, size: file.size, sha256: file.sha256.toLowerCase() });
  }
  if (files.length === 0) throw new UpdateError(`The update's ${FILE_LIST} lists no files.`);
  return { version: raw.version, files };
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class UpdateError extends Error {
  override name = "UpdateError";
}

async function exists(path: string): Promise<boolean> {
  return await Deno.lstat(path).then(() => true, () => false);
}

export interface UpdaterOptions {
  /** The folder Exordium.exe runs from: what an update replaces files in. */
  appDir: string;
  repo?: string;
  /** For a private repository while testing (`EXORDIUM_UPDATE_TOKEN`); never stored. */
  token?: string | null;
  fetch?: typeof fetch;
  api?: string;
  /** Keys to accept instead of RELEASE_PUBLIC_KEYS (tests). */
  publicKeys?: readonly string[];
}

function base64UrlBytes(text: string): Uint8Array<ArrayBuffer> {
  const plain = text.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const binary = atob(plain + "=".repeat((4 - plain.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Whether `signature` (base64url) is a valid Ed25519 signature of `data` by one of `keys`. */
export async function verifySignature(
  data: Uint8Array<ArrayBuffer>,
  signature: string,
  keys: readonly string[],
): Promise<boolean> {
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = base64UrlBytes(signature.trim());
  } catch {
    return false;
  }
  for (const x of keys) {
    try {
      const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x }, { name: "Ed25519" }, false, [
        "verify",
      ]);
      if (await crypto.subtle.verify({ name: "Ed25519" }, key, sig, data)) return true;
    } catch {
      // A malformed key: try the next.
    }
  }
  return false;
}

export class Updater {
  readonly appDir: string;
  readonly repo: string;
  #token: string | null;
  #fetch: typeof fetch;
  #api: string;
  #keys: readonly string[];
  #state: UpdateState;
  #work: Promise<unknown> | null = null;

  constructor(options: UpdaterOptions) {
    this.appDir = options.appDir.replace(/\\/g, "/").replace(/\/+$/, "");
    this.repo = options.repo ?? UPDATE_REPO;
    this.#token = options.token ?? null;
    this.#fetch = options.fetch ?? fetch;
    this.#api = (options.api ?? "https://api.github.com").replace(/\/+$/, "");
    this.#keys = options.publicKeys ?? RELEASE_PUBLIC_KEYS;
    this.#state = {
      phase: "idle",
      current: APP_VERSION,
      repo: this.repo,
      checkedAt: null,
      update: null,
      releases: [],
      received: 0,
      error: null,
    };
  }

  get state(): UpdateState {
    return structuredClone(this.#state);
  }

  /** Overrides the running version (tests). */
  setCurrent(version: string): void {
    this.#state.current = version;
  }

  get busy(): boolean {
    return this.#state.phase === "checking" || this.#state.phase === "downloading";
  }

  #headers(accept: string): HeadersInit {
    const headers: Record<string, string> = { accept, "user-agent": `Exordium/${this.#state.current}` };
    if (this.#token) headers.authorization = `Bearer ${this.#token}`;
    return headers;
  }

  /** The newest version the releases feed names (newestFeedTag); null when it cannot be read. */
  async feedVersion(): Promise<string | null> {
    try {
      const response = await this.#fetch(`https://github.com/${this.repo}/releases.atom`, {
        headers: this.#headers("application/atom+xml"),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      return newestFeedTag(await response.text());
    } catch {
      return null;
    }
  }

  /** Reads the releases; an update already downloaded and ready stays ready. */
  async check(includePrereleases: boolean): Promise<UpdateState> {
    if (this.busy) return this.state;
    const ready = this.#state.phase === "ready" ? this.#state.update : null;
    this.#state = { ...this.#state, phase: "checking", error: null };
    try {
      const response = await this.#fetch(`${this.#api}/repos/${this.repo}/releases?per_page=30`, {
        headers: this.#headers("application/vnd.github+json"),
      });
      if (response.status === 404) {
        await response.body?.cancel();
        throw new UpdateError(`No public releases at github.com/${this.repo}.`);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new UpdateError(`GitHub did not answer (${response.status}).`);
      }
      const list = await response.json() as Release[];
      const update = pickRelease(list, this.#state.current, includePrereleases);
      const releases = releaseNotes(list, this.#state.current, includePrereleases);
      const checkedAt = new Date().toISOString();
      if (ready && update && ready.version === update.version) {
        this.#state = { ...this.#state, phase: "ready", update: ready, releases, checkedAt };
      } else {
        this.#state = {
          ...this.#state,
          phase: update ? "available" : "current",
          update,
          releases,
          checkedAt,
          received: 0,
        };
      }
    } catch (error) {
      this.#state = {
        ...this.#state,
        phase: "failed",
        error: (error as Error).message,
        checkedAt: new Date().toISOString(),
      };
    }
    return this.state;
  }

  /** Downloads the available update, checks it, and unpacks it beside the app, ready to apply. */
  download(): Promise<UpdateState> {
    if (this.#work) return this.#work.then(() => this.state);
    const update = this.#state.update;
    if (!update || this.#state.phase === "ready") return Promise.resolve(this.state);
    this.#work = this.#download(update).finally(() => this.#work = null);
    return this.#work.then(() => this.state);
  }

  async #download(update: AvailableUpdate): Promise<void> {
    this.#state = { ...this.#state, phase: "downloading", received: 0, error: null };
    const staging = `${this.appDir}/${STAGING}`;
    try {
      if (!update.asset.sha256) {
        throw new UpdateError(`GitHub has no checksum for ${update.asset.name}; it was not installed.`);
      }
      // A private repository's assets come through the API; a public one's from its download link.
      const response = await this.#fetch(
        this.#token ? update.asset.api : update.asset.download,
        { headers: this.#headers("application/octet-stream") },
      );
      if (!response.ok || !response.body) throw new UpdateError(`The download failed (${response.status}).`);
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.body) {
        chunks.push(chunk);
        this.#state.received += chunk.length;
        if (this.#state.received > update.asset.size) {
          throw new UpdateError("The download is larger than GitHub says.");
        }
      }
      const bytes = new Uint8Array(this.#state.received);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      if (bytes.length !== update.asset.size || await sha256Hex(bytes) !== update.asset.sha256) {
        throw new UpdateError("The download does not match GitHub's checksum; nothing was installed.");
      }

      await Deno.remove(staging, { recursive: true }).catch(() => {});
      await Deno.mkdir(staging, { recursive: true });
      const archive = `${staging}/${update.asset.name}`;
      await Deno.writeFile(archive, bytes);
      const files = `${staging}/files`;
      await extract(archive, files);
      await Deno.remove(archive);
      const list = await this.#signedList(files);
      if (list.version !== update.version) {
        throw new UpdateError(`The zip is for ${list.version}, not ${update.version}.`);
      }
      for (const file of list.files) {
        const data = await Deno.readFile(`${files}/${file.path}`).catch(() => null);
        if (!data || data.length !== file.size || await sha256Hex(data) !== file.sha256) {
          throw new UpdateError(`${file.path} in the update does not match its file list.`);
        }
      }
      this.#state = { ...this.#state, phase: "ready" };
    } catch (error) {
      await Deno.remove(staging, { recursive: true }).catch(() => {});
      const message = error instanceof Deno.errors.PermissionDenied
        ? `Exordium's folder (${this.appDir}) cannot be written; download ${update.name} from its release page.`
        : (error as Error).message;
      this.#state = { ...this.#state, phase: "failed", error: message };
    }
  }

  /**
   * Puts the ready update's files in place, setting the old ones aside. All or nothing: a file that
   * cannot be swapped puts back every one swapped before it. The caller restarts Exordium.
   */
  async apply(): Promise<string> {
    if (this.#state.phase !== "ready" || !this.#state.update) throw new UpdateError("No update is ready.");
    const staging = `${this.appDir}/${STAGING}/files`;
    const list = await this.#signedList(staging);
    const previous = await Deno.readTextFile(`${this.appDir}/${FILE_LIST}`)
      .then((text) => parseFileList(JSON.parse(text)))
      .catch(() => null);

    const done: { dest: string; aside: string | null }[] = [];
    const asideOnly: { dest: string; aside: string }[] = [];
    try {
      for (const file of list.files) {
        const dest = `${this.appDir}/${file.path}`;
        await Deno.mkdir(dest.replace(/\/[^/]+$/, ""), { recursive: true });
        const aside = await this.#setAside(dest);
        await Deno.rename(`${staging}/${file.path}`, dest);
        done.push({ dest, aside });
      }
      // Files the old version had and the new one does not: set aside too, removed by the sweep.
      const kept = new Set(list.files.map((f) => f.path.toLowerCase()));
      for (const file of previous?.files ?? []) {
        if (kept.has(file.path.toLowerCase())) continue;
        const dest = `${this.appDir}/${file.path}`;
        const aside = await this.#setAside(dest);
        if (aside) asideOnly.push({ dest, aside });
      }
      await Deno.rename(`${staging}/${FILE_LIST}`, `${this.appDir}/${FILE_LIST}`);
    } catch (error) {
      for (const { dest, aside } of [...done].reverse()) {
        await Deno.remove(dest).catch(() => {});
        if (aside) await Deno.rename(aside, dest).catch(() => {});
      }
      for (const { dest, aside } of asideOnly) await Deno.rename(aside, dest).catch(() => {});
      this.#state = {
        ...this.#state,
        phase: "failed",
        error: `The update could not be applied: ${(error as Error).message}`,
      };
      throw new UpdateError(this.#state.error!);
    }
    await Deno.remove(`${this.appDir}/${STAGING}`, { recursive: true }).catch(() => {});
    return this.#state.update!.version;
  }

  /** The unpacked update's file list, once its signature has been checked. */
  async #signedList(folder: string): Promise<FileList> {
    if (this.#keys.length === 0) {
      throw new UpdateError("This build has no release key, so it cannot check an update's signature.");
    }
    const bytes = await Deno.readFile(`${folder}/${FILE_LIST}`).catch(() => null);
    const signature = await Deno.readTextFile(`${folder}/${SIGNATURE_FILE}`).catch(() => null);
    if (!bytes || !signature) throw new UpdateError("The update is not signed; nothing was installed.");
    if (!(await verifySignature(bytes, signature, this.#keys))) {
      throw new UpdateError("The update's signature is not HarvestLabs'; nothing was installed.");
    }
    return parseFileList(JSON.parse(new TextDecoder().decode(bytes)));
  }

  /** Renames `dest` to a free `*.exordium-old` name; null when there was nothing there. */
  async #setAside(dest: string): Promise<string | null> {
    if (!(await exists(dest))) return null;
    for (let i = 0; i < 100; i++) {
      const aside = `${dest}${i === 0 ? "" : `.${i}`}${OLD}`;
      if (await exists(aside)) {
        // Left by an earlier update; gone unless still held open.
        if (await Deno.remove(aside).then(() => true, () => false)) {
          await Deno.rename(dest, aside);
          return aside;
        }
        continue;
      }
      await Deno.rename(dest, aside);
      return aside;
    }
    throw new UpdateError(`Could not set ${dest} aside.`);
  }
}

/**
 * At startup: deletes what the last update set aside, and an unfinished download. Only names this
 * module makes, only in the folders the installed file list puts files in. Best effort; a file still
 * held is tried next time.
 */
export async function sweepUpdate(appDir: string): Promise<number> {
  const root = appDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const folders = new Set([root]);
  const list = await Deno.readTextFile(`${root}/${FILE_LIST}`).then((t) => parseFileList(JSON.parse(t))).catch(() =>
    null
  );
  for (const file of list?.files ?? []) {
    const at = file.path.lastIndexOf("/");
    if (at > 0) folders.add(`${root}/${file.path.slice(0, at)}`);
  }
  let removed = 0;
  for (const folder of folders) {
    let entries: Deno.DirEntry[];
    try {
      entries = await Array.fromAsync(Deno.readDir(folder));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile || !entry.name.endsWith(OLD)) continue;
      if (await Deno.remove(`${folder}/${entry.name}`).then(() => true, () => false)) removed++;
    }
  }
  await Deno.remove(`${root}/${STAGING}`, { recursive: true }).catch(() => {});
  return removed;
}
