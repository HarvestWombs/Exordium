import {
  type KnownFile,
  type ModImport,
  type ModSetup,
  readD2SE,
  readSetupFile,
  type ScannedFile,
  toLayer,
} from "@exordium/d2se";
import { Boxes } from "@exordium/box";
import { buildLoaderPlan } from "@exordium/launch";
import { type FileLayer, type Plan, resolve, type ResolvedFile, type ResolvedValue } from "@exordium/layers";
import { ART_KINDS, ArtError, type ArtKind, ArtStore, installTag, isPng, slug } from "@exordium/library";
import {
  boxLayer,
  capturedChanges,
  formatHiveText,
  machineSnapshot,
  parseHiveText,
  readWritableLayer,
  settingsLayer,
  writeWritableLayer,
} from "@exordium/registry";
import {
  closeWindow,
  minimizeWindow,
  prepareWindow,
  setUpWindow,
  startWindowDrag,
  startWindowResize,
  toggleMaximizeWindow,
} from "./window.ts";

const isDev = Deno.env.get("EXORDIUM_DEV") === "1";
const viteDevOrigin = `http://127.0.0.1:${Deno.env.get("VITE_DEV_PORT") ?? "5273"}`;
const distDir = new URL("./dist/", import.meta.url);
const exordiumRoot = `${Deno.env.get("LOCALAPPDATA") ?? Deno.cwd()}/Exordium`.replace(/\\/g, "/");
/** The name the loader has inside a box; see installNativeLoader. */
const GAME_EXE = "Game.exe";
const art = new ArtStore(exordiumRoot);

const server = Deno.serve(
  { port: Number(Deno.env.get("EXORDIUM_PORT") ?? 8235), hostname: "127.0.0.1" },
  async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/scan-d2se") return await scanD2SE(url);
    if (url.pathname === "/api/build-box") return await buildBox(request);
    if (url.pathname === "/api/play") return await play(request);
    if (url.pathname === "/api/status") return Response.json(await status());
    if (url.pathname === "/api/settings") return await settings(request);
    if (url.pathname === "/api/art") return await artwork(request, url);
    if (url.pathname === "/api/characters") return await characters(url);
    if (url.pathname === "/api/launch-d2se") return await launchD2SE(request);
    if (url.pathname.startsWith("/api/window/")) return windowRoute(url);
    if (url.pathname.startsWith("/api/")) return Response.json({ error: "Not found" }, { status: 404 });

    if (isDev) {
      const target = new URL(url.pathname + url.search, viteDevOrigin);
      return fetch(target, { method: request.method, headers: request.headers, body: request.body });
    }

    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fileUrl = distFileUrl(filePath);
    if (fileUrl) {
      try {
        return new Response(await Deno.readFile(fileUrl), { headers: { "content-type": contentType(filePath) } });
      } catch {
        // Fall through to index.html for client-side routes.
      }
    }
    return new Response(await Deno.readFile(new URL("./index.html", distDir)), {
      headers: { "content-type": "text/html" },
    });
  },
);

console.log(`Exordium desktop dev server: http://127.0.0.1:${server.addr.port}/`);
// Only finds a window under `deno desktop`; a plain `deno run` has none and this quietly does nothing.
void setUpWindow();

/** The page's own title bar. `ready` answers whether there is a desktop window at all; see window.ts. */
function windowRoute(url: URL): Response {
  switch (url.pathname.slice("/api/window/".length)) {
    case "ready":
      return Response.json({ desktop: prepareWindow() });
    case "minimize":
      return Response.json({ ok: minimizeWindow() });
    case "maximize":
      return Response.json(toggleMaximizeWindow());
    case "close":
      return Response.json({ ok: closeWindow() });
    case "drag":
      return Response.json({ ok: startWindowDrag() });
    case "resize":
      return Response.json({ ok: startWindowResize(url.searchParams.get("edge") ?? "") });
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}

async function scanD2SE(url: URL): Promise<Response> {
  const root = url.searchParams.get("root")?.trim();
  if (!root) return Response.json({ error: "Missing root" }, { status: 400 });
  const imported = await readD2SE(root, { hash: false, hashWritable: false, linkData: true });
  if (!imported) return Response.json({ error: "That folder is not a D2SE install." }, { status: 404 });
  const cores = new Map(imported.cores.map((core) => [core.version.toLowerCase(), core]));
  const mods = await Promise.all(imported.mods.map(async (mod) => {
    const core = mod.setup?.mod.core ? cores.get(mod.setup.mod.core.toLowerCase()) ?? null : null;
    const language = mod.setup?.player.language?.toUpperCase() ?? null;
    const loader = mod.setup ? buildLoaderPlan(previewPlan(imported.game, core, mod, language), mod.setup) : null;
    const target = { kind: "mod" as const, folder: mod.folder };
    return {
      kind: "mod" as const,
      key: entryKey(target),
      art: await artSummary(imported.layout.root, target),
      folder: mod.folder,
      title: mod.setup?.mod.title ?? mod.folder,
      core: mod.setup?.mod.core ?? null,
      version: mod.setup?.mod.version ?? null,
      language: mod.setup?.player.language ?? null,
      files: mod.scan.layer.length,
      saves: mod.scan.writable.length,
      languages: Object.keys(mod.scan.languages).sort(),
      problems: [...mod.problems, ...(loader?.problems ?? [])],
      archives: loader?.archives ?? [],
      plugins: loader?.plugins ?? [],
      settings: loader?.settings ?? null,
    };
  }));
  // A core is also playable on its own, as D2SE's vanilla game, with the core's own D2SE_SETUP.ini.
  const coreEntries = await Promise.all(imported.cores.map(async (core) => {
    const setup = await readSetupFile(`${imported.layout.root}/D2SE/CORES/${core.version}`);
    const language = setup?.player.language?.toUpperCase() ?? null;
    const loader = setup ? buildLoaderPlan(previewPlan(imported.game, core, null, language), setup) : null;
    const target = { kind: "core" as const, version: core.version };
    return {
      kind: "core" as const,
      key: entryKey(target),
      art: await artSummary(imported.layout.root, target),
      folder: core.version,
      title: setup?.mod.name ?? `Diablo II ${core.version}`,
      core: core.version,
      version: setup?.mod.version ?? null,
      language: setup?.player.language ?? null,
      files: core.scan.layer.length,
      saves: core.scan.writable.length,
      languages: Object.keys(core.scan.languages).sort(),
      problems: [
        ...(setup ? [] : [{ level: "error" as const, message: `Core ${core.version} has no D2SE_SETUP.ini.` }]),
        ...(loader?.problems ?? []),
      ],
      archives: loader?.archives ?? [],
      plugins: loader?.plugins ?? [],
      settings: loader?.settings ?? null,
    };
  }));
  return Response.json({
    root: imported.layout.root,
    activeFolder: imported.launcher?.activeFolder ?? null,
    gameArchives: imported.game.map((file) => file.path),
    missingGameArchives: imported.missingGameArchives,
    cores: coreEntries,
    mods,
  });
}

/** What a box runs: a mod folder, or a D2SE core on its own (vanilla, with the core's own setup). */
type BoxTarget = { kind: "mod"; folder: string } | { kind: "core"; version: string };

async function readTarget(request: Request): Promise<{ root: string; target: BoxTarget } | Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as { root?: unknown; folder?: unknown; core?: unknown } | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const core = typeof body?.core === "string" ? body.core.trim() : "";
  if (!root || (!folder && !core)) return Response.json({ error: "Missing root, and folder or core" }, { status: 400 });
  return { root, target: folder ? { kind: "mod", folder } : { kind: "core", version: core } };
}

async function buildBox(request: Request): Promise<Response> {
  const read = await readTarget(request);
  if (read instanceof Response) return read;

  try {
    return Response.json(await realiseD2SEBox(read.root, read.target));
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

async function realiseD2SEBox(root: string, target: BoxTarget) {
  // TEMP timing: which phase makes Play slow.
  const timings: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  // The mod's core, from its D2SE_SETUP.ini alone: scanning the whole mod just to learn it doubled
  // the listing time. A mod without one is refused below, after the full read reports it.
  const coreVersion = target.kind === "core"
    ? target.version
    : (await readSetupFile(`${root.replace(/[\\/]+$/, "")}/MODS/${target.folder}`))?.mod.core ?? null;
  const cache = await hashCache();
  const imported = await readD2SE(root, {
    hash: true,
    hashWritable: false,
    linkData: true,
    cache,
    mods: target.kind === "mod" ? [target.folder] : [],
    cores: coreVersion ? [coreVersion] : [],
  });
  lap("readD2SE");
  await saveHashCache(cache);
  lap("saveHashes");
  if (!imported) throw new HttpError(404, "That folder is not a D2SE install.");
  const core = coreVersion
    ? imported.cores.find((c) => c.version.toLowerCase() === coreVersion.toLowerCase()) ?? null
    : null;

  let mod: ModImport | null = null;
  let setup: ModSetup;
  let saves: string;
  let name: string;
  if (target.kind === "mod") {
    mod = imported.mods[0] ?? null;
    if (!mod) throw new HttpError(404, `No mod folder named "${target.folder}".`);
    if (!mod.setup) throw new HttpError(422, "No D2SE_SETUP.ini: cannot build a launchable box.");
    if (mod.problems.some((problem) => problem.level === "error")) {
      throw new HttpError(422, mod.problems.map((problem) => problem.message).join("\n"));
    }
    setup = mod.setup;
    saves = `${imported.layout.root}/MODS/${mod.folder}/save`;
    name = target.folder;
  } else {
    // A core on its own is D2SE's vanilla game: the core carries its own D2SE_SETUP.ini and save folder.
    if (!core) throw new HttpError(404, `No D2SE core named "${target.version}".`);
    const coreFolder = `${imported.layout.root}/D2SE/CORES/${core.version}`;
    const coreSetup = await readSetupFile(coreFolder);
    if (!coreSetup) throw new HttpError(422, `Core ${core.version} has no D2SE_SETUP.ini.`);
    setup = coreSetup;
    saves = `${coreFolder}/save`;
    name = `core-${core.version}`;
  }

  const language = setup.player.language?.toUpperCase() ?? null;
  lap("setup");
  const { plan, sources } = buildRealPlan(imported.layout.root, imported.game, core, mod, language);
  const loader = buildLoaderPlan(plan, setup);
  if (loader.problems.some((problem) => problem.level === "error")) {
    throw new HttpError(422, loader.problems.map((problem) => problem.message).join("\n"));
  }

  lap("plan");
  const id = `d2se-${slug(name)}-${installTag(imported.layout.root)}`;
  const boxes = await Boxes.open(exordiumRoot);
  const realised = await boxes.realise({
    id,
    plan,
    saves,
    // The mod's data folder, whole: the game reads it loose beside Game.exe with -direct.
    folders: mod?.scan.data
      ? [{ path: "data", target: `${imported.layout.root}/MODS/${mod.folder}/${mod.scan.data}` }]
      : [],
    source(file) {
      const source = sources.get(sourceKey(file.layer, file.path));
      if (!source) throw new Error(`No source for ${file.layer}:${file.path}`);
      return source;
    },
  });
  lap("realise");
  // The registry the game sees: the machine's Diablo II keys (read, never written), what D2SE would
  // set for this mod, the box's own InstallPath and Save Path, then what earlier runs changed.
  const snapshot = await machineSnapshot();
  lap("machineSnapshot");
  const base = { id: "machine", role: "base" as const, entries: snapshot.entries };
  const settings = settingsLayer(loader.settings);
  const box = boxLayer(realised.folder);
  const writable = await readWritableLayer(exordiumRoot, id);
  const registry = resolve({ files: [], registry: [base, settings, box, writable] }).registry;
  const lowerRegistry = resolve({ files: [], registry: [base, settings, box] }).registry;
  const hive = await installRegistry(boxes.folder(id), registry, lowerRegistry);
  lap("registry");
  const title = target.kind === "mod"
    ? setup.mod.title ?? target.folder
    : setup.mod.name ?? `Diablo II ${target.version}`;
  const icon = await art.has(artKey(target), "icon") ? winPath(art.path(artKey(target), "icon")) : null;
  await installNativeLoader(realised.folder, loader, hive, { title, icon });
  lap("loader");
  console.log(`[timing] ${id}`, JSON.stringify(timings));

  return {
    id,
    key: entryKey(target),
    title,
    hive: hive.hive,
    registryValues: registry.length,
    folder: realised.folder,
    reused: realised.reused,
    counts: realised.counts,
    notes: realised.notes,
    files: plan.files.length,
    archives: loader.archives,
    plugins: loader.plugins,
    commandLine: loader.commandLine,
    timings,
  };
}

/**
 * Every file hash Exordium has taken, by full path, with the size and timestamp it had then. A box
 * is identified by its files' content, and reading every byte of the game, the core and the mod
 * took 10 s for a vanilla core and 20 s for a large mod on every Play; with this, only files whose
 * size or timestamp changed are read again.
 */
const hashesFile = `${exordiumRoot}/hashes.json`;
let hashes: Map<string, KnownFile> | null = null;

async function hashCache(): Promise<Map<string, KnownFile>> {
  if (hashes) return hashes;
  try {
    hashes = new Map(Object.entries(JSON.parse(await Deno.readTextFile(hashesFile)) as Record<string, KnownFile>));
  } catch {
    // Missing or unreadable: start empty, the next scan hashes everything and rewrites it.
    hashes = new Map();
  }
  return hashes;
}

async function saveHashCache(cache: Map<string, KnownFile>): Promise<void> {
  await Deno.mkdir(exordiumRoot, { recursive: true });
  const temp = `${hashesFile}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temp, JSON.stringify(Object.fromEntries(cache)));
  await Deno.rename(temp, hashesFile);
}

// ---- Playing ------------------------------------------------------------------------------------

/** What Exordium remembers between sessions: the install it reads, and what was played when. */
interface AppState {
  root: string | null;
  lastPlayed: string | null;
  playedAt: Record<string, string>;
}

const stateFile = `${exordiumRoot}/state.json`;

async function readState(): Promise<AppState> {
  try {
    return { root: null, lastPlayed: null, playedAt: {}, ...JSON.parse(await Deno.readTextFile(stateFile)) };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return { root: null, lastPlayed: null, playedAt: {} };
    throw error;
  }
}

async function writeState(change: (state: AppState) => void): Promise<AppState> {
  const state = await readState();
  change(state);
  await Deno.mkdir(exordiumRoot, { recursive: true });
  const temp = `${stateFile}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temp, JSON.stringify(state, null, 2) + "\n");
  await Deno.rename(temp, stateFile);
  return state;
}

/** A game this session started, until it exits. */
interface Running {
  key: string;
  title: string;
  pid: number;
  startedAt: string;
}

const running = new Map<string, Running>();
/** The last run of each title this session: what its registry read-back and file check found. */
const finished = new Map<string, { exitCode: number | null; registry: unknown; files: unknown; endedAt: string }>();

async function status() {
  const state = await readState();
  return { root: state.root, lastPlayed: state.lastPlayed, playedAt: state.playedAt, running: [...running.values()] };
}

async function settings(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json(await readState());
  const body = await request.json().catch(() => null) as { root?: unknown } | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  if (!root) return Response.json({ error: "Missing root" }, { status: 400 });
  return Response.json(await writeState((state) => void (state.root = root)));
}

/**
 * Starts a title. The box is built (or reused), then the game starts as its own process through
 * `Game.exe --detach`, so it is not a child of Exordium: Task Manager lists it under the mod's name,
 * and closing Exordium does not close it. This returns once it has started; Exordium follows it with
 * `Game.exe --wait`, and when it exits reads its registry back and checks its files.
 */
async function play(request: Request): Promise<Response> {
  const read = await readTarget(request);
  if (read instanceof Response) return read;
  const key = entryKey(read.target);
  if (running.has(key)) return Response.json({ error: `${key} is already running.` }, { status: 409 });

  try {
    const box = await realiseD2SEBox(read.root, read.target);
    await Deno.remove(`${box.folder}/exordium-loader.log`).catch(() => {});
    const gameExe = `${box.folder}/${GAME_EXE}`;
    const detached = await new Deno.Command(gameExe, {
      args: ["--detach", ...box.commandLine.split(" ").filter(Boolean)],
      cwd: box.folder,
      stdout: "piped",
      stderr: "null",
    }).output();
    const pid = Number(new TextDecoder().decode(detached.stdout).trim());
    if (!detached.success || !Number.isInteger(pid) || pid <= 0) {
      throw new HttpError(500, `The game did not start (Game.exe --detach exited with ${detached.code}).`);
    }
    const startedAt = new Date().toISOString();
    running.set(key, { key, title: box.title, pid, startedAt });
    await writeState((state) => {
      state.root = read.root;
      state.lastPlayed = key;
      state.playedAt[key] = startedAt;
    });
    void follow(key, gameExe, pid, box);
    return Response.json({ key, pid, box });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** Waits for a started game, then collects what the run changed. */
async function follow(key: string, gameExe: string, pid: number, box: { id: string; folder: string; hive: string }) {
  let exitCode: number | null = null;
  try {
    const waited = await new Deno.Command(gameExe, { args: ["--wait", String(pid)], stdout: "piped" }).output();
    const text = new TextDecoder().decode(waited.stdout).trim();
    exitCode = text === "" ? null : Number(text);
  } finally {
    running.delete(key);
  }
  const registry = await collectRegistry(box.folder, box.hive, box.id).catch((error) => ({
    captured: false,
    reason: (error as Error).message,
  }));
  const files = await (await Boxes.open(exordiumRoot)).afterRun(box.id).catch(() => null);
  finished.set(key, { exitCode, registry, files, endedAt: new Date().toISOString() });
}

// ---- Artwork ------------------------------------------------------------------------------------

/** A title across installs: `mod-<slug>` or `core-<version>`. Art is kept under it. */
function artKey(target: BoxTarget): string {
  return target.kind === "mod" ? `mod-${slug(target.folder)}` : `core-${target.version.toLowerCase()}`;
}

function entryKey(target: BoxTarget): string {
  return target.kind === "mod" ? `mod:${target.folder}` : `core:${target.version}`;
}

function parseEntryKey(key: string): BoxTarget | null {
  if (key.startsWith("mod:") && key.length > 4) return { kind: "mod", folder: key.slice(4) };
  if (key.startsWith("core:") && key.length > 5) return { kind: "core", version: key.slice(5) };
  return null;
}

/** The folder a title's D2SE files are in. */
function titleFolder(root: string, target: BoxTarget): string {
  return target.kind === "mod" ? `${root}/MODS/${target.folder}` : `${root}/D2SE/CORES/${target.version}`;
}

/** D2SE's own banner (`ModBanner=`), as the mod ships it: a BMP, shown as it is. */
async function d2seBanner(root: string, target: BoxTarget): Promise<string | null> {
  const folder = titleFolder(root, target);
  const name = (await readSetupFile(folder))?.mod.banner;
  if (!name || name.includes("..")) return null;
  try {
    return (await Deno.stat(`${folder}/${name}`)).isFile ? `${folder}/${name}` : null;
  } catch {
    return null;
  }
}

/**
 * GET `?root&key&kind`: the title's PNG, or for a banner its D2SE `ModBanner` as it is.
 * POST (PNG body) sets it; DELETE removes it. Only PNG is kept.
 */
async function artwork(request: Request, url: URL): Promise<Response> {
  const target = parseEntryKey(url.searchParams.get("key") ?? "");
  const kind = url.searchParams.get("kind") as ArtKind | null;
  if (!target || !kind || !ART_KINDS.includes(kind)) {
    return Response.json({ error: "Bad key or kind" }, { status: 400 });
  }
  const key = artKey(target);
  try {
    if (request.method === "POST") {
      const png = new Uint8Array(await request.arrayBuffer());
      if (!isPng(png)) return Response.json({ error: "Artwork must be a PNG." }, { status: 415 });
      await art.save(key, kind, png);
      return Response.json({ ok: true });
    }
    if (request.method === "DELETE") {
      await art.remove(key, kind);
      return Response.json({ ok: true });
    }
    const png = await art.read(key, kind);
    if (png) {
      return new Response(png.slice(), { headers: { "content-type": "image/png", "cache-control": "no-cache" } });
    }
    const root = url.searchParams.get("root")?.trim();
    const banner = kind === "banner" && root ? await d2seBanner(root, target) : null;
    if (banner) {
      return new Response(await Deno.readFile(banner), {
        headers: { "content-type": contentType(banner), "cache-control": "no-cache" },
      });
    }
    return new Response(null, { status: 404 });
  } catch (error) {
    if (error instanceof ArtError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

// ---- Characters ---------------------------------------------------------------------------------

const CLASSES = ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"];

/**
 * GET `?root&key`: the title's characters, from the `.d2s` headers in its own save folder (the
 * folder a box's `save` junction points at). Layout per D2MOO's D2SaveHeaderStrc: magic 0xAA55AA55,
 * name at 0x14, flags at 0x24 (0x04 hardcore, 0x08 dead, 0x20 expansion), class 0x28, level 0x2B,
 * last saved 0x30. Read only; a file that is not a save is skipped.
 */
async function characters(url: URL): Promise<Response> {
  const target = parseEntryKey(url.searchParams.get("key") ?? "");
  const root = url.searchParams.get("root")?.trim();
  if (!target || !root) return Response.json({ error: "Missing root or key" }, { status: 400 });
  const folder = `${titleFolder(root, target)}/save`;
  const found = [];
  try {
    for await (const entry of Deno.readDir(folder)) {
      if (!entry.isFile || !entry.name.toLowerCase().endsWith(".d2s")) continue;
      const file = await Deno.open(`${folder}/${entry.name}`, { read: true });
      const header = new Uint8Array(0x34);
      const read = await file.read(header);
      file.close();
      const view = new DataView(header.buffer);
      if (read !== 0x34 || view.getUint32(0, true) !== 0xaa55aa55) continue;
      const nameBytes = header.subarray(0x14, 0x24);
      const end = nameBytes.indexOf(0);
      const flags = header[0x24]!;
      const classId = header[0x28]!;
      found.push({
        name: new TextDecoder("windows-1252").decode(nameBytes.subarray(0, end < 0 ? 16 : end)),
        className: CLASSES[classId] ?? `Class ${classId}`,
        level: header[0x2b]!,
        hardcore: (flags & 0x04) !== 0,
        dead: (flags & 0x08) !== 0,
        expansion: (flags & 0x20) !== 0,
        savedAt: view.getUint32(0x30, true) ? new Date(view.getUint32(0x30, true) * 1000).toISOString() : null,
      });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  found.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? "") || a.name.localeCompare(b.name));
  return Response.json({ characters: found });
}

/** What a title has: its own PNGs, or for the banner D2SE's BMP. */
async function artSummary(root: string, target: BoxTarget) {
  const key = artKey(target);
  return {
    banner: await art.has(key, "banner") ? "png" : await d2seBanner(root, target) ? "d2se" : null,
    icon: await art.has(key, "icon"),
    portrait: await art.has(key, "portrait"),
  };
}

async function launchD2SE(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as { root?: unknown; folder?: unknown; build?: unknown } | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  if (!root || !folder) return Response.json({ error: "Missing root or folder" }, { status: 400 });

  try {
    const imported = await readD2SE(root, { hash: false, hashWritable: false, mods: [folder] });
    if (!imported) throw new HttpError(404, "That folder is not a D2SE install.");
    if (!imported.mods[0]) throw new HttpError(404, `No mod folder named "${folder}".`);
    if (imported.mods[0].problems.some((problem) => problem.level === "error")) {
      throw new HttpError(422, imported.mods[0].problems.map((problem) => problem.message).join("\n"));
    }

    const box = body?.build === true ? await realiseD2SEBox(root, { kind: "mod", folder }) : null;
    const launched = await launchD2SEMod({ root, mod: folder });
    return Response.json({ mode: "d2se", folder, box, launched });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

function buildRealPlan(
  root: string,
  game: ScannedFile[],
  core: {
    version: string;
    scan: {
      layer: ScannedFile[];
      languages: Record<string, ScannedFile[]>;
    };
  } | null,
  mod: ModImport | null,
  language: string | null,
): { plan: Plan; sources: Map<string, string> } {
  const layers: FileLayer[] = [];
  const sources = new Map<string, string>();
  const addSources = (layer: string, base: string, files: readonly { path: string; source: string }[]) => {
    for (const file of files) sources.set(sourceKey(layer, file.path), `${base}/${file.source}`);
  };

  layers.push(toLayer("game", "game", game));
  addSources("game", root, game);

  if (core) {
    const coreBase = `${root}/D2SE/CORES/${core.version}`;
    layers.push(toLayer("core", "core", core.scan.layer));
    addSources("core", coreBase, core.scan.layer);
    if (language && language !== "MOD") {
      const files = core.scan.languages[language] ?? [];
      layers.push(toLayer("core-language", "core", files));
      addSources("core-language", coreBase, files);
    }
  }

  if (mod) {
    const modBase = `${root}/MODS/${mod.folder}`;
    layers.push(toLayer("mod", "mod", mod.scan.layer));
    addSources("mod", modBase, mod.scan.layer);
    if (language && language !== "MOD") {
      const files = mod.scan.languages[language] ?? [];
      layers.push(toLayer("mod-language", "mod", files));
      addSources("mod-language", modBase, files);
    }
  }

  return { plan: resolve({ files: layers, registry: [] }), sources };
}

/**
 * Writes the box's registry for the loader: the values as text, and a fresh hive path. The hive and
 * its transaction logs from the last run are removed first, so every run starts from the layers.
 */
async function installRegistry(
  boxFolder: string,
  values: readonly ResolvedValue[],
  lower: readonly ResolvedValue[],
) {
  for await (const entry of Deno.readDir(boxFolder)) {
    if (entry.isFile && entry.name.toLowerCase().startsWith("registry.hive")) {
      await Deno.remove(`${boxFolder}/${entry.name}`);
    }
  }
  const file = `${boxFolder}/registry.txt`;
  await Deno.writeTextFile(file, formatHiveText(values));
  // What the run's changes are measured against, as it was at launch: collecting may happen later,
  // after the machine's keys or Exordium's own key list have changed.
  await Deno.writeTextFile(`${boxFolder}/registry.lower.json`, JSON.stringify(lower));
  return { hive: winPath(`${boxFolder}/registry.hive`), file: winPath(file) };
}

/**
 * After the game exits: the loader reads the hive back as text, and whatever the run changed
 * becomes the profile's writable layer. A missing hive (the game never got that far) keeps the
 * layer as it was.
 */
async function collectRegistry(gameFolder: string, hive: string, profile: string) {
  const lowerFile = `${gameFolder}/../registry.lower.json`;
  const lower = JSON.parse(await Deno.readTextFile(lowerFile)) as ResolvedValue[];
  const out = `${hive}.out.txt`;
  const dumped = await new Deno.Command(`${gameFolder}/${GAME_EXE}`, { args: ["--dump-hive", hive, out] }).output();
  if (!dumped.success) return { captured: false, reason: `dump exited with ${dumped.code}` };
  const after = parseHiveText(await Deno.readTextFile(out));
  await Deno.remove(out);
  const layer = capturedChanges(lower, after);
  await writeWritableLayer(exordiumRoot, profile, layer);
  return { captured: true, values: after.length, changes: layer.entries };
}

function winPath(path: string): string {
  return path.replace(/\//g, "\\");
}

async function installNativeLoader(
  folder: string,
  loader: ReturnType<typeof buildLoaderPlan>,
  registry: { hive: string; file: string },
  identity: { title: string; icon: string | null },
): Promise<void> {
  const source = new URL("../../native/loader/build/exordium-game.exe", import.meta.url);
  let exe: Uint8Array;
  try {
    exe = await Deno.readFile(source);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new HttpError(500, `Native loader is not built at ${source.pathname}. Run \`deno task build:loader\`.`);
    }
    throw error;
  }
  // The loader is the box's Game.exe. Anything already at that path is a link into a mod or the
  // store, so it is unlinked first; writing would go through it.
  const gameExe = `${folder}/${GAME_EXE}`;
  const stamped = `${folder}/Game.stamp.exe`;
  const version = (loader.gameExeVersion ?? [0, 0, 0, 0]).join(".");
  // Copying and stamping cost ~200 ms, so they are skipped when the box's Game.exe was already made
  // from this loader build with this version, title and icon. Kept beside the game folder, not in it,
  // and gone with it when the box is rebuilt (the new folder has no Game.exe yet).
  const iconInfo = identity.icon ? await Deno.stat(identity.icon).catch(() => null) : null;
  const want = JSON.stringify({
    loader: await sha256Hex(exe),
    version,
    title: identity.title,
    icon: identity.icon ? `${identity.icon}|${iconInfo?.size}|${iconInfo?.mtime?.getTime()}` : null,
  });
  const markerFile = `${folder.slice(0, folder.lastIndexOf("/"))}/loader-stamp.json`;
  const current = await Deno.stat(gameExe).catch(() => null);
  const marker = await Deno.readTextFile(markerFile).then((text) => JSON.parse(text)).catch(() => null);
  const upToDate = current?.isFile && marker?.identity === want && marker?.size === current.size;
  if (!upToDate) await stampLoader(exe, gameExe, stamped, folder, version, identity, markerFile, want);
  await Deno.writeTextFile(
    `${folder}/exordium-loader.json`,
    JSON.stringify(
      {
        hive: registry.hive,
        registryFile: registry.file,
        commandLine: loader.commandLine,
        gameVersion: loader.gameVersion ?? "",
        handoff: true,
        graphics: true,
        graphicsInit: false,
        graphicsSurface: false,
        graphicsWrapper: false,
        graphicsWindow: false,
        archives: loader.archives,
        gameDlls: loader.gameDlls,
        plugins: loader.plugins.map((plugin) => ({
          kind: plugin.kind,
          path: plugin.path,
          init: plugin.init === null ? "" : String(plugin.init),
          release: plugin.release === null ? "" : String(plugin.release),
        })),
      },
      null,
      2,
    ) + "\n",
  );
}

async function stampLoader(
  exe: Uint8Array,
  gameExe: string,
  stamped: string,
  folder: string,
  version: string,
  identity: { title: string; icon: string | null },
  markerFile: string,
  want: string,
): Promise<void> {
  for (const path of [gameExe, stamped]) {
    await Deno.remove(path).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }
  await Deno.writeFile(gameExe, exe);
  await Deno.writeFile(stamped, exe);
  // Its resources carry the core's Game.exe version (plugins such as D2GL identify the game by
  // GetFileVersionInfo("game.exe")), the title as its name (what Task Manager shows) and the title's
  // icon (the taskbar). The box's copy stamps a second copy: the loader imports Storm.dll at load
  // time, so it runs only beside the core's DLLs, and a running exe cannot rewrite itself.
  const stamp = await new Deno.Command(gameExe, {
    args: ["--stamp", winPath(stamped), version, identity.title, ...(identity.icon ? [identity.icon] : [])],
    cwd: folder,
  }).output();
  if (!stamp.success) throw new HttpError(500, `Could not stamp Game.exe (exit ${stamp.code}).`);
  await Deno.remove(gameExe);
  await Deno.rename(stamped, gameExe);
  const size = (await Deno.stat(gameExe)).size;
  await Deno.writeTextFile(markerFile, JSON.stringify({ identity: want, size }) + "\n");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sourceKey(layer: string, path: string): string {
  return `${layer}\0${path.toLowerCase()}`;
}

function previewPlan(
  game: { path: string; size: number }[],
  core: {
    scan: { layer: { path: string; size: number }[]; languages: Record<string, { path: string; size: number }[]> };
  } | null,
  mod: ModImport | null,
  language: string | null,
): Plan {
  const files = new Map<string, ResolvedFile>();
  const add = (path: string, size: number, layer: string, role: ResolvedFile["role"]) => {
    files.set(path.toLowerCase(), { path, hash: "0".repeat(64), size, layer, role });
  };
  for (const file of game) add(file.path, file.size, "game", "game");
  for (const file of core?.scan.layer ?? []) add(file.path, file.size, "core", "core");
  for (const file of mod?.scan.layer ?? []) add(file.path, file.size, "mod", "mod");
  if (language && language !== "MOD") {
    for (const file of core?.scan.languages[language] ?? []) add(file.path, file.size, "core-language", "core");
    for (const file of mod?.scan.languages[language] ?? []) add(file.path, file.size, "mod-language", "mod");
  }
  return {
    files: [...files.values()].sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase())),
    registry: [],
  };
}

function distFileUrl(requestPath: string): URL | null {
  const resolved = new URL("." + requestPath, distDir);
  return resolved.href.startsWith(distDir.href) ? resolved : null;
}

function contentType(path: string): string {
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function setD2SEActiveFolder(path: string, folder: string): Promise<void> {
  const text = await Deno.readTextFile(path);
  const next = /^\s*ActiveFolder\s*=.*$/m.test(text)
    ? text.replace(/^(\s*ActiveFolder\s*=).*$/m, `$1${folder}`)
    : text.replace(/(\[USERSETTINGS\]\r?\n)/i, `$1ActiveFolder=${folder}\n`);
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temp, next);
  await Deno.rename(temp, path);
}

interface D2SEInstall {
  root: string;
  mod: string;
}

interface D2SELaunchResult {
  ok: boolean;
  message: string;
}

async function launchD2SEMod(install: D2SEInstall): Promise<D2SELaunchResult> {
  await setD2SEActiveFolder(joinPath(install.root, "D2SE.ini"), install.mod);

  const dir = await Deno.makeTempDir({ prefix: "exordium-d2se-" });
  const scriptPath = joinPath(dir, "launch.ps1");
  const resultPath = joinPath(dir, "result.json");
  let keep = false;
  try {
    await Deno.writeTextFile(scriptPath, `\uFEFF${helperScript(install, resultPath)}`);
    await runElevated(scriptPath, resultPath);
    let raw: string;
    try {
      raw = await Deno.readTextFile(resultPath);
    } catch {
      keep = true;
      return {
        ok: false,
        message: `The launch helper exited without reporting anything. Its script is at ${scriptPath}.`,
      };
    }
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as D2SELaunchResult;
  } catch (error) {
    keep = true;
    return {
      ok: false,
      message: `${error instanceof Error ? error.message : error}\n\nThe helper script is at ${scriptPath}.`,
    };
  } finally {
    if (!keep) await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

function helperScript(install: D2SEInstall, resultPath: string): string {
  return `
$ErrorActionPreference = "Stop"
$result = @{ ok = $false; message = "Helper did not run to completion." }
try {
  Add-Type @"
using System;using System.Text;using System.Runtime.InteropServices;
public class D2 {
 [DllImport("user32.dll")] public static extern IntPtr FindWindowExA(IntPtr p,IntPtr c,IntPtr cls,IntPtr t);
 [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h,out int pid);
 [DllImport("user32.dll")] public static extern int GetClassNameA(IntPtr h,StringBuilder s,int m);
 [DllImport("user32.dll")] public static extern int GetWindowTextA(IntPtr h,StringBuilder s,int m);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h,int id);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PostMessageA(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern int GetDlgItemTextA(IntPtr h,int id,StringBuilder s,int m);
 public static string Cls(IntPtr h){var s=new StringBuilder(80);GetClassNameA(h,s,80);return s.ToString();}
 public static string Txt(IntPtr h){var s=new StringBuilder(260);GetWindowTextA(h,s,260);return s.ToString();}
 public static string Item(IntPtr h,int id){var s=new StringBuilder(400);GetDlgItemTextA(h,id,s,400);return s.ToString();}
}
"@
  if (Get-Process D2SE -ErrorAction SilentlyContinue) {
    throw 'A D2SE launcher is already open. Close it first - a second copy exits immediately.'
  }
  $proc = Start-Process ${psQuote(joinPath(install.root, "D2SE.exe"))} -WorkingDirectory ${
    psQuote(install.root)
  } -PassThru

  $want = ${psQuote(`MODS\\${install.mod})`)}
  $dialog = [IntPtr]::Zero
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline -and $dialog -eq [IntPtr]::Zero) {
    if ($proc.HasExited) { throw "D2SE exited with code $($proc.ExitCode) before its launcher appeared." }
    Start-Sleep -Milliseconds 100
    $h = [IntPtr]::Zero
    while ($true) {
      $h = [D2]::FindWindowExA([IntPtr]::Zero,$h,[IntPtr]::Zero,[IntPtr]::Zero)
      if ($h -eq [IntPtr]::Zero) { break }
      $owner = 0; [D2]::GetWindowThreadProcessId($h,[ref]$owner) | Out-Null
      if ($owner -ne $proc.Id) { continue }
      if ([D2]::Cls($h) -ne "D2SE") { continue }
      if ([D2]::Txt($h).EndsWith($want)) { $dialog = $h; break }
    }
  }
  if ($dialog -eq [IntPtr]::Zero) { throw ${psQuote(`D2SE never reported ${install.mod} as selected.`)} }

  $button = [D2]::GetDlgItem($dialog,1)
  if ($button -eq [IntPtr]::Zero) { throw "The launcher has no Start Plugin control." }
  [D2]::SetForegroundWindow($dialog) | Out-Null
  [D2]::PostMessageA($button,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null

  $refusal = $null
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if (-not [D2]::IsWindow($dialog)) { break }
    $h = [IntPtr]::Zero
    while ($true) {
      $h = [D2]::FindWindowExA([IntPtr]::Zero,$h,[IntPtr]::Zero,[IntPtr]::Zero)
      if ($h -eq [IntPtr]::Zero) { break }
      if ($h -eq $dialog) { continue }
      $owner = 0; [D2]::GetWindowThreadProcessId($h,[ref]$owner) | Out-Null
      if ($owner -eq $proc.Id -and [D2]::Cls($h) -eq "#32770") {
        $text = [D2]::Item($h,0xFFFF)
        if ($text) { $refusal = $text -replace "\\s+"," " }
      }
    }
    if ($refusal) { break }
  }
  if ($refusal) { throw "D2SE refused: $refusal" }
  if ([D2]::IsWindow($dialog)) { throw "D2SE did not respond to Start Plugin." }
  $result = @{ ok = $true; message = ${psQuote(`${install.mod} is starting.`)} }
} catch {
  $result = @{ ok = $false; message = "$_" }
}
[System.IO.File]::WriteAllText(${
    psQuote(resultPath)
  }, ($result | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
`;
}

const shell32 = Deno.dlopen("shell32.dll", {
  ShellExecuteA: {
    parameters: ["pointer", "buffer", "buffer", "buffer", "buffer", "i32"],
    result: "pointer",
  },
});

async function runElevated(scriptPath: string, resultPath: string, timeoutMs = 150_000): Promise<void> {
  const parameters = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${scriptPath}"`;
  const result = shell32.symbols.ShellExecuteA(
    null,
    cstr("runas"),
    cstr("powershell.exe"),
    cstr(parameters),
    null,
    0,
  );
  const code = Number(Deno.UnsafePointer.value(result));
  if (code <= 32) {
    throw new Error(code === 5 ? "The administrator prompt was dismissed." : `Windows refused to elevate (${code}).`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      await Deno.stat(resultPath);
      return;
    } catch {
      // Still running.
    }
  }
  throw new Error("The launch helper did not finish in time.");
}

function joinPath(root: string, name: string): string {
  return `${root.replace(/[\\/]+$/, "")}\\${name}`;
}

function psQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function cstr(value: string): Uint8Array {
  return new TextEncoder().encode(`${value}\0`);
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
