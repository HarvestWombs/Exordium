import {
  GAME_ARCHIVES,
  holdsPlugY,
  isSingleExeCore,
  type KnownFile,
  launchSettings,
  layoutPath,
  LIBRARY_FOLDERS,
  LIBRARY_PLUGY,
  type ModImport,
  modProblems,
  type ModSetup,
  parseIni,
  readD2SE,
  readModSetup,
  readSetupFile,
  type Renderer,
  rootCoreName,
  scanFolder,
  scanNamed,
  type ScannedFile,
  toLayer,
} from "@exordium/d2se";
import { BoxError, Boxes, type LinkMode } from "@exordium/box";
import { buildLoaderPlan, gameWindowTitle } from "@exordium/launch";
import {
  type FileLayer,
  type Plan,
  type RegistryEntry,
  type RegistryTombstone,
  type RegistryValue,
  resolve,
  type ResolvedFile,
  type ResolvedValue,
} from "@exordium/layers";
import { ART_KINDS, ArtError, type ArtKind, checkArt, chosenArtPath, installTag, isPng, slug } from "@exordium/library";
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
  denoFs,
  detectRunners,
  pickRunner,
  prefixFor,
  prefixInitCommand,
  regAddCommand,
  type Runner,
  type RunnerCommand,
  toWinePath,
  wineCommand,
} from "@exordium/runner";
import {
  activeJobCount,
  archiveItem,
  archiveList,
  browseImage,
  cancelJob,
  downloadedFile,
  installDownloaded,
  type InstallTarget,
  jobList,
  KEYWORD_GROUPS,
  latestUploads,
  MODDB_URL,
  modDbDetails,
  modDbList,
  pauseJob,
  startJob,
  startUrlJob,
  throughput,
} from "./browse.ts";
import { appLog, type Heartbeat, heartbeat, startAppLog } from "./applog.ts";
import {
  cancelCoreInstall,
  catalog,
  copyInstallCore,
  coreEntries,
  CoreInstallError,
  coreJobs,
  pauseCoreInstall,
  placeInstallCore,
  startCoreInstall,
} from "./cores.ts";
import {
  BackupError,
  type Character,
  DEFAULT_KEEP,
  deleteBackup,
  listBackups,
  readCharacter,
  restoreBackup,
  takeBackup,
} from "./backups.ts";
import {
  type Activity,
  activityJson,
  characterLine,
  DISCORD_CLIENT_ID,
  DiscordPresence,
  IDLE_ACTIVITY,
  runActivity,
} from "./discord.ts";
import { DOC_TYPES, findDocs, modLinks, webUrl } from "./docs.ts";
import { copyTree, installArchive } from "./install.ts";
import { exordiumManifestFromD2SE, normalizeManifest } from "./mod-manifest.ts";
import { checkRealm, realmAddress } from "./realm.ts";
import { runHidden } from "./native.ts";
import { pickFolderNative, pickOpenFilesNative } from "./native-dialog.ts";
import { exordiumRoot, userDataFolder } from "./paths.ts";
import {
  cancelCopy,
  checkInstall,
  copyJob,
  copyJobs,
  createLibrary,
  folderSize,
  installModFolders,
  isLibrary,
  libraryFolder,
  recordLibraryTransfer,
  startCopy,
  type TransferMode,
} from "./library-setup.ts";
import { APP_VERSION, sweepUpdate, UPDATE_REPO, UpdateError, Updater } from "./updater.ts";
import { isLive, processAlive, type SessionRecord, Sessions } from "./sessions.ts";
import { translate } from "./translate.ts";
import { powerShellLiteral, runPowerShellHidden } from "./windows-hidden-process.ts";
import { hardenedWebViewEnv, startDetached, watchWebView } from "./webview.ts";
import {
  closeWindow,
  minimizeWindow,
  prepareWindow,
  setUpWindow,
  startWindowDrag,
  startWindowResize,
  toggleMaximizeWindow,
  windowState,
} from "./window.ts";

const isDev = Deno.env.get("EXORDIUM_DEV") === "1";
const viteDevOrigin = `http://127.0.0.1:${Deno.env.get("VITE_DEV_PORT") ?? "5273"}`;
const distDir = new URL("./dist/", import.meta.url);
/** The name the loader has inside a box; see installNativeLoader. */
const GAME_EXE = "Game.exe";
/** Old injector-sidecar names. Release boxes delete these if an earlier build left them behind. */
const EXORDIUM_MOD_FILE = "exordium.mod.json";
const EXPANSION_ARCHIVES = new Set(["d2exp.mpq", "d2xmusic.mpq", "d2xtalk.mpq", "d2xvideo.mpq"]);

function coreTitle(version: string): string {
  return `${version} ${coreLabel(version)}`;
}

function coreLabel(version: string): "LOD" | "Diablo II" {
  const match = /^1\.(\d{2})[a-z]?$/i.exec(version.trim());
  if (!match) return "LOD";
  return Number(match[1]) <= 6 ? "Diablo II" : "LOD";
}

// First, so everything after it is on the record (applog.ts). The details are read every ten
// minutes, long after the module has finished loading.
startAppLog(() => ({ eventStreams: eventStreams.size, running: sessionRunning.length + legacyRunning.length }));
const sessions = new Sessions(exordiumRoot);

const server = Deno.serve(
  { port: Number(Deno.env.get("EXORDIUM_PORT") ?? 8235), hostname: "127.0.0.1" },
  (request) =>
    handleRequest(request).catch((error) => {
      console.error("request failed:", request.method, request.url, error);
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }),
);

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/scan-d2se") return await scanD2SE(url);
  if (url.pathname === "/api/setup") return await setupRoute(request);
  if (url.pathname === "/api/import-d2se-metadata") return await importD2SEMetadata(request);
  if (url.pathname === "/api/d2se-converter/preview") return await d2seConverterPreview(request);
  if (url.pathname === "/api/d2se-converter/write") return await d2seConverterWrite(request);
  if (url.pathname === "/api/d2se-converter/size") return await d2seConverterSize(request);
  if (url.pathname === "/api/build-box") return await buildBox(request);
  if (url.pathname === "/api/play") return await play(request);
  if (url.pathname === "/api/status") return Response.json(await status());
  if (url.pathname === "/api/events") return events();
  if (url.pathname === "/api/heartbeat" && request.method === "POST") {
    heartbeat(await request.json().catch(() => ({})) as Heartbeat);
    return new Response(null, { status: 204 });
  }
  if (url.pathname === "/api/settings") return await settings(request);
  if (url.pathname === "/api/app-settings") return await appSettingsRoute(request);
  if (url.pathname === "/api/app-settings/open") return await openAppFolder(request);
  if (url.pathname === "/api/manifest") return await manifestRoute(request, url);
  if (url.pathname === "/api/realm-check") return await realmCheck(url);
  if (url.pathname === "/api/title-updates") return await titleUpdates(request);
  if (url.pathname === "/api/art") return await artwork(request, url);
  if (url.pathname === "/api/characters") return await characters(url);
  if (url.pathname === "/api/activity") {
    // The overview's activity feed: a title's latest runs from the play ledger.
    const key = url.searchParams.get("key") ?? "";
    if (!parseEntryKey(key)) return Response.json({ error: "Missing key" }, { status: 400 });
    return Response.json({ runs: await sessions.recent(key) });
  }
  if (url.pathname === "/api/backups") return await backups(request, url);
  if (url.pathname === "/api/discord") return await discordRoute(request);
  // Not under Local-only's guard: these ask nothing of the network.
  if (url.pathname === "/api/cores/jobs") return Response.json({ jobs: coreJobs() });
  if (url.pathname === "/api/cores/pause" && request.method === "POST") {
    const body = await request.json().catch(() => null) as { core?: unknown; paused?: unknown } | null;
    const held = pauseCoreInstall(String(body?.core ?? ""), body?.paused === true);
    return Response.json({ ok: held }, { status: held ? 200 : 409 });
  }
  if (url.pathname === "/api/cores/cancel" && request.method === "POST") {
    const body = await request.json().catch(() => null) as { core?: unknown } | null;
    const cancelled = cancelCoreInstall(String(body?.core ?? ""));
    return Response.json({ ok: cancelled }, { status: cancelled ? 200 : 409 });
  }
  if (url.pathname === "/api/update") return await updateRoute(request);
  if (localOnlyGuarded(url.pathname)) {
    const refusal = await localOnlyRefusal();
    if (refusal) return refusal;
  }
  if (url.pathname === "/api/discord/connect") return await discordConnect(request);
  if (url.pathname === "/api/discord/callback") return await discordCallback(url);
  if (url.pathname === "/api/discord/disconnect") return await discordDisconnect(request);
  if (url.pathname === "/api/cores") return await coresRoute(request, url);
  if (url.pathname === "/api/translate") return await translateRoute(request);
  if (url.pathname === "/api/screenshots") return await screenshots(url);
  if (url.pathname === "/api/logs") return await logs(request, url);
  if (url.pathname === "/api/open-folder") return await openFolder(request);
  if (url.pathname === "/api/open-link") return await openLink(request);
  if (url.pathname === "/api/pick-folder") return await pickFolderRoute(url);
  if (url.pathname === "/api/pick-open-files") return await pickOpenFilesRoute(url);
  if (url.pathname === "/api/symlink-status") return Response.json(await symlinkStatus());
  if (url.pathname === "/api/restart-admin") {
    return Deno.build.os === "windows" ? await restartAdmin(request) : windowsOnly("Restarting as administrator");
  }
  if (url.pathname === "/api/install-local-archive") return await installLocalArchive(request);
  if (url.pathname.startsWith("/api/library/")) return await libraryRoute(request, url);
  if (url.pathname === "/api/collections") return await collectionsRoute(request);
  if (url.pathname.startsWith("/api/docs/")) return await serveDoc(url);
  if (url.pathname === "/api/browse" || url.pathname.startsWith("/api/browse/")) {
    return await browseRoute(request, url);
  }
  if (url.pathname === "/api/launch-d2se") {
    return Deno.build.os === "windows" ? await launchD2SE(request) : windowsOnly("Starting a mod through D2SE");
  }
  if (url.pathname.startsWith("/api/window/")) return await windowRoute(url);
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
}

console.log(`Exordium desktop dev server: http://127.0.0.1:${server.addr.port}/`);
// After the module has finished evaluating: startInstance reads state declared further down.
setTimeout(() => void startInstance(), 0);
setTimeout(() => void startupUpdate(), 5_000);
// Runs are read from the launchers' records, including any that started or ended while Exordium was
// closed, and every change after that is pushed to the page.
setTimeout(() => {
  if (isPackaged()) watchWebView(() => void restartApp());
  void refreshSessions().then(() => notify("status"));
  void sessions.watch(() => void refreshSessions().then(() => notify("status")));
}, 0);
// Only finds a window under `deno desktop`; a plain `deno run` has none and this quietly does nothing.
void setUpWindow();

/** The page's own title bar. `ready` answers whether there is a desktop window at all; see window.ts. */
async function windowRoute(url: URL): Promise<Response> {
  switch (url.pathname.slice("/api/window/".length)) {
    case "ready":
      return Response.json({ desktop: await prepareWindow() });
    case "state":
      return Response.json(windowState());
    case "minimize":
      return Response.json({ ok: minimizeWindow() });
    case "maximize":
      return Response.json(toggleMaximizeWindow());
    case "close":
      return Response.json({ ok: closeWindow() });
    case "drag":
      return Response.json(startWindowDrag());
    case "resize":
      return Response.json({ ok: startWindowResize(url.searchParams.get("edge") ?? "") });
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}

type TitleSetup = {
  setup: ModSetup;
  problems: { level: "error" | "warning"; message: string }[];
  /** From exordium.mod.json; a D2SE setup has neither. */
  author?: string | null;
  links?: { label?: unknown; url?: unknown }[];
};

type TitleUpdateSettings = {
  automatic: boolean;
  background: boolean;
  channel: "stable" | "testing" | "local";
  endpoint: string | null;
};

type TitleUpdateCheck = {
  checkedAt: string;
  endpoint: string;
  channel: TitleUpdateSettings["channel"];
  currentVersion: string | null;
  latestVersion: string | null;
  available: boolean;
  page: string | null;
  notes: string | null;
  downloadCount: number;
  error: string | null;
};

interface ExordiumModManifest {
  title?: unknown;
  name?: unknown;
  version?: unknown;
  core?: unknown;
  renderer?: unknown;
  windowed?: unknown;
  noSound?: unknown;
  direct?: unknown;
  txt?: unknown;
  hardcore?: unknown;
  plugY?: unknown;
  language?: unknown;
  skipToBNet?: unknown;
  seed?: unknown;
  startAct?: unknown;
  launch?: Record<string, unknown> | null;
  loads?: Record<string, unknown> | null;
  mpqs?: unknown;
  dlls?: unknown;
  author?: unknown;
  links?: unknown;
  description?: unknown;
  readme?: unknown;
  art?: { banner?: unknown; icon?: unknown; portrait?: unknown } | null;
  realm?: Record<string, unknown> | null;
  update?: unknown;
  updates?: unknown;
}

/**
 * A mod's setup: its `exordium.mod.json` when it has one, else its `D2SE_SETUP.ini`. A modder who
 * writes the native manifest means it, so it wins; the D2SE file stays for D2SE itself.
 */
async function readTitleSetup(folder: string): Promise<TitleSetup | null> {
  const native = await readExordiumMod(folder);
  if (native) return native;
  const setup = await readSetupFile(folder);
  return setup ? { setup, problems: [] } : null;
}

async function readExordiumMod(folder: string): Promise<TitleSetup | null> {
  let text: string;
  try {
    text = await Deno.readTextFile(`${folder}/${EXORDIUM_MOD_FILE}`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }

  const problems: TitleSetup["problems"] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      setup: nativeSetup({ title: folder.slice(folder.lastIndexOf("/") + 1), core: null }),
      problems: [{ level: "error", message: `${EXORDIUM_MOD_FILE} is not valid JSON: ${(error as Error).message}` }],
    };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {
      setup: nativeSetup({ title: folder.slice(folder.lastIndexOf("/") + 1), core: null }),
      problems: [{ level: "error", message: `${EXORDIUM_MOD_FILE} must be a JSON object.` }],
    };
  }

  const manifest = json as ExordiumModManifest;
  const launch = isRecord(manifest.launch) ? manifest.launch : {};
  const loads = isRecord(manifest.loads) ? manifest.loads : {};
  const title = textValue(manifest.title) ?? textValue(manifest.name) ?? folder.slice(folder.lastIndexOf("/") + 1);
  const core = textValue(manifest.core);
  if (!core) problems.push({ level: "error", message: `${EXORDIUM_MOD_FILE} must set "core", for example "1.13c".` });

  const setup = nativeSetup({
    title,
    version: textValue(manifest.version),
    core,
    renderer: rendererValue(launch.renderer ?? manifest.renderer, problems),
    windowed: boolValue(launch.windowed ?? manifest.windowed, false),
    noSound: boolValue(launch.noSound ?? manifest.noSound, false),
    direct: boolValue(launch.direct ?? manifest.direct, false),
    txt: boolValue(launch.txt ?? manifest.txt, false),
    hardcore: boolValue(launch.hardcore ?? manifest.hardcore, true),
    plugY: boolValue(launch.plugY ?? manifest.plugY, false),
    language: textValue(launch.language ?? manifest.language),
    skipToBNet: boolValue(launch.skipToBNet ?? manifest.skipToBNet, false),
    seed: launch.seedEnabled === false ? null : seedValue(launch.seed ?? manifest.seed),
    startAct: launch.startActEnabled === false ? null : actValue(launch.startAct ?? manifest.startAct),
    perspective: boolValue(launch.perspective, false),
    lowQuality: boolValue(launch.lowQuality, false),
    gamma: launch.gammaEnabled === false ? null : gammaValue(launch.gamma),
    vsync: boolValue(launch.vsync, false),
    noCompress: boolValue(launch.noCompress, false),
    noFixAspect: boolValue(launch.noFixAspect, false),
    backgroundSound: boolValue(launch.backgroundSound, false),
    description: textValue(manifest.description),
    readme: textValue(manifest.readme),
    d2mod: boolValue(loads.d2mod, false),
    nefex: boolValue(loads.nefex, false),
    d2extra: boolValue(loads.d2extra, false),
    mpqs: textList(loads.mpqs ?? manifest.mpqs, "mpqs", problems),
    dlls: textList(loads.dlls ?? manifest.dlls, "dlls", problems),
    realm: realmValue(manifest.realm, problems),
  });
  const result: TitleSetup = {
    setup,
    problems,
    author: textValue(manifest.author),
    links: Array.isArray(manifest.links) ? manifest.links as { label?: unknown; url?: unknown }[] : [],
  };
  updateSettingsValue(manifest.update ?? manifest.updates, problems);
  return result;
}

function nativeSetup(input: {
  title: string;
  version?: string | null;
  core: string | null;
  renderer?: Renderer;
  windowed?: boolean;
  noSound?: boolean;
  direct?: boolean;
  txt?: boolean;
  hardcore?: boolean;
  plugY?: boolean;
  language?: string | null;
  skipToBNet?: boolean;
  seed?: string | null;
  startAct?: 1 | 2 | 3 | 4 | 5 | null;
  perspective?: boolean;
  lowQuality?: boolean;
  gamma?: number | null;
  vsync?: boolean;
  noCompress?: boolean;
  noFixAspect?: boolean;
  backgroundSound?: boolean;
  description?: string | null;
  readme?: string | null;
  d2mod?: boolean;
  nefex?: boolean;
  d2extra?: boolean;
  mpqs?: string[];
  dlls?: string[];
  realm?: ModSetup["realm"];
}): ModSetup {
  const renderer = input.renderer ?? "glide";
  const rendererCode = { ddraw: 0, d3d: 1, opengl: 2, glide: 3 }[renderer];
  return {
    createdFor: "Exordium",
    intact: true,
    player: {
      renderer,
      rendererCode,
      windowed: input.windowed ?? false,
      noSound: input.noSound ?? false,
      hardcore: input.hardcore ?? true,
      plugY: input.plugY ?? false,
      direct: input.direct ?? false,
      txt: input.txt ?? false,
      language: input.language ?? "MOD",
      skipToBNet: input.skipToBNet ?? false,
      seed: input.seed ?? null,
      startAct: input.startAct ?? null,
      perspective: input.perspective ?? false,
      lowQuality: input.lowQuality ?? false,
      gamma: input.gamma ?? null,
      vsync: input.vsync ?? false,
      noCompress: input.noCompress ?? false,
      noFixAspect: input.noFixAspect ?? false,
      backgroundSound: input.backgroundSound ?? false,
    },
    mod: {
      core: input.core,
      name: input.title,
      title: input.title,
      version: input.version ?? null,
      banner: null,
      readme: input.readme ?? null,
      description: input.description ?? null,
      homepage: null,
      board: null,
      modable: true,
      forceDirect: false,
      forceTxt: false,
      allowHardcore: true,
      allowSinglePlayerMultistart: false,
      allowPlugY: true,
    },
    loads: {
      nefex: input.nefex ?? false,
      d2mod: input.d2mod ?? false,
      d2extra: input.d2extra ?? false,
      dlls: input.dlls ?? [],
      // The game opens patch_d2.mpq itself whenever it is there; it is not an option.
      patchD2: true,
      mpqs: input.mpqs ?? [],
    },
    realm: input.realm ?? null,
  };
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function seedValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value !== "string") return null;
  const seed = value.trim();
  return /^\d{1,10}$/.test(seed) ? seed : null;
}

function actValue(value: unknown): 1 | 2 | 3 | 4 | 5 | null {
  const act = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return act === 1 || act === 2 || act === 3 || act === 4 || act === 5 ? act : null;
}

/** `-gamma`: a whole number from 1 to 255. The game's own default is 155. */
function gammaValue(value: unknown): number | null {
  const gamma = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isInteger(gamma) && gamma >= 1 && gamma <= 255 ? gamma : null;
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Which plugin systems' DLLs these files hold, at their top level, where the plan loads them from. */
function pluginFiles(files: readonly { path: string }[]) {
  const names = new Set(files.map((file) => file.path.toLowerCase()));
  return { d2mod: names.has("d2mod.dll"), nefex: names.has("nefex.dll"), d2extra: names.has("d2extra.dll") };
}

function rendererValue(value: unknown, problems: TitleSetup["problems"]): Renderer {
  if (value === undefined || value === null) return "glide";
  if (value === "ddraw" || value === "d3d" || value === "opengl" || value === "glide") return value;
  problems.push({ level: "warning", message: `Unknown renderer "${String(value)}"; using glide.` });
  return "glide";
}

function textList(value: unknown, name: string, problems: TitleSetup["problems"]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    problems.push({ level: "warning", message: `${EXORDIUM_MOD_FILE} "${name}" should be an array of strings.` });
    return [];
  }
  return value.flatMap((item) => {
    const text = textValue(item);
    if (text) return [text];
    problems.push({ level: "warning", message: `${EXORDIUM_MOD_FILE} "${name}" contains a non-string entry.` });
    return [];
  });
}

function updateSettingsValue(
  value: unknown,
  problems: TitleSetup["problems"],
): Partial<TitleUpdateSettings> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) {
    problems.push({ level: "warning", message: `${EXORDIUM_MOD_FILE} "update" should be an object.` });
    return undefined;
  }
  const channel = value.channel === "stable" || value.channel === "testing" || value.channel === "local"
    ? value.channel
    : undefined;
  if (value.channel !== undefined && channel === undefined) {
    problems.push({ level: "warning", message: `${EXORDIUM_MOD_FILE} "update.channel" is not recognized.` });
  }
  const settings: Partial<TitleUpdateSettings> = {};
  const endpoint = textValue(value.endpoint ?? value.manifest);
  if (endpoint) settings.endpoint = endpoint;
  if (channel) settings.channel = channel;
  if (typeof value.automatic === "boolean") settings.automatic = value.automatic;
  if (typeof value.background === "boolean") settings.background = value.background;
  return settings;
}

function realmValue(value: unknown, problems: TitleSetup["problems"]): ModSetup["realm"] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    problems.push({ level: "warning", message: `${EXORDIUM_MOD_FILE} "realm" should be an object.` });
    return null;
  }
  const realm = {
    gateway: textValue(value.gateway),
    timezone: textValue(value.timezone),
    gatewayName: textValue(value.gatewayName),
    selected: textValue(value.selected),
    port: textValue(value.port),
  };
  return Object.values(realm).some((entry) => entry !== null) ? realm : null;
}

async function writeExordiumModDraft(folder: string, setup: ModSetup): Promise<"created" | "exists"> {
  const file = `${folder}/${EXORDIUM_MOD_FILE}`;
  try {
    await Deno.stat(file);
    return "exists";
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const manifest = exordiumManifestFromD2SE(setup);
  await Deno.writeTextFile(file, JSON.stringify(manifest, null, 2) + "\n");
  return "created";
}

async function scanD2SE(url: URL): Promise<Response> {
  const root = url.searchParams.get("root")?.trim();
  if (!root) return Response.json({ error: "Missing root" }, { status: 400 });
  const state = await readState();
  const imported = await readD2SE(root, { hash: false, hashWritable: false, linkData: true });
  if (!imported) return Response.json({ error: "That folder is not a D2SE install." }, { status: 404 });
  const cores = new Map(imported.cores.map((core) => [core.version.toLowerCase(), core]));
  const importableMods = await installMods(state, imported.mods.map((mod) => mod.folder));
  // A folder still copying is half a mod (startCopy's `.partial`): the library shows its import, not a
  // title that could be played.
  const landed = imported.mods.filter((mod) => !mod.folder.endsWith(".partial"));
  const mods = await Promise.all(landed.map(async (mod) => {
    const folder = `${layoutPath(imported.layout.root, imported.layout.folders.mods, mod.folder)}`;
    // exordium.mod.json wins over D2SE_SETUP.ini (readTitleSetup).
    const native = await readExordiumMod(folder);
    const target = { kind: "mod" as const, folder: mod.folder };
    const key = entryKey(target);
    const setup = native?.setup ?? mod.setup ?? null;
    const core = setup?.mod.core ? cores.get(setup.mod.core.toLowerCase()) ?? null : null;
    const language = setup?.player.language?.toUpperCase() ?? null;
    const loader = setup
      ? buildLoaderPlan(
        previewPlan(
          gameFilesForCore(imported.game, setup.mod.core),
          core,
          mod,
          language,
          await plugYFolderFor(imported.layout.root, setup, mod, { hash: false }),
        ),
        setup,
        loaderPlanOptions(setup),
      )
      : null;
    return {
      kind: "mod" as const,
      key,
      art: await artSummary(imported.layout.root, target),
      folder: mod.folder,
      title: setup?.mod.title ?? mod.folder,
      author: native?.author ?? null,
      realm: setup?.realm ?? null,
      description: plainDescription(setup?.mod.description),
      links: modLinks(setup?.mod ?? null, native?.links),
      ...findDocs(mod.scan.layer.map((file) => file.source), setup?.mod.readme ?? null),
      core: setup?.mod.core ?? null,
      version: setup?.mod.version ?? null,
      language: setup?.player.language ?? null,
      updateCheck: state.updateChecks[key] ?? null,
      files: mod.scan.layer.length,
      saves: mod.scan.writable.length,
      screenshots: await screenshotCount(imported.layout.root, target),
      languages: Object.keys(mod.scan.languages).sort(),
      problems: [
        ...(setup ? modProblems(setup, mod.scan, imported.layout.cores, core?.scan ?? null) : mod.problems),
        ...(native?.problems ?? []),
        ...(loader?.problems ?? []),
      ],
      archives: loader?.archives ?? [],
      plugins: loader?.plugins ?? [],
      pluginFiles: pluginFiles([...mod.scan.layer, ...(core?.scan.layer ?? [])]),
      settings: loader?.settings ?? null,
    };
  }));
  // A core is also playable on its own, as D2SE's vanilla game, with the core's own D2SE_SETUP.ini.
  const coreEntries = await Promise.all(imported.cores.map(async (core) => {
    const target = { kind: "core" as const, version: core.version };
    const key = entryKey(target);
    const manifest = await readCoreManifest(imported.layout.root, core.version);
    const setup = manifest?.setup ?? await readCoreSetup(imported.layout.root, core.version);
    const language = setup?.player.language?.toUpperCase() ?? null;
    const loader = setup
      ? buildLoaderPlan(
        previewPlan(
          gameFilesForCore(imported.game, setup.mod.core),
          core,
          null,
          language,
          await plugYFolderFor(imported.layout.root, setup, null, { hash: false }),
        ),
        setup,
        loaderPlanOptions(setup),
      )
      : null;
    return {
      kind: "core" as const,
      key,
      art: await artSummary(imported.layout.root, target),
      folder: core.version,
      title: manifest?.setup.mod.title ?? coreTitle(core.version),
      author: manifest?.author ?? null,
      realm: setup?.realm ?? null,
      description: plainDescription(setup?.mod.description),
      links: modLinks(setup?.mod ?? null, manifest?.links),
      ...findDocs(core.scan.layer.map((file) => file.source), setup?.mod.readme ?? null),
      core: core.version,
      version: setup?.mod.version ?? null,
      language: setup?.player.language ?? null,
      updateCheck: state.updateChecks[key] ?? null,
      files: core.scan.layer.length,
      saves: core.scan.writable.length,
      screenshots: await screenshotCount(imported.layout.root, target),
      languages: Object.keys(core.scan.languages).sort(),
      problems: [
        ...(setup ? [] : [{ level: "error" as const, message: `Core ${core.version} has no D2SE_SETUP.ini.` }]),
        ...(loader?.problems ?? []),
      ],
      archives: loader?.archives ?? [],
      plugins: loader?.plugins ?? [],
      pluginFiles: pluginFiles(core.scan.layer),
      settings: loader?.settings ?? null,
    };
  }));
  if (appSettingsFromState(state).boxes.autoCleanStale) {
    await cleanStaleBoxes(imported.layout.root, [
      ...imported.mods.map((mod) => ({ kind: "mod" as const, folder: mod.folder })),
      ...imported.cores.map((core) => ({ kind: "core" as const, version: core.version })),
    ]).catch((error) => appLog("warn", `stale box cleanup: ${(error as Error).message}`));
  }
  return Response.json({
    root: imported.layout.root,
    activeFolder: imported.launcher?.activeFolder ?? null,
    gameArchives: imported.game.map((file) => file.path),
    missingGameArchives: imported.missingGameArchives,
    cores: coreEntries,
    mods,
    importableMods: importableMods.sort((a, b) => a.title.localeCompare(b.title)),
  });
}

async function importD2SEMetadata(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as { root?: unknown; folders?: unknown } | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  if (!root) return Response.json({ error: "Missing root" }, { status: 400 });
  const wanted = Array.isArray(body?.folders)
    ? body.folders.filter((item): item is string => typeof item === "string")
    : undefined;
  const result = await importD2SEMetadataForFolders(root, wanted);
  if (!result) return Response.json({ error: "That folder is not a D2SE install." }, { status: 404 });
  return Response.json(result);
}

async function importD2SEMetadataForFolders(root: string, wanted?: string[]) {
  const imported = await readD2SE(root, {
    hash: false,
    hashWritable: false,
    linkData: true,
    ...(wanted ? { mods: wanted } : {}),
  });
  if (!imported) return null;

  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { folder: string; error: string }[] = [];
  for (const mod of imported.mods) {
    if (!mod.setup) {
      skipped.push(mod.folder);
      continue;
    }
    try {
      const result = await writeExordiumModDraft(
        `${layoutPath(imported.layout.root, imported.layout.folders.mods, mod.folder)}`,
        mod.setup,
      );
      if (result === "created") created.push(mod.folder);
      else skipped.push(mod.folder);
    } catch (error) {
      failed.push({ folder: mod.folder, error: (error as Error).message });
    }
  }
  return { created, skipped, failed };
}

async function d2seConverterPreview(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { root?: unknown; folder?: unknown; path?: unknown }
    | null;
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  const source = path ? await folderMod(path) : await installMod(folder);
  if (source instanceof Response) return source;
  // The mod's own exordium.mod.json when it has one; a draft from its D2SE_SETUP.ini otherwise; for a
  // plain folder (an old mod already unpacked), a draft from what is in it, to review and complete.
  const own = await Deno.readTextFile(`${source.dir}/${EXORDIUM_MOD_FILE}`).then((t) => JSON.parse(t)).catch(() =>
    null
  );
  const manifest = isRecord(own)
    ? own
    : source.setup
    ? exordiumManifestFromD2SE(source.setup)
    : await folderManifestDraft(source.dir, source.folder);
  return Response.json({
    folder: source.folder,
    from: winPath(source.dir),
    path: winPath(`${libraryRoot}/${LIBRARY_FOLDERS.mods}/${source.folder}/${EXORDIUM_MOD_FILE}`),
    exists: await Deno.stat(`${libraryRoot}/${LIBRARY_FOLDERS.mods}/${source.folder}`).then(() => true, () => false),
    hasOwn: isRecord(own),
    manifest,
  });
}

async function d2seConverterWrite(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { root?: unknown; folder?: unknown; path?: unknown; text?: unknown; overwrite?: unknown; move?: unknown }
    | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  const text = typeof body?.text === "string" ? body.text : "";
  const move = body?.move === true;
  if (!root || (!folder && !path) || !text.trim()) {
    return Response.json({ error: "Missing root, folder, or JSON." }, {
      status: 400,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return Response.json({ error: `Invalid JSON: ${(error as Error).message}` }, { status: 400 });
  }
  if (!isRecord(parsed)) return Response.json({ error: "The manifest must be a JSON object." }, { status: 400 });
  const source = path ? await folderMod(path) : await installMod(folder);
  if (source instanceof Response) return source;
  const dest = `${libraryRoot}/${LIBRARY_FOLDERS.mods}/${source.folder}`;
  if (await Deno.stat(dest).then(() => true, () => false)) {
    return Response.json({ error: `${source.folder} is already in Exordium's library.` }, { status: 409 });
  }
  // The whole folder is copied (or moved, if asked), then its exordium.mod.json written into the
  // library's copy. A copy leaves the install untouched; a move removes the folder from the install.
  const job = startCopy("mod", source.folder, [{ from: source.dir, to: dest }], {
    move,
    queue: true,
    then: async () => {
      await Deno.writeTextFile(`${dest}/${EXORDIUM_MOD_FILE}`, JSON.stringify(parsed, null, 2) + "\n");
      await warmLaunchHashes(libraryRoot, { mods: [source.folder] });
    },
  });
  return Response.json({ ok: true, folder: source.folder, job, path: winPath(`${dest}/${EXORDIUM_MOD_FILE}`) });
}

/**
 * POST `{ folder | path }`: the size of the mod folder the converter is about to import. Asked for on
 * its own, after the preview, since walking a multi-GB mod takes a while.
 */
async function d2seConverterSize(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as { folder?: unknown; path?: unknown } | null;
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  const source = path ? await folderMod(path) : await installMod(folder);
  if (source instanceof Response) return source;
  return Response.json({ size: await folderSize(source.dir) });
}

/** A mod folder of the player's install, for the import: its path, its D2SE setup. */
async function installMod(folder: string) {
  const state = await readState();
  if (!state.install) return Response.json({ error: "No Diablo II install is linked." }, { status: 409 });
  if (!folder || /[\\/]|^\.\.?$/.test(folder)) return Response.json({ error: "Missing folder." }, { status: 400 });
  const install = state.install.replace(/\\/g, "/").replace(/\/+$/, "");
  const names = await Array.fromAsync(Deno.readDir(`${install}/MODS`)).catch(() => [] as Deno.DirEntry[]);
  const name = names.find((entry) => entry.isDirectory && entry.name.toLowerCase() === folder.toLowerCase())?.name;
  if (!name) return Response.json({ error: `No ${folder} in the install's MODS folder.` }, { status: 404 });
  const dir = `${install}/MODS/${name}`;
  const text = await Deno.readTextFile(`${dir}/D2SE_SETUP.ini`).catch(() => null);
  // No folder size here: walking a multi-GB mod on every preview was the converter's lag. The
  // import's copy job still reports bytes as it runs.
  return { folder: name, dir, setup: text === null ? null : readModSetup(parseIni(text)) };
}

/**
 * A mod folder anywhere on disk (Library → Import folder): an old mod already unpacked, say. Never
 * the library itself, which would copy a folder into itself.
 */
async function folderMod(path: string) {
  const dir = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!(await Deno.stat(dir).catch(() => null))?.isDirectory) {
    return Response.json({ error: `${winPath(dir)} is not a folder.` }, { status: 404 });
  }
  const library = libraryRoot.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const lower = dir.toLowerCase();
  if (lower === library || lower.startsWith(`${library}/`)) {
    return Response.json({ error: "That folder is already inside Exordium's library." }, { status: 400 });
  }
  const name = dir.split("/").pop() ?? "";
  if (!name || /^[a-z]:$/i.test(name)) {
    return Response.json({ error: "Choose a mod's folder, not a drive." }, { status: 400 });
  }
  const text = await Deno.readTextFile(`${dir}/D2SE_SETUP.ini`).catch(() => null);
  return { folder: name, dir, setup: text === null ? null : readModSetup(parseIni(text)) };
}

/**
 * A first exordium.mod.json for a folder with neither its own nor a D2SE_SETUP.ini: the folder's name
 * as the title, and the MPQs and DLLs at its top level as what it loads (D2Mod.dll and PlugY.dll by
 * what they are). The core is left blank for the player to choose; the converter shows the draft to
 * review before anything is copied.
 */
async function folderManifestDraft(dir: string, name: string): Promise<Record<string, unknown>> {
  const files = await Array.fromAsync(Deno.readDir(dir)).catch(() => [] as Deno.DirEntry[]);
  const top = files.filter((entry) => entry.isFile).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
  const mpqs = top.filter((file) => /\.mpq$/i.test(file));
  const dlls = top.filter((file) => /\.dll$/i.test(file));
  const d2mod = dlls.some((file) => file.toLowerCase() === "d2mod.dll");
  const plugY = dlls.some((file) => file.toLowerCase() === "plugy.dll");
  const known = new Set(["d2mod.dll", "plugy.dll"]);
  const draft = exordiumManifestFromD2SE(readModSetup(parseIni("")));
  return {
    ...draft,
    title: name,
    name,
    core: "",
    launch: { ...(isRecord(draft.launch) ? draft.launch : {}), plugY },
    loads: {
      ...(isRecord(draft.loads) ? draft.loads : {}),
      d2mod,
      mpqs,
      dlls: dlls.filter((file) => !known.has(file.toLowerCase())),
    },
  };
}

/** The install's mods not yet in the library: what the converter offers to import. */
async function installMods(state: AppState, inLibrary: string[]) {
  if (!state.install) return [];
  const install = state.install.replace(/\\/g, "/").replace(/\/+$/, "");
  const have = new Set(inLibrary.map((folder) => folder.toLowerCase()));
  const found: { folder: string; title: string; core: string | null }[] = [];
  for (const folder of await installModFolders(install)) {
    if (have.has(folder.toLowerCase())) continue;
    const dir = `${install}/MODS/${folder}`;
    const native = await readExordiumMod(dir).catch(() => null);
    const text = await Deno.readTextFile(`${dir}/D2SE_SETUP.ini`).catch(() => null);
    const setup = native?.setup ?? (text === null ? null : readModSetup(parseIni(text)));
    found.push({ folder, title: setup?.mod.title ?? setup?.mod.name ?? folder, core: setup?.mod.core ?? null });
  }
  return found.sort((a, b) => a.title.localeCompare(b.title));
}

// ---- Setup: the library, from the player's install (library-setup.ts) ---------------------------

const libraryRoot = libraryFolder(exordiumRoot);

/**
 * GET: the library, the linked install and what it holds, and the transfer jobs. POST `{ action }`:
 * "check" an install (read only), "start" (make the library and place the game files). Automatic
 * placement prefers symlinks, then hardlinks, then copies. Cores come from the catalog
 * (`/api/cores`), not the install, except a 1.14 install's own, which is copied in with the game.
 */
async function setupRoute(request: Request): Promise<Response> {
  const state = await readState();
  const view = async () => ({
    library: winPath(libraryRoot),
    ready: await isLibrary(state.root) && state.root?.replace(/\\/g, "/") === libraryRoot,
    install: state.install ? winPath(state.install) : null,
    check: state.install ? await checkInstall(state.install) : null,
    jobs: copyJobs(),
  });
  if (request.method !== "POST") return Response.json(await view());
  const body = await request.json().catch(() => null) as
    | { action?: unknown; install?: unknown; versions?: unknown; job?: unknown; mode?: unknown }
    | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (action === "job") {
    return Response.json({ job: typeof body?.job === "string" ? copyJob(body.job) : null });
  }
  if (action === "cancel") {
    return Response.json({ job: typeof body?.job === "string" ? cancelCopy(body.job) : null });
  }
  if (action === "check" || action === "start") {
    const install = typeof body?.install === "string"
      ? body.install.trim().replace(/\\/g, "/").replace(/\/+$/, "")
      : "";
    if (!install) return Response.json({ error: "Choose your Diablo II folder." }, { status: 400 });
    if (!(await Deno.stat(install).then((s) => s.isDirectory, () => false))) {
      return Response.json({ error: `${winPath(install)} is not a folder.` }, { status: 400 });
    }
    if (install.toLowerCase().startsWith(`${libraryRoot.toLowerCase()}`)) {
      return Response.json({ error: "That is Exordium's own library, not a Diablo II install." }, { status: 400 });
    }
    const check = await checkInstall(install);
    if (action === "check" || check.problem) return Response.json({ check }, { status: check.problem ? 422 : 200 });
    const mode = typeof body?.mode === "string" && ["auto", "symlink", "hardlink", "copy", "move"].includes(body.mode)
      ? body.mode as TransferMode
      : "auto";
    await createLibrary(libraryRoot, install);
    await writeState((s) => void (s.install = install));
    const job = startCopy(
      "game",
      "Game files",
      check.gameFiles.map((file) => ({
        from: `${install}/${file.name}`,
        to: `${libraryRoot}/${LIBRARY_FOLDERS.game}/${file.name}`,
      })),
      {
        skipExisting: true,
        mode,
        then: async (finished) => {
          await recordLibraryTransfer(libraryRoot, mode, finished.methods);
          const installCore = await rootCoreName(install).catch(() => null);
          if (installCore) {
            await placeInstallCore(libraryRoot, install, installCore).catch((error) =>
              appLog("warn", `core ${installCore} was not copied: ${(error as Error).message}`)
            );
          }
          await warmLaunchHashes(libraryRoot);
          await writeState((s) => void (s.root = libraryRoot));
        },
      },
    );
    return Response.json({ check, job });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}

/** What a box runs: a mod folder, or a core on its own (vanilla, with the core's own setup). */
type BoxTarget = { kind: "mod"; folder: string } | { kind: "core"; version: string };
type LaunchPhase = "checking" | "building" | "registry" | "loader" | "starting";

interface LaunchProgress {
  key: string;
  title: string;
  phase: LaunchPhase;
  current: number | null;
  total: number | null;
}

const preparing = new Map<string, LaunchProgress>();

function reportLaunch(
  key: string,
  title: string,
  phase: LaunchPhase,
  current: number | null = null,
  total: number | null = null,
): void {
  preparing.set(key, { key, title, phase, current, total });
  notify("status");
}

/** A library core's folder: `cores/<version>`. */
function coreFolder(root: string, version: string): string {
  return `${root}/${LIBRARY_FOLDERS.cores}/${version}`;
}

/**
 * A core's own setup, for playing it vanilla: its `D2SE_SETUP.ini`. A 1.14 core has none (D2SE never
 * ran 1.14), and nor does a core from the browser's Cores tab (cores.ts), so those get DirectDraw in a
 * window, which needs no wrapper; Properties changes it.
 */
/**
 * A core's own exordium.mod.json, when it ships one: its title, author, links, launch settings and
 * art, in place of the built-in name and defaults. "core" may be left out; it is the folder's version.
 */
async function readCoreManifest(root: string, version: string): Promise<TitleSetup | null> {
  const native = await readExordiumMod(coreFolder(root, version));
  if (!native) return null;
  if (!native.setup.mod.core) {
    native.setup.mod.core = version;
    native.problems = native.problems.filter((problem) => !problem.message.includes('must set "core"'));
  }
  return native;
}

/** A core's name: its exordium.mod.json title, else the built-in one ("1.10f LOD"). */
async function coreName(root: string, version: string): Promise<string> {
  return (await readCoreManifest(root, version))?.setup.mod.title ?? coreTitle(version);
}

/**
 * A core's setup, for playing it vanilla: its exordium.mod.json, else its D2SE_SETUP.ini (a core
 * copied from a D2SE install), else DirectDraw in a window, which needs no wrapper.
 */
async function readCoreSetup(root: string, version: string): Promise<ModSetup | null> {
  const manifest = await readCoreManifest(root, version);
  if (manifest) return manifest.setup;
  const setup = await readSetupFile(coreFolder(root, version));
  if (setup) return setup;
  return nativeSetup({ title: coreTitle(version), core: version, renderer: "ddraw", windowed: true });
}

/**
 * GET `?root[&refresh=1]`: the cores catalog with what this install has. POST `{ root, core }`:
 * installs one into the library's `cores` (cores.ts), or copies a 1.14 core from the install; the page
 * polls GET for its progress.
 */
async function coresRoute(request: Request, url: URL): Promise<Response> {
  if (request.method === "POST") {
    const body = await request.json().catch(() => null) as { root?: unknown; core?: unknown } | null;
    const root = typeof body?.root === "string" ? body.root.trim().replace(/[\\/]+$/, "").replace(/\\/g, "/") : "";
    const core = typeof body?.core === "string" ? body.core.trim() : "";
    if (!root || !core) return Response.json({ error: "Missing root or core" }, { status: 400 });
    try {
      const warm = (installed: string) => warmLaunchHashes(root, { cores: [installed] });
      return Response.json(
        isSingleExeCore(core)
          ? await copyInstallCore(root, (await readState()).install ?? null, core, warm)
          : await startCoreInstall(root, core, downloadsFolder, warm),
      );
    } catch (error) {
      if (error instanceof CoreInstallError) return Response.json({ error: error.message }, { status: 400 });
      throw error;
    }
  }
  const root = url.searchParams.get("root")?.trim().replace(/[\\/]+$/, "").replace(/\\/g, "/") || null;
  try {
    const list = await catalog(url.searchParams.get("refresh") === "1");
    if (!list) return Response.json({ configured: false, cores: [] });
    const install = (await readState()).install ?? null;
    return Response.json({ configured: true, cores: await coreEntries(root, list, install) });
  } catch (error) {
    return Response.json({ configured: true, cores: [], error: (error as Error).message });
  }
}

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
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { root?: unknown; folder?: unknown; core?: unknown; action?: unknown }
    | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const core = typeof body?.core === "string" ? body.core.trim() : "";
  if (!root || (!folder && !core)) return Response.json({ error: "Missing root, and folder or core" }, { status: 400 });
  const target: BoxTarget = folder ? { kind: "mod", folder } : { kind: "core", version: core };
  const action = typeof body?.action === "string" ? body.action : "build";

  try {
    if (action === "verify") return Response.json(await verifyD2SEBox(root, target));
    if (action === "rebuild") await backUpBeforeRebuild(root, target);
    return Response.json(await realiseD2SEBox(root, target));
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** The loader's per-core Game.exe copies (stamp-game.ts): beside the packaged app, or the native build. */
function stampedGamesFolder(): string {
  const exe = Deno.execPath().replaceAll("\\", "/");
  return /(^|\/)deno(\.exe)?$/i.test(exe)
    ? fileUrlPath(new URL("../../native/loader/build/game", import.meta.url))
    : `${exe.replace(/\/[^/]*$/, "")}/native/game`;
}

/** The box's Game.exe before 1.14: the loader copy stamped with the core's own Game.exe version. */
async function stampedGameExe(
  core: string | null,
  cache: Map<string, KnownFile>,
): Promise<{ file: ResolvedFile; source: string }> {
  const name = core?.trim().toLowerCase() ?? "";
  const folder = `${stampedGamesFolder()}/${name}`;
  const [found] = name ? await scanNamed(folder, [GAME_EXE], { hash: true, cache }).catch(() => []) : [];
  if (!found?.hash) {
    throw new HttpError(
      500,
      `No loader Game.exe for core ${core ?? "?"} in ${folder}. Run \`deno task build:loader\`.`,
    );
  }
  return {
    file: { path: GAME_EXE, hash: found.hash, size: found.size, layer: "loader", role: "core" },
    source: `${folder}/${found.source}`,
  };
}

/** The library's plugy folder as a box layer: its files, scanned. */
interface PlugYFolder {
  folder: string;
  files: ScannedFile[];
}

/**
 * The library's plugy folder for a title, when it has PlugY on, its mod brings none, and the folder
 * holds PlugY.dll; null otherwise (a missing PlugY is the loader plan's warning, not an error here).
 */
async function plugYFolderFor(
  root: string,
  setup: ModSetup | null,
  mod: ModImport | null,
  options: { hash: boolean; cache?: Map<string, KnownFile> },
): Promise<PlugYFolder | null> {
  if (!setup || !launchSettings(setup).plugY || isSingleExeCore(setup.mod.core)) return null;
  if (mod && holdsPlugY(mod.scan.layer)) return null;
  const folder = layoutPath(root, LIBRARY_PLUGY);
  // Scanned as a mod folder, which keeps subfolders: PlugY's own PlugY folder is part of it.
  const scan = await scanFolder(folder, "mod", {
    hash: options.hash,
    ...(options.cache ? { cache: options.cache } : {}),
  })
    .catch(() => null);
  return scan && holdsPlugY(scan.layer) ? { folder, files: scan.layer } : null;
}

async function boxSpecFor(root: string, target: BoxTarget, onHash?: (read: number, total: number) => void) {
  const state = await readState();
  const coreVersion = target.kind === "core"
    ? target.version
    : (await readTitleSetup(`${root.replace(/[\\/]+$/, "")}/${LIBRARY_FOLDERS.mods}/${target.folder}`))?.setup.mod
      .core ?? null;
  const cache = await hashCache();
  const imported = await readD2SE(root, {
    hash: true,
    hashWritable: false,
    linkData: true,
    cache,
    ...(onHash ? { onHash } : {}),
    mods: target.kind === "mod" ? [target.folder] : [],
    cores: coreVersion ? [coreVersion] : [],
  });
  await saveHashCache(cache);
  if (!imported) throw new HttpError(404, "That folder is not a D2SE install.");
  const core = coreVersion
    ? imported.cores.find((c) => c.version.toLowerCase() === coreVersion.toLowerCase()) ?? null
    : null;

  let mod: ModImport | null = null;
  let setup: ModSetup;
  let saves: string;
  if (target.kind === "mod") {
    mod = imported.mods[0] ?? null;
    if (!mod) throw new HttpError(404, `No mod folder named "${target.folder}".`);
    const native = await readExordiumMod(
      `${layoutPath(imported.layout.root, imported.layout.folders.mods, mod.folder)}`,
    );
    const titleSetup = native?.setup ?? mod.setup ?? null;
    if (!titleSetup) {
      throw new HttpError(422, `No D2SE_SETUP.ini or ${EXORDIUM_MOD_FILE}: cannot build a launchable box.`);
    }
    setup = titleSetup;
    const problems = [
      ...(native || !mod.setup
        ? modProblems(setup, mod.scan, imported.layout.cores, core?.scan ?? null)
        : mod.problems),
      ...(native?.problems ?? []),
    ];
    if (problems.some((problem) => problem.level === "error")) {
      throw new HttpError(422, problems.map((problem) => problem.message).join("\n"));
    }
    saves = `${layoutPath(imported.layout.root, imported.layout.folders.mods, mod.folder)}/save`;
  } else {
    if (!core) throw new HttpError(404, `No core named "${target.version}".`);
    const coreSetup = await readCoreSetup(imported.layout.root, core.version);
    if (!coreSetup) throw new HttpError(422, `Core ${core.version} has no D2SE_SETUP.ini.`);
    setup = coreSetup;
    saves = `${coreFolder(imported.layout.root, core.version)}/save`;
  }

  const language = setup.player.language?.toUpperCase() ?? null;
  const { plan, sources } = buildRealPlan(
    imported.layout.root,
    gameFilesForCore(imported.game, setup.mod.core),
    core,
    mod,
    language,
    await plugYFolderFor(imported.layout.root, setup, mod, { hash: true, cache }),
  );
  const loader = buildLoaderPlan(plan, setup, {
    ...loaderPlanOptions(setup),
    battlenetLockdown: appSettingsFromState(state).launch.battlenetLockdown,
  });
  if (loader.problems.some((problem) => problem.level === "error")) {
    throw new HttpError(422, loader.problems.map((problem) => problem.message).join("\n"));
  }
  const id = boxIdFor(imported.layout.root, target);
  // Before 1.14 the box's Game.exe is the loader: the copy stamped for this core at build time,
  // linked in like any other file in place of the core's (or a mod's) own Game.exe. It is added
  // after the loader plan is made, which reads the game's own files.
  let boxPlan = plan;
  if (!loader.singleExe && !loader.nativeGameExe) {
    const game = await stampedGameExe(setup.mod.core, cache);
    await saveHashCache(cache);
    sources.set(sourceKey(game.file.layer, game.file.path), game.source);
    boxPlan = {
      ...plan,
      files: [...plan.files.filter((file) => file.path.toLowerCase() !== GAME_EXE.toLowerCase()), game.file]
        .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase())),
    };
  }
  return {
    imported,
    state,
    appSettings: appSettingsFromState(state),
    core,
    mod,
    setup,
    plan,
    loader,
    id,
    boxes: await Boxes.open(exordiumRoot),
    spec: {
      id,
      plan: boxPlan,
      saves,
      folders: mod?.scan.data
        ? [{
          path: "data",
          target: `${layoutPath(imported.layout.root, imported.layout.folders.mods, mod.folder)}/${mod.scan.data}`,
        }]
        : [],
      source(file: ResolvedFile) {
        const source = sources.get(sourceKey(file.layer, file.path));
        if (!source) throw new Error(`No source for ${file.layer}:${file.path}`);
        return source;
      },
    },
  };
}

async function verifyD2SEBox(root: string, target: BoxTarget) {
  const { boxes, spec } = await boxSpecFor(root, target);
  const report = await boxes.verify(spec);
  return { ...report, folder: `${boxes.folder(spec.id)}/game`, id: spec.id };
}

/**
 * Builds (or reuses) a title's box and prepares copy `copy` of it. Copies share the box; each has its
 * own loader config, log and registry hive, since a running game keeps its hive open. While another
 * copy runs the box cannot be rebuilt (its files are in use) and Game.exe is not re-stamped.
 */
async function realiseD2SEBox(
  root: string,
  target: BoxTarget,
  copy = 1,
  othersRunning = false,
  progress?: (phase: LaunchPhase, current?: number, total?: number) => void,
) {
  // TEMP timing: which phase makes Play slow.
  const timings: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  progress?.("checking");
  let lastHashProgress = 0;
  const { imported, state, appSettings, core, setup, plan, loader, id, boxes, spec } = await boxSpecFor(
    root,
    target,
    (read, total) => {
      const now = performance.now();
      if (read === total || now - lastHashProgress >= 100) {
        lastHashProgress = now;
        progress?.("checking", read, total);
      }
    },
  );
  lap("readD2SE");
  lap("saveHashes");
  lap("setup");
  lap("plan");
  let lastLinkProgress = 0;
  const realised = await boxes.realise(
    spec,
    {
      modes: BOX_MODES,
      onProgress: (completed, total) => {
        const now = performance.now();
        if (completed === 0 || completed === total || now - lastLinkProgress >= 100) {
          lastLinkProgress = now;
          progress?.("building", completed, total);
        }
      },
    },
  ).catch((error) => {
    if (othersRunning && error instanceof BoxError) {
      throw new HttpError(409, "The mod changed since the running copy started. Close it to start another.");
    }
    throw error;
  });
  lap("realise");
  // The registry the game sees: the machine's Diablo II keys (read, never written), what D2SE would
  // set for this mod, the box's own InstallPath and Save Path, then what earlier runs changed.
  progress?.("registry");
  const snapshot = await machineSnapshot();
  lap("machineSnapshot");
  const base = { id: "machine", role: "base" as const, entries: snapshot.entries };
  const settings = settingsLayer(loader.settings);
  const box = boxLayer(gamePath(realised.folder));
  const writable = await readWritableLayer(exordiumRoot, id);
  const registry = resolve({ files: [], registry: [base, settings, box, writable] }).registry;
  const lowerRegistry = resolve({ files: [], registry: [base, settings, box] }).registry;
  const hive = await installRegistry(boxes.folder(id), registry, lowerRegistry, copy);
  lap("registry");
  const title = target.kind === "mod"
    ? setup.mod.title ?? target.folder
    : await coreName(imported.layout.root, target.version);
  const iconFile = await modArt(imported.layout.root, target, "icon");
  const icon = iconFile ? gamePath(iconFile) : null;
  const presence = gamePresenceAllowed(state, appSettings)
    ? activityJson(runActivity({ kind: target.kind, name: title, core: core?.version ?? loader.gameVersion ?? null }))
    : null;
  progress?.("loader");
  const files = await installNativeLoader(
    realised.folder,
    loader,
    hive,
    {
      title,
      icon,
      windowTitle: target.kind === "mod"
        ? gameWindowTitle(core?.version ?? loader.core, title, setup.mod.version)
        : gameWindowTitle(target.version, null, null),
    },
    {
      key: entryKey(target),
      boxId: id,
      presence,
      diagnostics: appSettings.diagnostics,
    },
    copy,
    othersRunning,
  );
  lap("loader");
  console.log(`[timing] ${id}`, JSON.stringify(timings));

  return {
    id,
    copy,
    config: files.config,
    log: files.log,
    launcher: files.launcher,
    singleExe: loader.singleExe,
    nativeGameExe: loader.nativeGameExe,
    sessionBacked: false,
    presence,
    key: entryKey(target),
    title,
    hive: hive.hive,
    registryFile: hive.file,
    hostRegistryFile: hive.hostFile,
    hostHive: hive.hostHive,
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

/**
 * Reads new immutable inputs once, when they enter the library. Later boxes reuse these persisted
 * hashes after a cheap size/timestamp check, so adding a mod never re-reads shared game/core bytes.
 */
async function warmLaunchHashes(
  root: string,
  only: { mods?: string[]; cores?: string[] } = {},
): Promise<void> {
  try {
    const cache = await hashCache();
    const imported = await readD2SE(root, {
      hash: true,
      hashWritable: false,
      linkData: true,
      cache,
      mods: only.mods ?? [],
      cores: only.cores ?? [],
    });
    if (!imported) throw new Error(`Could not warm launch files in ${root}.`);
    await saveHashCache(cache);
  } catch (error) {
    // Warming is an optimization after the files are safely installed. The first launch can retry
    // anything uncached, so a cache write failure must not turn a completed install into a failure.
    appLog("warn", `warming launch hashes: ${(error as Error).message}`);
  }
}

// ---- Playing ------------------------------------------------------------------------------------

/** What Exordium remembers between sessions: the install it reads, and what was played when. */
interface AppState {
  /** The library Exordium runs from: its own folder (library-setup.ts), never the player's install. */
  root: string | null;
  /** The player's Diablo II install: read by setup and by the mod import only. */
  install?: string | null;
  lastPlayed: string | null;
  playedAt: Record<string, string>;
  updateChecks: Record<string, TitleUpdateCheck>;
  /** Title keys pinned to the top of the list. */
  favorites: string[];
  /** Title keys hidden from the list; their files are untouched. */
  hidden: string[];
  /** The player's own sidebar groups, in sidebar order; each lists its title keys in order. */
  collections?: Collection[];
  /** Character backups (backups.ts); each field falls back to its default. */
  backups?: { auto?: boolean; folder?: string | null; keep?: number };
  /** Discord Rich Presence and account linking (discord.ts); on unless turned off. */
  discord?: {
    enabled?: boolean;
    gameActivity?: boolean;
    oauth?: DiscordOAuthState;
  };
  /** Launcher-wide preferences. These are not title options; they shape Exordium itself. */
  app?: Partial<AppSettings>;
}

interface Collection {
  id: string;
  name: string;
  keys: string[];
}

interface AppSettings {
  library: {
    autoScanOnStartup: boolean;
    hideUnsupported: boolean;
    /** The Latest uploads row on the library home (it reads the browse sources). */
    showLatestUploads: boolean;
    /** The Recent section (the titles played last) in the sidebar and on the library home. */
    showRecent: boolean;
    /** The toast offering to import the install's D2SE mods. */
    importReminder: boolean;
    extraFolders: string[];
  };
  launch: {
    /** Minimize Exordium's window once a game has started. It keeps running: it follows the run. */
    minimizeOnLaunch: boolean;
    showLogsOnFailure: boolean;
    /** Close official Battle.net to every mod without its own realm (battlenetAllowed in @exordium/launch). */
    battlenetLockdown: boolean;
    /**
     * Off Windows, what runs the game: a runner id from detection (`system:/usr/bin/wine`), or a path
     * to a Wine binary, a Wine or Proton folder, or umu-run. Empty: the first runner found.
     */
    wineRunner: string;
  };
  boxes: {
    /** On each library read, delete the boxes of this install's titles that are gone. */
    autoCleanStale: boolean;
    confirmRebuild: boolean;
    backupBeforeRebuild: boolean;
  };
  downloads: {
    maxParallel: number;
    keepArchives: boolean;
    verifyAfterDownload: boolean;
  };
  updates: {
    /** Look for a new Exordium on GitHub at startup, and download it in the background. */
    checkOnStartup: boolean;
    includePrereleases: boolean;
  };
  privacy: {
    /** No network: Browse, cores, Discord sign-in and presence all refuse (localOnlyRefusal). */
    localOnly: boolean;
  };
  diagnostics: {
    verboseLaunchLogs: boolean;
    nativeLoaderDebug: boolean;
    defenderTroubleshooting: boolean;
  };
  appearance: {
    theme: "dark" | "light" | "system";
    reduceMotion: boolean;
    /** The interface's language (src/lib/i18n.ts); "system" follows Windows. */
    language: "system" | "en" | "fr" | "es" | "de";
    toastSize: "small" | "medium" | "large";
  };
}

interface DiscordOAuthState {
  pending?: {
    state: string;
    verifier: string;
    redirectUri: string;
    scopes: string[];
    createdAt: string;
  };
  token?: {
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    scope: string;
    expiresAt: string;
  };
  user?: DiscordAccount;
}

interface DiscordAccount {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

const stateFile = `${exordiumRoot}/exordium.json`;
const legacyStateFile = `${userDataFolder()}/Exordium/state.json`;
const DEFAULT_APP_SETTINGS: AppSettings = {
  library: {
    autoScanOnStartup: true,
    hideUnsupported: false,
    showLatestUploads: true,
    showRecent: true,
    importReminder: true,
    extraFolders: [],
  },
  launch: {
    minimizeOnLaunch: false,
    showLogsOnFailure: true,
    battlenetLockdown: true,
    wineRunner: "",
  },
  boxes: {
    autoCleanStale: false,
    confirmRebuild: true,
    backupBeforeRebuild: true,
  },
  downloads: {
    maxParallel: 2,
    keepArchives: false,
    verifyAfterDownload: true,
  },
  updates: {
    checkOnStartup: true,
    includePrereleases: false,
  },
  privacy: {
    localOnly: false,
  },
  diagnostics: {
    verboseLaunchLogs: false,
    nativeLoaderDebug: false,
    defenderTroubleshooting: false,
  },
  appearance: {
    theme: "dark",
    reduceMotion: false,
    language: "system",
    toastSize: "large",
  },
};

async function readState(): Promise<AppState> {
  try {
    return {
      root: null,
      lastPlayed: null,
      playedAt: {},
      updateChecks: {},
      favorites: [],
      hidden: [],
      ...JSON.parse(await Deno.readTextFile(stateFile)),
    };
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      const legacy = await readLegacyState();
      if (legacy) return legacy;
      return {
        root: null,
        lastPlayed: null,
        playedAt: {},
        updateChecks: {},
        favorites: [],
        hidden: [],
      };
    }
    throw error;
  }
}

async function readLegacyState(): Promise<AppState | null> {
  if (legacyStateFile.toLowerCase() === stateFile.toLowerCase()) return null;
  try {
    return {
      root: null,
      lastPlayed: null,
      playedAt: {},
      updateChecks: {},
      favorites: [],
      hidden: [],
      ...JSON.parse(await Deno.readTextFile(legacyStateFile)),
    };
  } catch {
    return null;
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

/** A run in progress, from its launcher's session record. A title can have several copies at once. */
interface Running {
  key: string;
  copy: number;
  title: string;
  /** What Discord shows while it runs (an activity's JSON), or null when the player shares none. */
  presence?: string | null;
  /** The launcher's pid: it lives as long as the run. */
  pid: number;
  gamePid: number;
  startedAt: string;
  state: "starting" | "running";
}

/** The runs in progress, as last read from the session records (`refreshSessions`). */
let sessionRunning: Running[] = [];
/** Pre-1.14 runs started directly through the stamped Game.exe in this app session. */
let legacyRunning: Running[] = [];
/**
 * Runs whose game has exited but which are still being settled (registry read back, box checked,
 * saves backed up). They count as running for everything but Discord, which stops showing them at
 * once rather than ten seconds later.
 */
const endedRuns = new Set<string>();

function copiesRunning(key: string): Running[] {
  return [...sessionRunning, ...legacyRunning].filter((run) => run.key === key);
}

/**
 * Re-reads the session records the launchers keep (`sessions.ts`): which runs are live, and what
 * ended runs left to fold in. One at a time, so an ended run is never collected twice.
 */
let sessionsRead: Promise<void> = Promise.resolve();
function refreshSessions(): Promise<void> {
  sessionsRead = sessionsRead.then(readSessions, readSessions);
  return sessionsRead;
}

async function readSessions(): Promise<void> {
  const records = await sessions.list();
  const live = records.filter(({ record }) => isLive(record, processAlive));
  sessionRunning = live.map(({ record }) => ({
    key: record.key,
    copy: record.copy,
    title: record.title,
    pid: record.launcherPid,
    gamePid: record.gamePid,
    startedAt: record.startedAt,
    state: record.state as Running["state"],
  }));
  const busyBoxes = new Set(live.map(({ record }) => record.boxId));
  for (const { file, record } of records) {
    if (!isLive(record, processAlive)) await settleSession(file, record, busyBoxes.has(record.boxId));
  }
  void updatePresence();
}

// ---- Discord Rich Presence (discord.ts) ---------------------------------------------------------

const discordPresence = new DiscordPresence();

/**
 * The packaged app shows it; a dev server only with EXORDIUM_DISCORD=1, so a test server beside the
 * real Exordium does not fight it for the presence.
 */
function presenceHere(): boolean {
  return (Deno.env.get("EXORDIUM_DISCORD") ?? (isPackaged() ? "1" : "0")) === "1";
}

/**
 * What Discord shows, from what is running: the newest run Exordium follows itself, as "Playing"
 * with its title and elapsed time; nothing while a launcher-owned run shows its own; idle otherwise.
 * The two are separate settings: "Show Exordium idle status" (`discord.enabled`) is only the idle
 * one, and a game shows unless "Show launched games" (`discord.gameActivity`) or the privacy
 * settings (already applied to the run's activity when it started) say otherwise. A game that is not
 * shown shows nothing, not idle.
 */
async function updatePresence(): Promise<void> {
  const state = await readState();
  const showIdle = state.discord?.enabled ?? true;
  const showGames = state.discord?.gameActivity !== false;
  let want: Activity | null = null;
  if (presenceHere() && sessionRunning.length === 0 && !appSettingsFromState(state).privacy.localOnly) {
    const newest = legacyRunning
      .filter((run) => !endedRuns.has(`${run.key}#${run.copy}`))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!newest) want = showIdle ? IDLE_ACTIVITY : null;
    else if (newest.presence && showGames) {
      want = { ...JSON.parse(newest.presence) as Activity, startedAt: Date.parse(newest.startedAt) };
      const character = await playingCharacter(newest, state);
      if (character) want.state = characterLine(character);
    }
  }
  await discordPresence.set(want).catch(() => {});
}

/**
 * The character a run is playing, from its title's save folder. D2 writes a character's `.key`,
 * `.ma*`, `.map` and `.d2s` while it is in a game (seen on real saves, 2026-10-14), so the newest of
 * those changed since the run started names it, and its `.d2s` header gives class and level. Null in
 * the menus before the first game, and on a realm, whose characters live on the server.
 */
async function playingCharacter(run: Running, state: AppState): Promise<Character | null> {
  const target = parseEntryKey(run.key);
  if (!state.root || !target) return null;
  const folder = `${titleFolder(state.root.replaceAll("\\", "/"), target)}/save`;
  const since = Date.parse(run.startedAt) - 2000;
  try {
    let newest: { base: string; at: number } | null = null;
    for await (const entry of Deno.readDir(folder)) {
      const match = /^(.+)[.](d2s|key|map|ma[0-9])$/i.exec(entry.name);
      if (!entry.isFile || !match) continue;
      const at = (await Deno.stat(`${folder}/${entry.name}`)).mtime?.getTime() ?? 0;
      if (at >= since && (!newest || at > newest.at)) newest = { base: match[1]!, at };
    }
    if (!newest) return null;
    const file = await Deno.open(`${folder}/${newest.base}.d2s`, { read: true });
    try {
      const header = new Uint8Array(0x34);
      return (await file.read(header)) === 0x34 ? readCharacter(header) : null;
    } finally {
      file.close();
    }
  } catch {
    return null;
  }
}

// While a run Exordium follows is going, look again for the character every 20 s: the files change
// as the player enters a game. An unchanged activity is not sent again (DiscordPresence.set).
setInterval(() => {
  if (legacyRunning.some((run) => run.presence && !endedRuns.has(`${run.key}#${run.copy}`))) void updatePresence();
}, 20_000);

/**
 * GET: whether presence is on and Discord is connected.
 * POST `{ enabled?, gameActivity? }`: toggles Exordium idle presence and game-run activity separately.
 */
async function discordRoute(request: Request): Promise<Response> {
  if (request.method === "POST") {
    const body = await request.json().catch(() => null) as { enabled?: unknown; gameActivity?: unknown } | null;
    if (typeof body?.enabled !== "boolean" && typeof body?.gameActivity !== "boolean") {
      return Response.json({ error: "Missing enabled or gameActivity" }, { status: 400 });
    }
    await writeState((state) => {
      state.discord = {
        ...state.discord,
        ...(typeof body?.enabled === "boolean" ? { enabled: body.enabled } : {}),
        ...(typeof body?.gameActivity === "boolean" ? { gameActivity: body.gameActivity } : {}),
      };
    });
    await updatePresence();
    notify("status");
  }
  return Response.json(await discordStatus());
}

async function discordStatus() {
  const state = await readState();
  return {
    enabled: state.discord?.enabled ?? true,
    gameActivity: state.discord?.gameActivity ?? true,
    connected: discordPresence.connected,
    showing: discordPresence.activity?.details ?? null,
    account: state.discord?.oauth?.user
      ? {
        id: state.discord.oauth.user.id,
        username: state.discord.oauth.user.username,
        globalName: state.discord.oauth.user.globalName,
        avatar: state.discord.oauth.user.avatar,
        scopes: state.discord.oauth.token?.scope.split(/\s+/).filter(Boolean) ?? [],
        expiresAt: state.discord.oauth.token?.expiresAt ?? null,
      }
      : null,
  };
}

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize";
const DISCORD_DEFAULT_SCOPES = ["identify"];

// The main server's port is assigned per launch, but Discord matches a redirect URI exactly, so the
// OAuth callback uses this fixed loopback port with a listener of its own (below). Register
// http://127.0.0.1:8266/api/discord/callback in the Discord application's OAuth2 redirects.
const DISCORD_CALLBACK_PORT = 8266;

function discordRedirectUri(): string {
  return `http://127.0.0.1:${DISCORD_CALLBACK_PORT}/api/discord/callback`;
}

// Up only during a sign-in: Discord redirects the browser here after consent, this serves the one
// callback, then it stops. A five-minute timer stops it if the sign-in is abandoned.
let callbackServer: Deno.HttpServer | null = null;
let callbackStop: number | undefined;

async function stopCallbackListener(): Promise<void> {
  clearTimeout(callbackStop);
  callbackStop = undefined;
  const current = callbackServer;
  callbackServer = null;
  if (current) await current.shutdown().catch(() => {});
}

function startCallbackListener(): void {
  // Deno.serve binds synchronously and throws AddrInUse here if the port is taken; the caller reports it.
  const started = Deno.serve({ port: DISCORD_CALLBACK_PORT, hostname: "127.0.0.1", onListen() {} }, async (request) => {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/discord/callback") {
      return new Response("Not found", { status: 404 });
    }
    const response = await discordCallback(url);
    // Let the page flush, then take the listener down.
    clearTimeout(callbackStop);
    callbackStop = setTimeout(() => void stopCallbackListener(), 3_000);
    return response;
  });
  callbackServer = started;
  callbackStop = setTimeout(() => void stopCallbackListener(), 5 * 60 * 1000);
}

function discordScopes(): string[] {
  const raw = Deno.env.get("EXORDIUM_DISCORD_SCOPES")?.trim();
  return raw ? raw.split(/\s+/).filter(Boolean) : DISCORD_DEFAULT_SCOPES;
}

function randomUrlToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

async function discordConnect(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  await stopCallbackListener();
  try {
    startCallbackListener();
  } catch (error) {
    return Response.json({
      error:
        `Exordium could not open the sign-in port ${DISCORD_CALLBACK_PORT}. Close whatever is using it, then try again. (${
          (error as Error).message
        })`,
    }, { status: 503 });
  }
  const verifier = randomUrlToken(64);
  const oauthState = randomUrlToken(32);
  const redirectUri = discordRedirectUri();
  const scopes = discordScopes();
  await writeState((state) => {
    state.discord = {
      ...state.discord,
      oauth: {
        ...state.discord?.oauth,
        pending: {
          state: oauthState,
          verifier,
          redirectUri,
          scopes,
          createdAt: new Date().toISOString(),
        },
      },
    };
  });
  const url = new URL(DISCORD_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", oauthState);
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", await codeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return Response.json({ url: String(url), redirectUri, scopes });
}

async function discordCallback(url: URL): Promise<Response> {
  const error = url.searchParams.get("error");
  if (error) {
    return discordCallbackPage("Discord Login Failed", `${error}: ${url.searchParams.get("error_description") ?? ""}`);
  }
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!code || !returnedState) return discordCallbackPage("Discord Login Failed", "Discord did not return a code.");

  const appState = await readState();
  const pending = appState.discord?.oauth?.pending;
  if (!pending || pending.state !== returnedState) {
    return discordCallbackPage("Discord Login Failed", "The login state did not match. Please try connecting again.");
  }
  try {
    const token = await exchangeDiscordCode(code, pending);
    const user = await fetchDiscordUser(token.accessToken);
    await writeState((state) => {
      state.discord = {
        ...state.discord,
        oauth: {
          token,
          user,
        },
      };
    });
    notify("status");
    return discordCallbackPage(
      "Discord Connected",
      `Connected as ${user.globalName ?? user.username}. You can return to Exordium.`,
    );
  } catch (error) {
    return discordCallbackPage(
      "Discord Login Failed",
      `${
        (error as Error).message
      } Make sure the Discord application is a Public Client and has this redirect URI: ${pending.redirectUri}`,
    );
  }
}

async function exchangeDiscordCode(
  code: string,
  pending: NonNullable<DiscordOAuthState["pending"]>,
): Promise<NonNullable<DiscordOAuthState["token"]>> {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.verifier,
  });
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json().catch(() => null) as {
    access_token?: unknown;
    refresh_token?: unknown;
    token_type?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    error?: unknown;
    error_description?: unknown;
  } | null;
  if (!response.ok || typeof json?.access_token !== "string") {
    throw new Error(
      String(json?.error_description ?? json?.error ?? `Discord token exchange failed (${response.status}).`),
    );
  }
  const expires = Date.now() + Math.max(0, Number(json.expires_in ?? 0)) * 1000;
  const token: NonNullable<DiscordOAuthState["token"]> = {
    accessToken: json.access_token,
    tokenType: typeof json.token_type === "string" ? json.token_type : "Bearer",
    scope: typeof json.scope === "string" ? json.scope : pending.scopes.join(" "),
    expiresAt: new Date(expires).toISOString(),
  };
  if (typeof json.refresh_token === "string") token.refreshToken = json.refresh_token;
  return token;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordAccount> {
  const response = await fetch(`${DISCORD_API}/users/@me`, { headers: { authorization: `Bearer ${accessToken}` } });
  const json = await response.json().catch(() => null) as {
    id?: unknown;
    username?: unknown;
    global_name?: unknown;
    avatar?: unknown;
  } | null;
  if (!response.ok || typeof json?.id !== "string" || typeof json.username !== "string") {
    throw new Error(`Discord user fetch failed (${response.status}).`);
  }
  return {
    id: json.id,
    username: json.username,
    globalName: typeof json.global_name === "string" ? json.global_name : null,
    avatar: typeof json.avatar === "string" ? json.avatar : null,
  };
}

async function discordDisconnect(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  await writeState((state) => {
    const { oauth: _oauth, ...discord } = state.discord ?? {};
    state.discord = discord;
  });
  notify("status");
  return Response.json(await discordStatus());
}

function discordCallbackPage(title: string, message: string): Response {
  const html = `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;background:#0f1218;color:#f5efe3;font:15px/1.5 system-ui,Segoe UI,sans-serif;display:grid;place-items:center;min-height:100vh}
main{max-width:560px;padding:32px}
h1{font:700 28px Georgia,serif;margin:0 0 12px}
p{color:#b9c2d6;margin:0}
</style>
<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char),
  );
}

/**
 * An ended run: what it changed in the registry becomes the title's writable layer, and once no
 * copy of the box is running its files are checked. Then the record goes; its play time is already
 * in the ledger. A record left "running" by a launcher that died has no end to record, and goes too.
 */
async function settleSession(file: string, record: SessionRecord, boxBusy: boolean): Promise<void> {
  if (record.registryDump) {
    await collectRegistryDump(record.boxId, record.registryDump).catch((error) => {
      console.warn(`[sessions] ${record.boxId}: registry not collected: ${(error as Error).message}`);
    });
  }
  if (!boxBusy) {
    await (await Boxes.open(exordiumRoot)).afterRun(record.boxId).catch(() => null);
    await backUpAfterRun(record).catch((error) => {
      console.warn(`[backups] ${record.boxId}: not backed up: ${(error as Error).message}`);
    });
  }
  await Deno.remove(file).catch(() => {});
}

// ---- Character backups (backups.ts) -------------------------------------------------------------

interface BackupConfig {
  auto: boolean;
  /** Where every title's backups go; Exordium's own folder unless the player chose one. */
  folder: string;
  custom: boolean;
  keep: number;
}

function backupConfig(state: AppState): BackupConfig {
  const custom = state.backups?.folder?.trim() || null;
  return {
    auto: state.backups?.auto ?? true,
    folder: (custom ?? `${exordiumRoot}/backups`).replace(/\\/g, "/"),
    custom: custom !== null,
    keep: state.backups?.keep ?? DEFAULT_KEEP,
  };
}

/** Before a Rebuild Box asked for by hand: the title's saves, when "Backup saves before rebuild" is on. */
async function backUpBeforeRebuild(root: string, target: BoxTarget): Promise<void> {
  const state = await readState();
  if (!appSettingsFromState(state).boxes.backupBeforeRebuild) return;
  const id = boxIdFor(root, target);
  const saves = (await (await Boxes.open(exordiumRoot)).state(id))?.saves;
  if (!saves) return;
  const config = backupConfig(state);
  const title = target.kind === "mod" ? target.folder : coreTitle(target.version);
  await takeBackup(saves, `${config.folder}/${id}`, {
    reason: "before-rebuild",
    title,
    keep: config.keep,
    skipIfUnchanged: true,
  }).catch((error) => appLog("warn", `backup before rebuilding ${title}: ${(error as Error).message}`));
}

/**
 * "Clean stale boxes automatically": deletes this install's boxes whose mod or core is gone. Only
 * boxes built for this install (its tag ends the id), and nothing while a game runs. A box holds
 * links and the files the game rewrites; saves, backups and the registry layer live elsewhere.
 */
async function cleanStaleBoxes(root: string, titles: BoxTarget[]): Promise<void> {
  await refreshSessions();
  if (sessionRunning.length + legacyRunning.length > 0) return;
  const tag = `-${installTag(root)}`;
  const live = new Set(titles.map((target) => boxIdFor(root, target)));
  const boxes = await Boxes.open(exordiumRoot);
  const stale: string[] = [];
  for await (const entry of Deno.readDir(`${exordiumRoot}/boxes`)) {
    if (entry.isDirectory && entry.name.startsWith("d2se-") && entry.name.endsWith(tag) && !live.has(entry.name)) {
      stale.push(entry.name);
    }
  }
  for (const id of stale) {
    await boxes.remove(id);
    appLog("info", `removed stale box ${id}`);
  }
}

/** Routes that reach the network, refused in local-only mode. */
function localOnlyGuarded(path: string): boolean {
  return path === "/api/cores" || path === "/api/discord/connect" ||
    [
      "/api/browse",
      "/api/browse/item",
      "/api/browse/image",
      "/api/browse/moddb",
      "/api/browse/latest",
      "/api/browse/moddb-item",
      "/api/browse/download",
      "/api/browse/url-download",
      "/api/translate",
    ].includes(path);
}

/** A mod's description, into the player's language (translate.ts). */
async function translateRoute(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const { text, to } = await request.json().catch(() => ({})) as { text?: unknown; to?: unknown };
  if (typeof text !== "string" || !text.trim() || typeof to !== "string" || !/^[A-Za-z-]{2,12}$/.test(to)) {
    return Response.json({ error: "Nothing to translate" }, { status: 400 });
  }
  return await translate(text, to).then(
    (translation) => Response.json(translation),
    (error) => Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }),
  );
}

async function localOnlyRefusal(): Promise<Response | null> {
  if (!appSettingsFromState(await readState()).privacy.localOnly) return null;
  return Response.json(
    { error: "Local-only mode is on, so Exordium stays offline. Turn it off in Settings > Privacy.", localOnly: true },
    { status: 403 },
  );
}

/**
 * When the last copy of a title closes: its save folder, as the box links it, unless it matches the
 * newest backup. Runs as the session settles, so a game that ended while Exordium was closed is
 * backed up when it next starts.
 */
async function backUpAfterRun(record: SessionRecord): Promise<void> {
  const config = backupConfig(await readState());
  if (!config.auto) return;
  const saves = (await (await Boxes.open(exordiumRoot)).state(record.boxId))?.saves;
  if (!saves) return;
  const result = await takeBackup(saves, `${config.folder}/${record.boxId}`, {
    reason: "closed",
    title: record.title,
    keep: config.keep,
    skipIfUnchanged: true,
  });
  if ("taken" in result) {
    appLog(
      "info",
      `backed up ${record.title}: ${result.taken.files} files, ${result.taken.characters.length} characters`,
    );
  }
}

/**
 * GET `?root&key`: a title's backups and the backup settings. POST `{ action }`:
 * - `create`, `restore` (`id`), `delete` (`id`), `open` (`id` optional): one title's, by root and key.
 *   Creating and restoring are refused while a copy is running, since the game writes its saves.
 *   Restoring first backs up what is there now.
 * - `settings` (`auto`, `keep`, `folder`): for every title. An empty folder means Exordium's own.
 */
async function backups(request: Request, url: URL): Promise<Response> {
  const state = await readState();
  const config = backupConfig(state);
  const settingsView = { auto: config.auto, keep: config.keep, folder: winPath(config.folder), custom: config.custom };

  if (request.method === "GET") {
    // No title: just the settings, for Settings -> Backups.
    if (!url.searchParams.has("key")) return Response.json({ settings: settingsView });
    const target = parseEntryKey(url.searchParams.get("key") ?? "");
    const root = url.searchParams.get("root")?.trim();
    if (!target || !root) return Response.json({ error: "Missing root or key" }, { status: 400 });
    const folder = `${config.folder}/${boxIdFor(root, target)}`;
    return Response.json({ settings: settingsView, folder: winPath(folder), backups: await listBackups(folder) });
  }
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Bad request" }, { status: 400 });
  const action = body.action;
  if (action === "settings") return await backupSettings(body);

  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const key = typeof body?.key === "string" ? body.key : "";
  const target = parseEntryKey(key);
  if (!root || !target) return Response.json({ error: "Missing root or key" }, { status: 400 });
  const folder = `${config.folder}/${boxIdFor(root, target)}`;
  const saves = `${titleFolder(root, target)}/save`;
  const title = target.kind === "mod" ? target.folder : coreTitle(target.version);
  const id = typeof body?.id === "string" ? body.id : "";

  try {
    if (action === "open") {
      const at = id ? `${folder}/${id}` : folder;
      if (!(await Deno.stat(at).catch(() => null))?.isDirectory) {
        return Response.json({ error: "No backups yet." }, { status: 404 });
      }
      showInExplorer(winPath(at));
      return Response.json({ ok: true });
    }
    if (action === "delete") {
      await deleteBackup(folder, id);
      return Response.json({ ok: true });
    }
    if (action !== "create" && action !== "restore") {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    await refreshSessions();
    if (copiesRunning(key).length > 0) {
      return Response.json({ error: "Close the game first: it writes its saves while running." }, { status: 409 });
    }
    if (action === "create") {
      const result = await takeBackup(saves, folder, {
        reason: "manual",
        title,
        keep: config.keep,
        skipIfUnchanged: false,
      });
      if ("skipped" in result) return Response.json({ error: "The save folder is empty." }, { status: 409 });
      return Response.json({ ok: true, backup: result.taken });
    }
    const before = await takeBackup(saves, folder, {
      reason: "before-restore",
      title,
      keep: config.keep,
      skipIfUnchanged: true,
    });
    const restored = await restoreBackup(folder, id, saves);
    appLog("info", `restored ${title} from backup ${id}: ${restored} files`);
    return Response.json({ ok: true, restored, before: "taken" in before ? before.taken.id : null });
  } catch (error) {
    if (error instanceof BackupError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

async function backupSettings(body: Record<string, unknown>): Promise<Response> {
  let folder: string | null | undefined;
  if (typeof body.folder === "string") {
    folder = body.folder.trim() || null;
    if (folder) {
      if (!/^([A-Za-z]:[\\/]|\\\\)/.test(folder)) {
        return Response.json({ error: "Give a full path, such as D:\\Backups\\Diablo II." }, { status: 400 });
      }
      try {
        await Deno.mkdir(folder, { recursive: true });
        const probe = `${folder}/.exordium-${crypto.randomUUID()}`;
        await Deno.writeTextFile(probe, "");
        await Deno.remove(probe);
      } catch (error) {
        return Response.json({ error: `Exordium cannot write there: ${(error as Error).message}` }, { status: 400 });
      }
    }
  }
  const keep = typeof body.keep === "number" && Number.isInteger(body.keep)
    ? Math.min(999, Math.max(1, body.keep))
    : undefined;
  const auto = typeof body.auto === "boolean" ? body.auto : undefined;
  const state = await writeState((state) => {
    state.backups ??= {};
    if (auto !== undefined) state.backups.auto = auto;
    if (keep !== undefined) state.backups.keep = keep;
    if (folder !== undefined) state.backups.folder = folder;
  });
  const config = backupConfig(state);
  return Response.json({
    settings: { auto: config.auto, keep: config.keep, folder: winPath(config.folder), custom: config.custom },
  });
}

// ---- Live updates -------------------------------------------------------------------------------
//
// GET /api/events: a Server-Sent Events stream. The page polls nothing while idle, so a game this
// server starts on another's behalf (a desktop shortcut's --play, handed over from a second
// Exordium) would never show as playing; each change is pushed here instead, and the page re-reads
// /api/status when told.

const eventStreams = new Set<ReadableStreamDefaultController<Uint8Array>>();
const eventEncoder = new TextEncoder();

/** Tells every open page that `event` changed. */
function notify(event: "status"): void {
  const chunk = eventEncoder.encode(`event: ${event}\ndata: {}\n\n`);
  for (const stream of eventStreams) {
    try {
      stream.enqueue(chunk);
    } catch {
      eventStreams.delete(stream);
    }
  }
}

function events(): Response {
  let own: ReadableStreamDefaultController<Uint8Array> | null = null;
  let keepAlive: number | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      own = stream;
      eventStreams.add(stream);
      stream.enqueue(eventEncoder.encode(": open\n\n"));
      // A comment now and then, so nothing between here and the page closes an idle stream.
      keepAlive = setInterval(() => {
        try {
          stream.enqueue(eventEncoder.encode(": ping\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 25_000);
    },
    cancel() {
      if (own) eventStreams.delete(own);
      clearInterval(keepAlive);
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}
async function status() {
  const state = await readState();
  const settings = appSettingsFromState(state);
  return {
    // A root that is not Exordium's own library (an install, from before 2026-10-10) is no root: setup runs.
    root: await isLibrary(state.root) ? state.root : null,
    // An install used as the root before there was a library is offered as the install to link.
    install: state.install
      ? winPath(state.install)
      : state.root && !(await isLibrary(state.root))
      ? winPath(state.root)
      : null,
    library: winPath(libraryRoot),
    lastPlayed: state.lastPlayed,
    playedAt: state.playedAt,
    favorites: state.favorites,
    hidden: state.hidden,
    collections: state.collections ?? [],
    // A run whose game has exited is still settling (registry, box, backup) for ~10 s; it is not shown
    // as running any more. copiesRunning still counts it, so nothing rebuilds the box meanwhile.
    running: [...sessionRunning, ...legacyRunning].filter((run) => !endedRuns.has(`${run.key}#${run.copy}`)),
    preparing: [...preparing.values()],
    // Seconds played, runs and the last end per title, from the launchers' ledger.
    playtime: Object.fromEntries(await sessions.playtime()),
    // A desktop shortcut starts Exordium.exe itself, which only exists in the packaged app.
    packaged: isPackaged(),
    version: APP_VERSION,
    update: { phase: updater.state.phase, version: updater.state.update?.version ?? null },
    discord: await discordStatus(),
    appSettings: appSettingsResponse(settings),
    args: Deno.args,
  };
}

async function settings(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json(await readState());
  const body = await request.json().catch(() => null) as { root?: unknown } | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  if (!root) return Response.json({ error: "Missing root" }, { status: 400 });
  return Response.json(await writeState((state) => void (state.root = root)));
}

async function appSettingsRoute(request: Request): Promise<Response> {
  if (request.method === "GET") return Response.json(await appSettingsStatus());
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const patch = await request.json().catch(() => null);
  const state = await writeState((state) => {
    state.app = mergeAppSettings(appSettingsFromState(state), patch);
  });
  return Response.json(appSettingsResponse(appSettingsFromState(state)));
}

async function appSettingsStatus() {
  return appSettingsResponse(appSettingsFromState(await readState()));
}

function appSettingsResponse(settings: AppSettings) {
  return {
    settings,
    paths: {
      data: winPath(exordiumRoot),
      boxes: winPath(`${exordiumRoot}/boxes`),
      downloads: winPath(downloadsFolder),
      backups: winPath(`${exordiumRoot}/backups`),
      logs: winPath(`${exordiumRoot}/logs`),
      plugy: winPath(`${libraryRoot}/${LIBRARY_PLUGY}`),
    },
    platform: Deno.build.os,
    wine: wineStatus(settings),
  };
}

/** Off Windows, the runners found and the one a launch would use; null on Windows. */
function wineStatus(settings: AppSettings) {
  if (Deno.build.os === "windows") return null;
  const runners = detectRunners(denoFs, Deno.env.toObject());
  const selected = pickRunner(denoFs, runners, settings.launch.wineRunner);
  return {
    runners: runners.map(({ id, kind, source, label, program }) => ({ id, kind, source, label, program })),
    selected: selected ? { id: selected.id, label: selected.label, program: selected.program } : null,
  };
}

function appSettingsFromState(state: AppState): AppSettings {
  return mergeAppSettings(DEFAULT_APP_SETTINGS, state.app ?? {});
}

// Boxes link files and copy only what the game rewrites (packages/box): symlink first so boxes can
// cross drives without ballooning, then hardlink. Plain copy is deliberately not a fallback for
// normal game files.
const BOX_MODES: readonly LinkMode[] = ["symlink", "hardlink"];

function gamePresenceAllowed(state: AppState, settings: AppSettings): boolean {
  // One switch for game activity: Settings -> Discord -> "Show launched games" (discord.gameActivity).
  return state.discord?.gameActivity !== false &&
    !settings.privacy.localOnly &&
    !settings.diagnostics.defenderTroubleshooting;
}

function mergeAppSettings(base: AppSettings, patch: unknown): AppSettings {
  const record = isRecord(patch) ? patch : {};
  const next: AppSettings = structuredClone(base);
  mergeObject(next.library, record.library, {
    autoScanOnStartup: "boolean",
    hideUnsupported: "boolean",
    showLatestUploads: "boolean",
    showRecent: "boolean",
    importReminder: "boolean",
    extraFolders: "string[]",
  });
  mergeObject(next.launch, record.launch, {
    battlenetLockdown: "boolean",
    minimizeOnLaunch: "boolean",
    showLogsOnFailure: "boolean",
    wineRunner: "string",
  });
  mergeObject(next.boxes, record.boxes, {
    autoCleanStale: "boolean",
    confirmRebuild: "boolean",
    backupBeforeRebuild: "boolean",
  });
  mergeObject(next.downloads, record.downloads, {
    maxParallel: "number",
    keepArchives: "boolean",
    verifyAfterDownload: "boolean",
  });
  next.downloads.maxParallel = Math.max(1, Math.min(8, Math.round(next.downloads.maxParallel)));
  mergeObject(next.updates, record.updates, {
    checkOnStartup: "boolean",
    includePrereleases: "boolean",
  });
  mergeObject(next.privacy, record.privacy, {
    localOnly: "boolean",
  });
  mergeObject(next.diagnostics, record.diagnostics, {
    verboseLaunchLogs: "boolean",
    nativeLoaderDebug: "boolean",
    defenderTroubleshooting: "boolean",
  });
  mergeObject(next.appearance, record.appearance, {
    theme: ["dark", "light", "system"],
    reduceMotion: "boolean",
    language: ["system", "en", "fr", "es", "de"],
    toastSize: ["small", "medium", "large"],
  });
  return next;
}

type SettingShape = Record<string, "boolean" | "number" | "string" | "string[]" | string[]>;

function mergeObject(target: Record<string, unknown>, source: unknown, shape: SettingShape): void {
  if (!isRecord(source)) return;
  for (const [key, spec] of Object.entries(shape)) {
    const value = source[key];
    if (spec === "boolean" && typeof value === "boolean") target[key] = value;
    else if (spec === "number" && typeof value === "number" && Number.isFinite(value)) target[key] = value;
    else if (spec === "string" && typeof value === "string") target[key] = value.trim();
    else if (spec === "string[]" && Array.isArray(value)) {
      target[key] = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
    } else if (Array.isArray(spec) && typeof value === "string" && spec.includes(value)) {
      target[key] = value;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * A title's `exordium.mod.json`, which Properties edits. GET gives the file in its one spelling, or,
 * with no file yet, what the title runs on now, drafted from its D2SE_SETUP.ini. POST writes it; from
 * the first save the file wins over D2SE_SETUP.ini. Keys are one folder name (parseEntryKey), and only
 * the library is written to.
 */
async function manifestRoute(request: Request, url: URL): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = request.method === "POST"
    ? await request.json().catch(() => null) as { root?: unknown; key?: unknown; manifest?: unknown } | null
    : null;
  const root = (typeof body?.root === "string" ? body.root : url.searchParams.get("root") ?? "").trim();
  const target = parseEntryKey(typeof body?.key === "string" ? body.key : url.searchParams.get("key") ?? "");
  if (!target || !(await isLibrary(root))) {
    return Response.json({ error: "Missing the library or the title." }, { status: 400 });
  }
  const folder = titleFolder(root, target);
  const file = `${folder}/${EXORDIUM_MOD_FILE}`;
  if (!(await Deno.stat(folder).then((info) => info.isDirectory, () => false))) {
    return Response.json({ error: `${winPath(folder)} does not exist.` }, { status: 404 });
  }

  if (request.method === "POST") {
    const manifest = isRecord(body?.manifest) ? { ...body.manifest } : null;
    if (!manifest) return Response.json({ error: "The manifest must be a JSON object." }, { status: 400 });
    if (target.kind === "core") manifest.core = target.version;
    if (!textValue(manifest.core)) return Response.json({ error: "Set the core this mod runs on." }, { status: 400 });
    await writeManifest(folder, manifest);
    return Response.json({ manifest: normalizeManifest(manifest), exists: true, path: winPath(file) });
  }

  try {
    return Response.json({ ...await titleManifest(root, target), path: winPath(file) });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** A title's manifest in its one spelling; with no file yet, a draft of what the title runs on now. */
async function titleManifest(
  root: string,
  target: BoxTarget,
): Promise<{ manifest: Record<string, unknown>; exists: boolean }> {
  const folder = titleFolder(root, target);
  const text = await Deno.readTextFile(`${folder}/${EXORDIUM_MOD_FILE}`).catch(() => null);
  if (text !== null) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new HttpError(422, `${EXORDIUM_MOD_FILE} is not valid JSON: ${(error as Error).message}`);
    }
    if (!isRecord(json)) throw new HttpError(422, `${EXORDIUM_MOD_FILE} must be a JSON object.`);
    return { manifest: normalizeManifest(json), exists: true };
  }
  const setup = target.kind === "core" ? await readCoreSetup(root, target.version) : await readSetupFile(folder);
  return {
    manifest: setup
      ? exordiumManifestFromD2SE(setup)
      : { title: target.kind === "mod" ? target.folder : null, core: target.kind === "core" ? target.version : null },
    exists: false,
  };
}

/** Writes a title's manifest whole, so a failed write leaves the old one. */
async function writeManifest(folder: string, manifest: Record<string, unknown>): Promise<void> {
  const file = `${folder}/${EXORDIUM_MOD_FILE}`;
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temporary, JSON.stringify(manifest, null, 2) + "\n");
  await Deno.rename(temporary, file);
}

/** GET `?gateway&port`: whether a realm answers. Refused in Local-only mode, like everything online. */
async function realmCheck(url: URL): Promise<Response> {
  const refusal = await localOnlyRefusal();
  if (refusal) return refusal;
  const place = realmAddress(url.searchParams.get("gateway") ?? "", url.searchParams.get("port"));
  if (!place) return Response.json({ error: "Set a gateway address and a port from 1 to 65535." }, { status: 400 });
  return Response.json(await checkRealm(place));
}

function cleanUpdateSettings(input: unknown): TitleUpdateSettings {
  const record = isRecord(input) ? input : {};
  const channel = record.channel === "testing" || record.channel === "local" ? record.channel : "stable";
  const endpoint = typeof record.endpoint === "string" ? record.endpoint.trim().slice(0, 2048) : "";
  return {
    automatic: typeof record.automatic === "boolean" ? record.automatic : true,
    background: typeof record.background === "boolean" ? record.background : true,
    channel,
    endpoint: endpoint || null,
  };
}

async function titleUpdates(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { root?: unknown; folder?: unknown; core?: unknown; settings?: unknown; version?: unknown }
    | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const core = typeof body?.core === "string" ? body.core.trim() : "";
  if (!root || (!folder && !core)) return Response.json({ error: "Missing root, and folder or core" }, { status: 400 });
  const target: BoxTarget = folder ? { kind: "mod", folder } : { kind: "core", version: core };
  const key = entryKey(target);
  const refusal = await localOnlyRefusal();
  if (refusal) return refusal;
  const settings = cleanUpdateSettings(body?.settings);
  if (!settings.endpoint) return Response.json({ error: "Set an update endpoint first." }, { status: 400 });
  const currentVersion = typeof body?.version === "string" && body.version.trim() ? body.version.trim() : null;
  const check = await checkTitleUpdate(root, target, settings, currentVersion);
  await writeState((state) => {
    state.root = root;
    state.updateChecks ??= {};
    state.updateChecks[key] = check;
  });
  return Response.json({ key, check });
}

async function checkTitleUpdate(
  root: string,
  target: BoxTarget,
  settings: TitleUpdateSettings,
  currentVersion: string | null,
): Promise<TitleUpdateCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const json = await readUpdateManifest(root, target, settings.endpoint ?? "");
    const release = selectRelease(json, settings.channel);
    const latestVersion = release ? textValue(release.version) : null;
    return {
      checkedAt,
      endpoint: settings.endpoint ?? "",
      channel: settings.channel,
      currentVersion,
      latestVersion,
      available: !!latestVersion && latestVersion !== currentVersion,
      page: release ? webUrl(release.page ?? release.url ?? release.homepage) : null,
      notes: release ? textValue(release.notes ?? release.description ?? release.changelog) : null,
      downloadCount: release ? downloadCount(release) : 0,
      error: null,
    };
  } catch (error) {
    return {
      checkedAt,
      endpoint: settings.endpoint ?? "",
      channel: settings.channel,
      currentVersion,
      latestVersion: null,
      available: false,
      page: null,
      notes: null,
      downloadCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readUpdateManifest(root: string, target: BoxTarget, endpoint: string): Promise<unknown> {
  const trimmed = endpoint.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Update endpoint returned ${response.status}.`);
    return await response.json();
  }
  const base = target.kind === "mod"
    ? `${root.replace(/\\/g, "/")}/${LIBRARY_FOLDERS.mods}/${target.folder}`
    : coreFolder(root, target.version);
  const path = /^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith("/") ? trimmed : `${base}/${trimmed}`;
  return JSON.parse(await Deno.readTextFile(path.replace(/\\/g, "/")));
}

function selectRelease(json: unknown, channel: TitleUpdateSettings["channel"]): Record<string, unknown> | null {
  if (!isRecord(json)) throw new Error("Update manifest must be a JSON object.");
  const releases = Array.isArray(json.releases) ? json.releases : null;
  if (!releases) return json;
  const records = releases.filter(isRecord);
  const matches = records.filter((release) => {
    const releaseChannel = typeof release.channel === "string" ? release.channel : "stable";
    return releaseChannel === channel;
  });
  if (matches[0]) return matches[0];
  if (channel === "testing") {
    return records.find((release) => (typeof release.channel === "string" ? release.channel : "stable") === "stable") ??
      null;
  }
  return null;
}

function downloadCount(release: Record<string, unknown>): number {
  if (Array.isArray(release.downloads)) return release.downloads.filter(isRecord).length;
  return textValue(release.download) || textValue(release.file) ? 1 : 0;
}

/** Starts a title. The box is built or reused, then its `Game.exe` starts as its own process. */
async function play(request: Request): Promise<Response> {
  const read = await readTarget(request);
  if (read instanceof Response) return read;
  const key = entryKey(read.target);
  // Settles runs that ended since the last look, so their registry is read before this copy's is reset.
  await refreshSessions();
  const others = copiesRunning(key);
  const taken = new Set(others.map((run) => run.copy));
  let copy = 1;
  while (taken.has(copy)) copy++;
  let launchTitle = read.target.kind === "mod" ? read.target.folder : `Diablo II ${read.target.version}`;
  reportLaunch(key, launchTitle, "checking");

  try {
    const box = await realiseD2SEBox(
      read.root,
      read.target,
      copy,
      others.length > 0,
      (phase, current, total) => reportLaunch(key, launchTitle, phase, current ?? null, total ?? null),
    );
    launchTitle = box.title;
    reportLaunch(key, launchTitle, "starting");
    await Deno.remove(`${box.folder}/${box.log}`).catch(() => {});
    const startedAt = new Date().toISOString();
    let pid: number;
    if (Deno.build.os !== "windows") {
      pid = await playUnderWine(key, copy, box, startedAt);
    } else if (box.nativeGameExe || box.singleExe) {
      await applyRegistryFile(box.hostRegistryFile);
      const gameExe = `${box.folder}/${GAME_EXE}`;
      const child = new Deno.Command(gameExe, {
        args: box.commandLine.split(" ").filter(Boolean),
        cwd: box.folder,
        stdin: "null",
        stdout: "null",
        stderr: "null",
      }).spawn();
      pid = child.pid;
      legacyRunning = [
        ...legacyRunning,
        { key, copy, title: box.title, presence: box.presence, pid, gamePid: pid, startedAt, state: "running" },
      ];
      void followDirectRun(key, copy, child, box, startedAt);
    } else {
      // The native runner finds this copy's config and log through the environment, which --detach passes on.
      const runner = executablePath(box.folder, box.launcher);
      const detached = await new Deno.Command(runner, {
        args: ["--detach", ...box.commandLine.split(" ").filter(Boolean)],
        cwd: box.folder,
        env: { EXORDIUM_LOADER_CONFIG: box.config, EXORDIUM_LOADER_LOG: box.log },
        stdout: "piped",
        stderr: "null",
      }).output();
      pid = Number(new TextDecoder().decode(detached.stdout).trim());
      if (!detached.success || !Number.isInteger(pid) || pid <= 0) {
        throw new HttpError(500, `The game did not start (${box.launcher} --detach exited with ${detached.code}).`);
      }
      if (!box.sessionBacked) {
        legacyRunning = [
          ...legacyRunning,
          { key, copy, title: box.title, presence: box.presence, pid, gamePid: pid, startedAt, state: "running" },
        ];
        void followLegacyRun(key, copy, runner, pid, box, startedAt);
      }
    }
    // A run this app follows: Discord shows it now (the session path does this when its record lands).
    void updatePresence();
    await writeState((state) => {
      state.root = read.root;
      state.lastPlayed = key;
      state.playedAt[key] = startedAt;
    });
    if (box.sessionBacked) {
      // The launcher writes its record first thing; waiting for it means the page sees "Playing" at once.
      const session = sessions.file(box.id, copy);
      for (let waited = 0; waited < 5_000 && !(await Deno.stat(session).catch(() => null)); waited += 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await refreshSessions();
    }
    notify("status");
    return Response.json({ key, copy, pid, box });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  } finally {
    preparing.delete(key);
    notify("status");
  }
}

async function followLegacyRun(
  key: string,
  copy: number,
  gameExe: string,
  pid: number,
  box: { id: string; title: string; folder: string; hive: string },
  startedAt: string,
): Promise<void> {
  let exitCode = 0;
  try {
    const waited = await new Deno.Command(gameExe, { args: ["--wait", String(pid)], stdout: "piped" }).output();
    const text = new TextDecoder().decode(waited.stdout).trim();
    if (text) exitCode = Number(text) || 0;
    endedRuns.add(`${key}#${copy}`);
    void updatePresence();
    notify("status");
    const dump = `${box.hive}.out.txt`;
    const dumped = await new Deno.Command(gameExe, { args: ["--dump-hive", box.hive, dump] }).output();
    if (dumped.success) await collectRegistryDump(box.id, dump);
    const stillBusy = legacyRunning.some((run) => run.key === key && run.copy !== copy);
    if (!stillBusy) {
      await (await Boxes.open(exordiumRoot)).afterRun(box.id).catch(() => null);
    }
    const endedAt = new Date().toISOString();
    const state = exitCode >= 0xC0000000 ? "crashed" : "ended";
    const record: SessionRecord = {
      version: 1,
      key,
      title: box.title,
      boxId: box.id,
      copy,
      state,
      launcherPid: pid,
      launcherCreated: 0,
      gamePid: pid,
      gameCreated: 0,
      startedAt,
      endedAt,
      exitCode,
      reason: null,
      registryDump: null,
    };
    await appendLegacyLedger(record);
    if (!stillBusy) {
      await backUpAfterRun(record).catch((error) => {
        console.warn(`[backups] ${box.id}: not backed up: ${(error as Error).message}`);
      });
    }
  } catch (error) {
    console.warn(`[legacy-run] ${box.id}: not settled: ${(error as Error).message}`);
  } finally {
    legacyRunning = legacyRunning.filter((run) => !(run.key === key && run.copy === copy));
    endedRuns.delete(`${key}#${copy}`);
    await updatePresence();
    notify("status");
  }
}

async function followDirectRun(
  key: string,
  copy: number,
  child: Deno.ChildProcess,
  box: { id: string; title: string; folder: string },
  startedAt: string,
  collect: () => Promise<unknown> = () => collectRegistryMachine(box.id),
): Promise<void> {
  let exitCode = 0;
  try {
    exitCode = (await child.status).code;
    endedRuns.add(`${key}#${copy}`);
    void updatePresence();
    notify("status");
    await collect().catch((error) => {
      console.warn(`[direct-run] ${box.id}: registry was not captured: ${(error as Error).message}`);
    });
    const stillBusy = legacyRunning.some((run) => run.key === key && run.copy !== copy);
    if (!stillBusy) {
      await (await Boxes.open(exordiumRoot)).afterRun(box.id).catch(() => null);
    }
    const endedAt = new Date().toISOString();
    const state = exitCode >= 0xC0000000 ? "crashed" : "ended";
    const record: SessionRecord = {
      version: 1,
      key,
      title: box.title,
      boxId: box.id,
      copy,
      state,
      launcherPid: child.pid,
      launcherCreated: 0,
      gamePid: child.pid,
      gameCreated: 0,
      startedAt,
      endedAt,
      exitCode,
      reason: null,
      registryDump: null,
    };
    await appendLegacyLedger(record);
    if (!stillBusy) {
      await backUpAfterRun(record).catch((error) => {
        console.warn(`[backups] ${box.id}: not backed up: ${(error as Error).message}`);
      });
    }
  } catch (error) {
    console.warn(`[direct-run] ${box.id}: not settled: ${(error as Error).message}`);
  } finally {
    legacyRunning = legacyRunning.filter((run) => !(run.key === key && run.copy === copy));
    endedRuns.delete(`${key}#${copy}`);
    await updatePresence();
    notify("status");
  }
}

// ---- Wine (off Windows): the runner, Exordium's prefix, and a run --------------------------------

/** The prefixes made ready since this server started; a prefix is checked once per session. */
const preparedPrefixes = new Set<string>();

/** The runner Settings names, else the first one found. Throws a 409 the page shows when there is none. */
function currentRunner(settings: AppSettings): Runner {
  const runners = detectRunners(denoFs, Deno.env.toObject());
  const runner = pickRunner(denoFs, runners, settings.launch.wineRunner);
  if (!runner) {
    throw new HttpError(
      409,
      "No Wine was found. Install Wine (or Proton, Lutris or Bottles), or choose one in Settings, Launching.",
    );
  }
  return runner;
}

/** Runs a runner command to its end, with no stdio (the packaged app has no console). */
function runnerOutput(command: RunnerCommand, cwd?: string): Promise<Deno.CommandOutput> {
  return new Deno.Command(command.program, {
    args: command.args,
    env: command.env,
    ...(cwd ? { cwd } : {}),
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).output();
}

/**
 * Exordium's prefix for `runner`, created on first use (`wineboot -u`, which takes a while the first
 * time). It lives in Exordium's root: the user's own `~/.wine` and launcher bottles are never used.
 */
async function preparePrefix(runner: Runner): Promise<string> {
  const prefix = prefixFor(exordiumRoot, runner);
  if (preparedPrefixes.has(prefix)) return prefix;
  const init = prefixInitCommand(runner, prefix);
  if (init && !(await Deno.stat(`${prefix}/system.reg`).catch(() => null))) {
    await Deno.mkdir(prefix, { recursive: true });
    appLog("info", `preparing the Wine prefix ${prefix} with ${runner.label} (${runner.program})`);
    const { code } = await runnerOutput(init);
    if (code !== 0) throw new HttpError(500, `${runner.label} could not prepare its Wine prefix (exit ${code}).`);
  }
  preparedPrefixes.add(prefix);
  return prefix;
}

/**
 * Starts a box's `Game.exe` through Wine. No `--detach`: the host process the runner starts is the
 * game for its whole life (the loader waits for its own relaunch, when it makes one), so the run is
 * followed by its exit, like a 1.14 run on Windows. Returns the host pid.
 */
async function playUnderWine(
  key: string,
  copy: number,
  box: Awaited<ReturnType<typeof realiseD2SEBox>>,
  startedAt: string,
): Promise<number> {
  const runner = currentRunner(appSettingsFromState(await readState()));
  const prefix = await preparePrefix(runner);
  const gameExe = `${box.folder}/${GAME_EXE}`;
  // 1.14 takes no private hive: its values go to the prefix's HKCU, and nothing is collected after.
  if (box.singleExe) await applyRegistryFile(box.hostRegistryFile, { runner, prefix });
  const command = wineCommand(runner, prefix, gameExe, box.commandLine.split(" ").filter(Boolean));
  const child = new Deno.Command(command.program, {
    args: command.args,
    cwd: box.folder,
    // Wine hands the host environment to the game, so the loader finds this copy's config and log.
    env: { ...command.env, EXORDIUM_LOADER_CONFIG: box.config, EXORDIUM_LOADER_LOG: box.log },
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();
  legacyRunning = [
    ...legacyRunning,
    {
      key,
      copy,
      title: box.title,
      presence: box.presence,
      pid: child.pid,
      gamePid: child.pid,
      startedAt,
      state: "running",
    },
  ];
  const collect = box.singleExe ? () => Promise.resolve() : async () => {
    // The loader reads the run's hive back as text; it opens Wine paths, this server reads the host's.
    const dump = `${box.hostHive}.out.txt`;
    const read = wineCommand(runner, prefix, gameExe, ["--dump-hive", box.hive, gamePath(dump)]);
    const { code } = await runnerOutput(read, box.folder);
    if (code !== 0) throw new Error(`--dump-hive exited with ${code}`);
    return await collectRegistryDump(box.id, dump);
  };
  void followDirectRun(key, copy, child, box, startedAt, collect);
  return child.pid;
}

async function collectRegistryMachine(boxId: string) {
  const lower = JSON.parse(
    await Deno.readTextFile(`${exordiumRoot}/boxes/${boxId}/registry.lower.json`),
  ) as ResolvedValue[];
  const after = await machineSnapshot();
  const layer = capturedChanges(lower, after.entries.filter(isRegistryEntry));
  await writeWritableLayer(exordiumRoot, boxId, layer);
  return { values: after.entries.length, changes: layer.entries };
}

function isRegistryEntry(value: RegistryEntry | RegistryTombstone): value is RegistryEntry {
  return "value" in value;
}

/**
 * Writes a box's registry values to HKCU for a game that cannot take a private hive (1.14). Under
 * Wine, `wine` names the runner and prefix, and the values go to the prefix's HKCU, which is
 * Exordium's own.
 */
async function applyRegistryFile(file: string, wine?: { runner: Runner; prefix: string }): Promise<void> {
  const entries = parseHiveText(await Deno.readTextFile(file.replace(/\\/g, "/")));
  for (const entry of entries) await writeMachineValue(entry.key, entry.name, entry.value, wine);
}

async function writeMachineValue(
  key: string,
  name: string,
  value: RegistryValue,
  wine?: { runner: Runner; prefix: string },
): Promise<void> {
  if (!/^HKCU\\/i.test(key) && !/^HKEY_CURRENT_USER\\/i.test(key)) {
    throw new HttpError(500, `Classic launch can only write HKCU values for now; got ${key}.`);
  }
  const args = ["add", key, ...regValueNameArgs(name), "/t", regType(value), "/d", regData(value), "/f"];
  const code = wine
    ? (await runnerOutput(regAddCommand(wine.runner, wine.prefix, args))).code
    : await runHidden("reg.exe", args);
  if (code !== 0) {
    throw new HttpError(500, `Could not write registry value ${key}\\${name || "(Default)"} (reg.exe exited ${code}).`);
  }
}

function regValueNameArgs(name: string): string[] {
  return name === "" ? ["/ve"] : ["/v", name];
}

function regType(value: RegistryValue): string {
  switch (value.type) {
    case "sz":
      return "REG_SZ";
    case "expand_sz":
      return "REG_EXPAND_SZ";
    case "multi_sz":
      return "REG_MULTI_SZ";
    case "dword":
      return "REG_DWORD";
    case "qword":
      return "REG_QWORD";
    case "binary":
      return "REG_BINARY";
  }
}

function regData(value: RegistryValue): string {
  switch (value.type) {
    case "multi_sz":
      return value.data.join("\\0");
    case "dword":
      return String(value.data >>> 0);
    case "qword":
      return value.data;
    default:
      return value.data;
  }
}

async function appendLegacyLedger(record: SessionRecord): Promise<void> {
  if (!record.endedAt) return;
  await Deno.mkdir(sessions.folder, { recursive: true });
  const seconds = Math.max(0, Math.round((Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 1000));
  await Deno.writeTextFile(
    sessions.ledger,
    JSON.stringify({
      key: record.key,
      title: record.title,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      seconds,
      state: record.state,
      exitCode: record.exitCode ?? 0,
    }) + "\n",
    { append: true },
  );
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
  // One folder name, never a path: keys arrive in requests, and every route builds paths from them.
  const name = key.slice(key.indexOf(":") + 1);
  if (!name || /[\\/]/.test(name) || name === "." || name === "..") return null;
  if (key.startsWith("mod:")) return { kind: "mod", folder: name };
  if (key.startsWith("core:")) return { kind: "core", version: name };
  return null;
}

/** The folder a title's D2SE files are in. */
function titleFolder(root: string, target: BoxTarget): string {
  return target.kind === "mod" ? `${root}/${LIBRARY_FOLDERS.mods}/${target.folder}` : coreFolder(root, target.version);
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

/** An image's type from its first bytes; null for anything else. */
function imageType(head: Uint8Array): string | null {
  if (isPng(head)) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  if (String.fromCharCode(...head.slice(0, 4)) === "GIF8") return "image/gif";
  if (head[0] === 0x42 && head[1] === 0x4d) return "image/bmp";
  return null;
}

/**
 * Artwork a mod ships itself: `exordium.mod.json`'s `art.banner` / `art.icon` / `art.portrait`, an
 * image inside the mod's folder. The path must stay inside the folder. A banner or portrait may be
 * PNG, JPEG, WebP, GIF or BMP; an icon must be a PNG, because it goes into the box's Game.exe and
 * shortcuts as PNG-in-ICO.
 */
async function modArt(root: string, target: BoxTarget, kind: ArtKind): Promise<string | null> {
  const folder = titleFolder(root, target);
  let path: unknown;
  try {
    const manifest = JSON.parse(await Deno.readTextFile(`${folder}/${EXORDIUM_MOD_FILE}`)) as ExordiumModManifest;
    path = manifest.art?.[kind];
  } catch {
    return null;
  }
  if (typeof path !== "string") return null;
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === ".." || part.includes(":"))) return null;
  const file = `${folder}/${parts.join("/")}`;
  try {
    const head = new Uint8Array(32); // isPng wants the signature and the IHDR size after it
    const handle = await Deno.open(file, { read: true });
    try {
      await handle.read(head);
    } finally {
      handle.close();
    }
    const type = imageType(head);
    return type === "image/png" || (type !== null && kind !== "icon") ? file : null;
  } catch {
    return null;
  }
}

/**
 * GET `?root&key&kind`: the image the title's manifest names, or for a banner its D2SE `ModBanner`
 * as it is. POST (PNG body) saves one in the title's folder and names it in the manifest, which a D2SE
 * mod gets here if it has none yet; DELETE stops naming it and leaves the file. Both answer with the path
 * now in the manifest.
 */
async function artwork(request: Request, url: URL): Promise<Response> {
  const target = parseEntryKey(url.searchParams.get("key") ?? "");
  const kind = url.searchParams.get("kind") as ArtKind | null;
  const root = url.searchParams.get("root")?.trim() ?? "";
  if (!target || !kind || !ART_KINDS.includes(kind)) {
    return Response.json({ error: "Bad key or kind" }, { status: 400 });
  }
  if (request.method === "POST" || request.method === "DELETE") {
    if (!(await isLibrary(root))) return Response.json({ error: "That is not the library." }, { status: 400 });
    const folder = titleFolder(root, target);
    try {
      const { manifest } = await titleManifest(root, target);
      let named: string | null = null;
      if (request.method === "POST") {
        const png = new Uint8Array(await request.arrayBuffer());
        checkArt(kind, png);
        named = chosenArtPath(kind);
        await Deno.mkdir(`${folder}/${named.slice(0, named.lastIndexOf("/"))}`, { recursive: true });
        const temporary = `${folder}/${named}.${crypto.randomUUID()}.tmp`;
        await Deno.writeFile(temporary, png);
        await Deno.rename(temporary, `${folder}/${named}`);
      }
      await writeManifest(folder, {
        ...manifest,
        art: { ...(isRecord(manifest.art) ? manifest.art : {}), [kind]: named },
      });
      return Response.json({ path: named });
    } catch (error) {
      if (error instanceof ArtError) return Response.json({ error: error.message }, { status: 400 });
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }
  const shipped = root ? await modArt(root, target, kind) : null;
  if (shipped) {
    const bytes = await Deno.readFile(shipped);
    return new Response(bytes, {
      headers: { "content-type": imageType(bytes.subarray(0, 32)) ?? "image/png", "cache-control": "no-cache" },
    });
  }
  const banner = kind === "banner" && root ? await d2seBanner(root, target) : null;
  if (banner) {
    return new Response(await Deno.readFile(banner), {
      headers: { "content-type": contentType(banner), "cache-control": "no-cache" },
    });
  }
  return new Response(null, { status: 404 });
}

// ---- Characters ---------------------------------------------------------------------------------

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
  const found: Character[] = [];
  try {
    for await (const entry of Deno.readDir(folder)) {
      if (!entry.isFile || !entry.name.toLowerCase().endsWith(".d2s")) continue;
      const file = await Deno.open(`${folder}/${entry.name}`, { read: true });
      const header = new Uint8Array(0x34);
      const read = await file.read(header);
      file.close();
      const character = read === 0x34 ? readCharacter(header) : null;
      if (character) found.push(character);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  found.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? "") || a.name.localeCompare(b.name));
  return Response.json({ characters: found });
}

const SCREENSHOT_EXTENSIONS = new Set([".bmp", ".gif", ".jpg", ".jpeg", ".png", ".webp"]);

function screenshotFolder(root: string, target: BoxTarget): string {
  return `${titleFolder(root, target)}/Screenshots`;
}

function imageExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot).toLowerCase();
  return SCREENSHOT_EXTENSIONS.has(ext) ? ext : null;
}

async function listScreenshots(root: string, target: BoxTarget) {
  const folder = screenshotFolder(root, target);
  const screenshots: { name: string; size: number; modifiedAt: string | null }[] = [];
  try {
    for await (const entry of Deno.readDir(folder)) {
      if (!entry.isFile || !imageExtension(entry.name)) continue;
      const info = await Deno.stat(`${folder}/${entry.name}`);
      screenshots.push({
        name: entry.name,
        size: info.size,
        modifiedAt: info.mtime?.toISOString() ?? null,
      });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return screenshots.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

async function screenshotCount(root: string, target: BoxTarget): Promise<number> {
  return (await listScreenshots(root, target)).length;
}

async function screenshots(url: URL): Promise<Response> {
  const target = parseEntryKey(url.searchParams.get("key") ?? "");
  const root = url.searchParams.get("root")?.trim();
  if (!target || !root) return Response.json({ error: "Missing root or key" }, { status: 400 });

  const name = url.searchParams.get("name");
  if (!name) return Response.json({ screenshots: await listScreenshots(root, target) });
  if (name.includes("/") || name.includes("\\") || name.includes("..") || !imageExtension(name)) {
    return Response.json({ error: "Bad screenshot name" }, { status: 400 });
  }

  const listed = await listScreenshots(root, target);
  const found = listed.find((shot) => shot.name.toLowerCase() === name.toLowerCase());
  if (!found) return Response.json({ error: "Screenshot not found" }, { status: 404 });
  const file = `${screenshotFolder(root, target)}/${found.name}`;
  return new Response(await Deno.readFile(file), {
    headers: { "content-type": contentType(file), "cache-control": "no-cache" },
  });
}

/**
 * Opens a folder (or a URL, in the default browser) with explorer.exe. No stdio: the packaged app is a
 * GUI process with no console, and `spawn()` inherits stdin/stdout/stderr by default, which there
 * fails with "Invalid handle". The dev server has a console, so it only ever broke in the app.
 */
function showInExplorer(target: string, select = false): void {
  if (Deno.build.os !== "windows") {
    // Neither opener selects a file: show its folder instead.
    openWithDesktop(select ? target.replace(/\/[^/]*$/, "") || "/" : target);
    return;
  }
  new Deno.Command("explorer.exe", {
    args: select ? [`/select,${target}`] : [target],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();
}

/** The desktop's own opener off Windows: `open` on macOS, `xdg-open` elsewhere. */
function openWithDesktop(target: string): void {
  new Deno.Command(Deno.build.os === "darwin" ? "open" : "xdg-open", {
    args: [target],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();
}

/**
 * Opens a web address in the default browser. Not `explorer.exe`: it opens a folder for a URL with a
 * query string instead of the browser (the OAuth sign-in URL opened File Explorer, 2026-10-06).
 * `url.dll,FileProtocolHandler` is ShellExecute on the URL, which handles query strings. Deno.Command
 * passes the URL as one argv with no shell, so `&` and `?` are safe.
 */
function openExternal(url: string): void {
  if (Deno.build.os !== "windows") return openWithDesktop(url);
  new Deno.Command("rundll32.exe", {
    args: ["url.dll,FileProtocolHandler", url],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();
}

// ---- The mod browser (browse.ts) ----------------------------------------------------------------

const browseCache = `${exordiumRoot}/browse`;
const downloadsFolder = `${exordiumRoot}/downloads`;

async function browseRoute(request: Request, url: URL): Promise<Response> {
  try {
    switch (url.pathname) {
      case "/api/browse": {
        const archive = await archiveList(browseCache, url.searchParams.get("refresh") === "1");
        return Response.json({
          sources: [
            { id: "archive", name: "Internet Archive", count: archive.items.length, fetchedAt: archive.fetchedAt },
            { id: "moddb", name: "ModDB", external: true, url: MODDB_URL },
          ],
          groups: KEYWORD_GROUPS.map((group) => ({
            id: group.id,
            label: group.label,
            keywords: group.keywords.map((keyword) => ({ id: keyword.id, label: keyword.label })),
          })),
          items: archive.items,
        });
      }
      case "/api/browse/item":
        return Response.json(await archiveItem(url.searchParams.get("id") ?? "", browseCache));
      case "/api/browse/image":
        return await browseImage(browseCache, url.searchParams.get("id") ?? "", url.searchParams.get("file") ?? "");
      case "/api/browse/downloads":
        return Response.json({
          folder: winPath(downloadsFolder),
          jobs: await jobList(downloadsFolder),
          ...throughput(),
        });
      case "/api/browse/latest":
        // The library home's Latest uploads row: a few cards, from the caches at once (browse.ts).
        return Response.json({ uploads: await latestUploads(browseCache) });
      case "/api/browse/moddb":
        return Response.json(await modDbList(browseCache, url.searchParams.get("refresh") === "1"));
      case "/api/browse/moddb-item": {
        // One entry's own page, for its card: screenshots, facts, the full description, its files.
        const page = url.searchParams.get("page") ?? "";
        try {
          return Response.json(await modDbDetails(browseCache, page));
        } catch (error) {
          return Response.json({ error: (error as Error).message }, { status: 502 });
        }
      }
      case "/api/browse/download":
      case "/api/browse/install": {
        // Download (or take an archive already downloaded), unpack on the install's drive, move the mod
        // into MODS (browse.ts, install.ts). Never overwrites a mod folder.
        if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
        const appSettings = appSettingsFromState(await readState());
        if (url.pathname === "/api/browse/download" && activeJobCount() >= appSettings.downloads.maxParallel) {
          return Response.json(
            { error: `Download limit reached (${appSettings.downloads.maxParallel}).` },
            { status: 409 },
          );
        }
        const body = await request.json().catch(() => null) as
          | { id?: unknown; file?: unknown; root?: unknown; title?: unknown }
          | null;
        const id = typeof body?.id === "string" ? body.id : "";
        const file = typeof body?.file === "string" ? body.file : "";
        const root = typeof body?.root === "string" ? body.root.trim().replace(/[\\/]+$/, "") : "";
        const title = typeof body?.title === "string" ? body.title : id;
        if (!id || !file) return Response.json({ error: "Missing id or file" }, { status: 400 });
        const modsDir = `${root.replace(/\\/g, "/")}/${LIBRARY_FOLDERS.mods}`;
        if (!root || !(await Deno.stat(modsDir).catch(() => null))?.isDirectory) {
          return Response.json({ error: `No MODS folder in ${winPath(root) || "the install"}.` }, { status: 400 });
        }
        // Unpacked beside MODS, on the same drive, so moving the mod in is a rename.
        const target: InstallTarget = {
          modsDir,
          stagingDir: `${root.replace(/\\/g, "/")}/.exordium-staging`,
          afterInstall: (folders) => warmLaunchHashes(root, { mods: folders }),
        };
        const downloadSettings = {
          keepArchives: appSettings.downloads.keepArchives,
          verifyAfterDownload: appSettings.downloads.verifyAfterDownload,
        };
        const job = url.pathname === "/api/browse/download"
          ? await startJob(downloadsFolder, browseCache, id, file, title, target, downloadSettings)
          : await installDownloaded(downloadsFolder, browseCache, id, file, title, target, downloadSettings);
        return Response.json(job);
      }
      case "/api/browse/pause": {
        if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
        const body = await request.json().catch(() => null) as
          | { id?: unknown; file?: unknown; paused?: unknown }
          | null;
        const held = pauseJob(String(body?.id ?? ""), String(body?.file ?? ""), body?.paused === true);
        return Response.json({ ok: held }, { status: held ? 200 : 409 });
      }
      case "/api/browse/cancel": {
        if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
        const body = await request.json().catch(() => null) as { id?: unknown; file?: unknown } | null;
        const cancelled = cancelJob(String(body?.id ?? ""), String(body?.file ?? ""));
        return Response.json({ ok: cancelled }, { status: cancelled ? 200 : 409 });
      }
      case "/api/browse/url-download": {
        if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
        const appSettings = appSettingsFromState(await readState());
        if (activeJobCount() >= appSettings.downloads.maxParallel) {
          return Response.json(
            { error: `Download limit reached (${appSettings.downloads.maxParallel}).` },
            { status: 409 },
          );
        }
        const body = await request.json().catch(() => null) as
          | { url?: unknown; root?: unknown; title?: unknown }
          | null;
        const downloadUrl = typeof body?.url === "string" ? body.url.trim() : "";
        const root = typeof body?.root === "string" ? body.root.trim().replace(/[\\/]+$/, "") : "";
        const title = typeof body?.title === "string" ? body.title.trim() : "";
        if (!downloadUrl) return Response.json({ error: "Missing URL" }, { status: 400 });
        const modsDir = `${root.replace(/\\/g, "/")}/${LIBRARY_FOLDERS.mods}`;
        if (!root || !(await Deno.stat(modsDir).catch(() => null))?.isDirectory) {
          return Response.json({ error: `No MODS folder in ${winPath(root) || "the install"}.` }, { status: 400 });
        }
        const target: InstallTarget = {
          modsDir,
          stagingDir: `${root.replace(/\\/g, "/")}/.exordium-staging`,
          afterInstall: (folders) => warmLaunchHashes(root, { mods: folders }),
        };
        const job = await startUrlJob(downloadsFolder, downloadUrl, title || "ModDB download", target, {
          keepArchives: appSettings.downloads.keepArchives,
          verifyAfterDownload: appSettings.downloads.verifyAfterDownload,
        });
        return Response.json(job);
      }
      case "/api/browse/open": {
        // Fixed destinations only: the downloads folder, one item's download folder, ModDB's list, or
        // an archive.org item page for a valid identifier.
        if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
        const body = await request.json().catch(() => null) as { what?: unknown; id?: unknown; file?: unknown } | null;
        const id = typeof body?.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(body.id) ? body.id : null;
        let target: string | null = null;
        if (body?.what === "downloads") {
          await Deno.mkdir(downloadsFolder, { recursive: true });
          target = winPath(downloadsFolder);
        } else if (body?.what === "download" && id) {
          target = winPath(`${downloadsFolder}/archive/${id}`);
        } else if (body?.what === "unpacked" && id) {
          target = winPath(`${downloadsFolder}/archive/${id}/unpacked`);
        } else if (body?.what === "file" && id) {
          // The downloaded archive itself, selected in its folder.
          const name = typeof body?.file === "string" ? body.file : "";
          let file = await downloadedFile(downloadsFolder, id, name);
          if (!file && id.startsWith("url-")) {
            const base = name.split(/[\\/]/).pop() ?? "";
            const candidate = base && !base.includes("..") ? `${downloadsFolder}/url/${id}/${base}` : "";
            file = candidate && (await Deno.stat(candidate).catch(() => null))?.isFile ? candidate : null;
          }
          if (file) {
            showInExplorer(winPath(file), true);
            return Response.json({ ok: true });
          }
        } else if (body?.what === "moddb") {
          target = MODDB_URL;
        } else if (body?.what === "page" && id) {
          target = `https://archive.org/details/${id}`;
        }
        if (!target) return Response.json({ error: "Nothing to open" }, { status: 400 });
        openExternal(target);
        return Response.json({ ok: true });
      }
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}

/** Opens a web address in the default browser. Only http(s): the system opens whatever it is given. */
async function openLink(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  const url = webUrl(body?.url);
  if (!url) return Response.json({ error: "Not a web address" }, { status: 400 });
  openExternal(url);
  return Response.json({ ok: true });
}

async function pickFolderRoute(url: URL): Promise<Response> {
  const startPath = url.searchParams.get("path") ?? undefined;
  const title = url.searchParams.get("title") ?? undefined;
  return Response.json(await pickFolderNative(startPath, title));
}

async function pickOpenFilesRoute(url: URL): Promise<Response> {
  const title = url.searchParams.get("title") ?? undefined;
  const startPath = url.searchParams.get("path") ?? undefined;
  const multiple = url.searchParams.get("multiple") !== "false";
  const extensionsText = url.searchParams.get("extensions");
  const extensions = extensionsText
    ? JSON.parse(extensionsText) as { label: string; extensions: string[] }[]
    : undefined;
  return Response.json(
    await pickOpenFilesNative({
      ...(title ? { title } : {}),
      ...(startPath ? { startPath } : {}),
      multiple,
      ...(extensions ? { extensions } : {}),
    }),
  );
}

async function symlinkStatus(): Promise<{ ok: boolean; admin: boolean; error: string | null }> {
  const folder = await Deno.makeTempDir({ prefix: "exordium-symlink-" });
  try {
    const target = `${folder}/target.txt`;
    const link = `${folder}/link.txt`;
    await Deno.writeTextFile(target, "ok");
    await Deno.symlink(target, link, { type: "file" });
    const ok = (await Deno.lstat(link)).isSymlink;
    return { ok, admin: await isAdmin(), error: ok ? null : "Windows did not create a file symlink." };
  } catch (error) {
    return { ok: false, admin: await isAdmin(), error: (error as Error).message };
  } finally {
    await Deno.remove(folder, { recursive: true }).catch(() => {});
  }
}

async function isAdmin(): Promise<boolean> {
  if (Deno.build.os !== "windows") return false;
  const text = await runPowerShellHidden(
    "[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()" +
      ".IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) | Set-Content -LiteralPath $OutFile",
  );
  return /^true$/i.test(text?.trim() ?? "");
}

async function restartAdmin(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (Deno.build.os !== "windows") {
    return Response.json({ error: "Administrator restart is Windows-only." }, {
      status: 400,
    });
  }
  const exe = Deno.execPath();
  const script = `Start-Process -FilePath ${
    powerShellLiteral(exe)
  } -Verb RunAs; Set-Content -LiteralPath $OutFile -Value ok`;
  const ok = await runPowerShellHidden(script);
  return Response.json({ ok: ok !== null });
}

async function installLocalArchive(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { archive?: unknown; root?: unknown; title?: unknown; importMetadata?: unknown }
    | null;
  const archive = typeof body?.archive === "string" ? body.archive.trim().replace(/\\/g, "/") : "";
  const root = typeof body?.root === "string" ? body.root.trim().replace(/[\\/]+$/, "") : "";
  const title = typeof body?.title === "string" && body.title.trim()
    ? body.title.trim()
    : archive.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Mod";
  if (!archive) return Response.json({ error: "Missing archive." }, { status: 400 });
  const archiveInfo = await Deno.stat(archive).catch(() => null);
  if (!archiveInfo?.isFile) return Response.json({ error: `${winPath(archive)} is not a file.` }, { status: 404 });
  const modsDir = `${root.replace(/\\/g, "/")}/${LIBRARY_FOLDERS.mods}`;
  if (!root || !(await Deno.stat(modsDir).catch(() => null))?.isDirectory) {
    return Response.json({ error: `No MODS folder in ${winPath(root) || "the install"}.` }, { status: 400 });
  }
  const result = await installArchive(archive, `${root.replace(/\\/g, "/")}/.exordium-staging/local`, modsDir, title, {
    keepDir: `${downloadsFolder}/local/${crypto.randomUUID()}/unpacked`,
  });
  const folders = result.installed.map((mod) => mod.name);
  if (folders.length > 0) await warmLaunchHashes(root, { mods: folders });
  const metadata = body?.importMetadata === true && folders.length > 0
    ? await importD2SEMetadataForFolders(root, folders)
    : null;
  return Response.json({ result, metadata });
}

/**
 * A mod's documentation, served from its own folder: `/api/docs/<title key>/<path>`. The path is part
 * of the URL, not a query, so a generated site's relative links and images keep working. Only files
 * inside the title's folder, of the types in DOC_TYPES, are served; every response carries a CSP
 * sandbox with no scripts, and the page shows them in a sandboxed frame as well.
 */
async function serveDoc(url: URL): Promise<Response> {
  const [keyPart, ...rest] = url.pathname.slice("/api/docs/".length).split("/");
  const target = parseEntryKey(decodeURIComponent(keyPart ?? ""));
  const root = (await readState()).root;
  const parts = rest.map((part) => decodeURIComponent(part));
  if (
    !target || !root || parts.length === 0 ||
    parts.some((part) => !part || part === "." || part === ".." || /[\\:]/.test(part))
  ) {
    return new Response("Not found", { status: 404 });
  }
  const extension = parts[parts.length - 1]!.split(".").pop()!.toLowerCase();
  const type = DOC_TYPES[extension];
  if (!type) return new Response("Not a documentation file", { status: 403 });
  const file = `${titleFolder(root, target)}/${parts.join("/")}`;
  let bytes: Uint8Array;
  try {
    const info = await Deno.lstat(file);
    if (!info.isFile) return new Response("Not found", { status: 404 });
    bytes = await Deno.readFile(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(bytes.slice(), {
    headers: {
      "content-type": type,
      "content-security-policy":
        // Frames are allowed from here only: old doc generators build framesets. Nested frames inherit
        // the sandbox, so scripts stay off throughout. No frame-ancestors: a sandboxed page has no
        // ordinary origin, so 'self' would refuse the frameset's own frames.
        `sandbox; default-src 'none'; img-src ${url.origin} data:; style-src ${url.origin} 'unsafe-inline'; font-src ${url.origin} data:; frame-src ${url.origin}; child-src ${url.origin}`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-cache",
    },
  });
}

// ---- Collections: the player's own sidebar groups ------------------------------------------------

/**
 * POST `{ action, ... }`; answers with every collection, in order.
 *
 * - `create` `{ name, key? }`: a new collection at the end, holding `key` when given.
 * - `rename` `{ id, name }`, `delete` `{ id }`: a deleted collection's titles stay in the library.
 * - `add` / `remove` `{ id, key }`: a title is in as many collections as the player puts it in.
 * - `order` `{ ids }`: the collections in this order. `items` `{ id, keys }`: one collection's titles
 *   in this order. Ids or keys the collection does not hold are ignored; ones left out keep their
 *   place at the end, so a stale page cannot drop anything.
 */
async function collectionsRoute(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const id = typeof body?.id === "string" ? body.id : "";
  const key = typeof body?.key === "string" && parseEntryKey(body.key) ? body.key : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  const strings = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const reorder = <T>(items: T[], order: string[], idOf: (item: T) => string): T[] => {
    const byId = new Map(items.map((item) => [idOf(item), item]));
    const first = order.flatMap((wanted) => {
      const item = byId.get(wanted);
      byId.delete(wanted);
      return item === undefined ? [] : [item];
    });
    return [...first, ...byId.values()];
  };
  let problem: string | null = null;
  const state = await writeState((state) => {
    const collections = state.collections ??= [];
    const target = collections.find((c) => c.id === id);
    switch (action) {
      case "create":
        if (!name) problem = "A collection needs a name.";
        else collections.push({ id: crypto.randomUUID(), name, keys: key ? [key] : [] });
        break;
      case "rename":
        if (!target || !name) problem = "No such collection, or no name.";
        else target.name = name;
        break;
      case "delete":
        state.collections = collections.filter((c) => c.id !== id);
        break;
      case "add":
        if (!target || !key) problem = "No such collection or title.";
        else if (!target.keys.includes(key)) target.keys.push(key);
        break;
      case "remove":
        if (target) target.keys = target.keys.filter((k) => k !== key);
        break;
      case "order":
        state.collections = reorder(collections, strings(body?.ids), (c) => c.id);
        break;
      case "items":
        if (target) target.keys = reorder(target.keys, strings(body?.keys), (k) => k);
        break;
      default:
        problem = "Unknown collection action.";
    }
  });
  if (problem) return Response.json({ error: problem }, { status: 400 });
  return Response.json({ collections: state.collections ?? [] });
}

// ---- Library actions: favorites, hiding, desktop shortcuts, uninstalling ---------------------------

function isPackaged(): boolean {
  return !/(^|[\\/])deno(\.exe)?$/i.test(Deno.execPath());
}

async function libraryRoute(request: Request, url: URL): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { key?: unknown; on?: unknown; root?: unknown; keepSaves?: unknown }
    | null;
  const key = typeof body?.key === "string" ? body.key : "";
  const target = parseEntryKey(key);
  if (!target) return Response.json({ error: "Missing or bad key" }, { status: 400 });
  switch (url.pathname) {
    case "/api/library/favorite":
    case "/api/library/hide": {
      const field = url.pathname.endsWith("favorite") ? "favorites" : "hidden";
      const on = body?.on === true;
      const state = await writeState((state) => {
        const list = new Set(state[field]);
        if (on) list.add(key);
        else list.delete(key);
        state[field] = [...list];
      });
      return Response.json({ favorites: state.favorites, hidden: state.hidden });
    }
    case "/api/library/shortcut":
      return await makeShortcut(key, target);
    case "/api/library/uninstall": {
      const root = typeof body?.root === "string" ? body.root.trim().replace(/[\\/]+$/, "") : "";
      return await uninstall(root, key, target, body?.keepSaves !== false);
    }
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}

/** A PNG wrapped as a one-image .ico (Vista and later accept PNG entries), for a shortcut's icon. */
function pngToIco(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const out = new Uint8Array(22 + png.length);
  const header = new DataView(out.buffer);
  header.setUint16(2, 1, true);
  header.setUint16(4, 1, true);
  out[6] = width >= 256 ? 0 : width;
  out[7] = height >= 256 ? 0 : height;
  header.setUint16(10, 1, true);
  header.setUint16(12, 32, true);
  header.setUint32(14, png.length, true);
  header.setUint32(18, 22, true);
  out.set(png, 22);
  return out;
}

const SHORTCUT_SCRIPT = `param([string]$Name, [string]$Target, [string]$Arguments, [string]$Directory, [string]$Icon)
$ErrorActionPreference = "Stop"
$desktop = [Environment]::GetFolderPath("Desktop")
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop ($Name + ".lnk")))
$link.TargetPath = $Target
$link.Arguments = $Arguments
$link.WorkingDirectory = $Directory
$link.IconLocation = $Icon + ",0"
$link.Save()
`;

/**
 * A desktop shortcut that plays the title: `Exordium.exe --play <key>`, with the title's own icon
 * (its PNG as an .ico) or else Exordium's. Made by Windows Script Host through PowerShell, run with
 * no console window. Values are passed as separate arguments, never spliced into script text.
 */
async function makeShortcut(key: string, target: BoxTarget): Promise<Response> {
  if (Deno.build.os !== "windows") return windowsOnly("Desktop shortcuts");
  if (!isPackaged()) {
    return Response.json({ error: "Desktop shortcuts start the packaged Exordium.exe; this is the dev server." }, {
      status: 409,
    });
  }
  const state = await readState();
  const root = state.root;
  if (!root) return Response.json({ error: "No install chosen." }, { status: 400 });
  const setup = target.kind === "mod"
    ? (await readTitleSetup(`${root}/${LIBRARY_FOLDERS.mods}/${target.folder}`))?.setup
    : await readCoreSetup(root, target.version);
  const title = target.kind === "mod" ? setup?.mod.title ?? target.folder : await coreName(root, target.version);
  const exe = Deno.execPath();
  let icon = exe;
  const iconPng = await modArt(root, target, "icon");
  if (iconPng) {
    // Exordium's own, never the mod's: the .ico is the shortcut's.
    const ico = `${exordiumRoot}/bin/icons/${artKey(target)}.ico`;
    await Deno.mkdir(ico.slice(0, ico.lastIndexOf("/")), { recursive: true });
    await Deno.writeFile(ico, pngToIco(await Deno.readFile(iconPng)));
    icon = winPath(ico);
  }
  const script = `${exordiumRoot}/bin/make-shortcut.ps1`;
  await Deno.mkdir(`${exordiumRoot}/bin`, { recursive: true });
  await Deno.writeTextFile(script, SHORTCUT_SCRIPT);
  const name = title.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim() || "Diablo II";
  const code = await runHidden("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    winPath(script),
    "-Name",
    name,
    "-Target",
    exe,
    "-Arguments",
    `--play "${key}"`,
    "-Directory",
    exe.slice(0, exe.lastIndexOf("\\")),
    "-Icon",
    icon,
  ]);
  if (code !== 0) {
    return Response.json({ error: `Could not make the shortcut (PowerShell exited with ${code}).` }, { status: 500 });
  }
  return Response.json({ ok: true, name: `${name}.lnk` });
}

/** Deletes a folder, removing each link or junction as a link and never entering it. */
async function removeTree(path: string): Promise<void> {
  const leaves: string[] = [];
  for await (const entry of Deno.readDir(path)) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory && !entry.isSymlink) await removeTree(child);
    else leaves.push(child);
  }
  for (const leaf of leaves) await Deno.remove(leaf);
  await Deno.remove(path);
}

/**
 * Deletes a mod's folder from MODS, and its box. The characters in its `save` folder are copied to
 * Exordium's own folder first unless the player said not to. Cores are shared by every mod built on
 * them and are not uninstalled here; a running mod is refused.
 */
async function uninstall(root: string, key: string, target: BoxTarget, keepSaves: boolean): Promise<Response> {
  if (target.kind !== "mod") {
    return Response.json({ error: "A core is shared by the mods built on it and is not uninstalled here." }, {
      status: 400,
    });
  }
  await refreshSessions();
  if (copiesRunning(key).length > 0) return Response.json({ error: "Close the game first." }, { status: 409 });
  const folder = `${root.replace(/\\/g, "/")}/${LIBRARY_FOLDERS.mods}/${target.folder}`;
  if (!root || !(await Deno.stat(folder).catch(() => null))?.isDirectory) {
    return Response.json({ error: `${winPath(folder)} does not exist.` }, { status: 404 });
  }
  let savesBackup: string | null = null;
  const saves = `${folder}/save`;
  if (keepSaves && (await Deno.stat(saves).catch(() => null))?.isDirectory) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${exordiumRoot}/saves/${slug(target.folder)}-${stamp}`;
    if ((await copyTree(saves, backup)) > 0) savesBackup = winPath(backup);
    else await Deno.remove(backup, { recursive: true }).catch(() => {});
  }
  await removeTree(folder);
  const id = boxIdFor(root, target);
  await (await Boxes.open(exordiumRoot)).remove(id).catch(() => {});
  // The settings its runs changed (the writable registry layer), kept per box id.
  await removeTree(`${exordiumRoot}/profiles/${id}`).catch(() => {});
  await writeState((state) => {
    state.favorites = state.favorites.filter((k) => k !== key);
    state.hidden = state.hidden.filter((k) => k !== key);
    for (const collection of state.collections ?? []) collection.keys = collection.keys.filter((k) => k !== key);
    if (state.lastPlayed === key) state.lastPlayed = null;
  });
  return Response.json({ ok: true, savesBackup });
}

// ---- Exordium's own updates (updater.ts) --------------------------------------------------------

/**
 * The folder updates replace files in: Exordium.exe's own. A dev server has none, so its updates are
 * staged in its state folder and never applied.
 */
const appDir = isPackaged() ? Deno.execPath().replace(/[\\/][^\\/]*$/, "") : `${exordiumRoot}/dev-app`;
const updater = new Updater({
  appDir,
  repo: Deno.env.get("EXORDIUM_UPDATE_REPO") || UPDATE_REPO,
  token: Deno.env.get("EXORDIUM_UPDATE_TOKEN") || null,
});

/** At startup: clear what the last update set aside, then check and download when the settings say so. */
async function startupUpdate(): Promise<void> {
  if (isPackaged()) {
    const removed = await sweepUpdate(appDir);
    if (removed) appLog("info", `update: removed ${removed} files the last update replaced`);
  }
  const settings = appSettingsFromState(await readState());
  if (!settings.updates.checkOnStartup || settings.privacy.localOnly) return;
  await checkAndDownload(settings.updates.includePrereleases);
}

async function checkAndDownload(includePrereleases: boolean): Promise<void> {
  const checked = await updater.check(includePrereleases);
  notify("status");
  if (checked.phase === "failed") appLog("warn", `update check: ${checked.error}`);
  if (checked.phase !== "available") return;
  appLog("info", `update: ${checked.update!.version} is available; downloading`);
  const downloaded = await updater.download();
  if (downloaded.phase === "failed") appLog("warn", `update download: ${downloaded.error}`);
  else appLog("info", `update: ${downloaded.update!.version} is ready`);
  notify("status");
}

/**
 * GET: the updater's state. POST `{ action }`: "check" (and download what it finds), "download", or
 * "apply", which swaps the files in and restarts Exordium. Applying waits for every game to close:
 * Exordium follows each run to back it up when it ends.
 */
async function updateRoute(request: Request): Promise<Response> {
  const view = () => ({ ...updater.state, packaged: isPackaged() });
  if (request.method !== "POST") return Response.json(view());
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (action === "check" || action === "download") {
    const refusal = await localOnlyRefusal();
    if (refusal) return refusal;
    const settings = appSettingsFromState(await readState());
    if (action === "check") void checkAndDownload(settings.updates.includePrereleases);
    else void updater.download().then(() => notify("status"));
    // Answers once the work has started; the page follows it through status events.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return Response.json(view());
  }
  if (action === "apply") {
    if (!isPackaged()) {
      return Response.json({ error: "Updates install into the packaged Exordium only." }, { status: 409 });
    }
    await refreshSessions();
    if (sessionRunning.length + legacyRunning.length > 0) {
      return Response.json({ error: "Close your games first: Exordium backs them up when they end." }, {
        status: 409,
      });
    }
    try {
      const version = await updater.apply();
      appLog("info", `update: ${APP_VERSION} -> ${version} applied; restarting`);
    } catch (error) {
      if (error instanceof UpdateError) return Response.json({ error: error.message }, { status: 500 });
      throw error;
    }
    // After the answer has gone out, so the page knows to expect the restart.
    setTimeout(() => void restartForUpdate(), 300);
    return Response.json({ ok: true, restarting: true });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}

/** Starts the updated Exordium.exe and exits this one. The new one claims instance.json. */
async function restartForUpdate(): Promise<void> {
  await Deno.remove(instanceFile).catch(() => {});
  await discordPresence.set(null).catch(() => {});
  const exe = Deno.execPath();
  const args = Deno.args.filter((arg, i, all) => arg !== "--play" && all[i - 1] !== "--play");
  if (!startDetached(exe, args, appDir)) {
    appLog("error", `update: could not start the updated Exordium (${exe}); start it again by hand`);
  }
  Deno.exit(0);
}

// ---- One Exordium at a time: `--play` from a desktop shortcut -------------------------------------

const instanceFile = `${exordiumRoot}/instance.json`;

/**
 * Started with `--play <key>` (a desktop shortcut): when another Exordium is already open, it is
 * asked to play the title and this one exits; otherwise this one plays it.
 *
 * The Exordium a shortcut hands over to is the one recorded in `instance.json`. A new one claims
 * the file only when the recorded one no longer answers: a second Exordium opened alongside (a dev
 * server, say) must not take the shortcuts away from the one the player is looking at.
 */
async function startInstance(): Promise<void> {
  const at = Deno.args.indexOf("--play");
  const key = at >= 0 ? Deno.args[at + 1] ?? null : null;
  const target = key ? parseEntryKey(key) : null;
  const root = (await readState()).root;
  const body = target && root
    ? JSON.stringify(target.kind === "mod" ? { root, folder: target.folder } : { root, core: target.version })
    : null;

  const other = await answeringInstance();
  if (body && other) {
    try {
      const response = await fetch(`http://127.0.0.1:${other.port}/api/play`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok || response.status === 409 || response.status === 422) Deno.exit(0);
    } catch {
      // It stopped answering in between: this one plays.
    }
  }
  if (!other) {
    await Deno.mkdir(exordiumRoot, { recursive: true });
    await Deno.writeTextFile(instanceFile, JSON.stringify({ pid: Deno.pid, port: server.addr.port }));
  }
  if (body) await play(new Request("http://127.0.0.1/api/play", { method: "POST", body }));
}

/**
 * Starts a fresh Exordium and exits this one: the way back from a WebView2 that has died for good
 * (webview.ts). The new one claims `instance.json`, which is cleared first. Games keep running; the
 * launcher keeps their sessions. Not again within ten minutes of the last time, so a WebView2 that
 * dies at every start cannot loop.
 */
async function restartApp(): Promise<void> {
  const last = Number(Deno.env.get("EXORDIUM_RESTARTED_AT") ?? 0);
  if (Date.now() - last < 10 * 60 * 1000) {
    appLog("error", "the WebView2 died again within ten minutes of a restart; not restarting again");
    return;
  }
  await Deno.remove(instanceFile).catch(() => {});
  const args = Deno.args.filter((arg, i, all) => arg !== "--play" && all[i - 1] !== "--play");
  // The new one inherits this environment: when it was restarted, and the flag that keeps its
  // WebView2 alive through GPU crashes.
  Deno.env.set("EXORDIUM_RESTARTED_AT", String(Date.now()));
  for (const [name, value] of Object.entries(hardenedWebViewEnv())) Deno.env.set(name, value);
  const exe = Deno.execPath();
  if (!startDetached(exe, args, exe.replace(/[\\/][^\\/]*$/, ""))) {
    appLog("error", `could not start a new Exordium (${exe}); this one stays, without its window`);
    return;
  }
  appLog("warn", `restarted as a new Exordium (${exe}); this one exits`);
  Deno.exit(0);
}

/** The Exordium recorded in `instance.json`, when it is another process and still answers. */
async function answeringInstance(): Promise<{ pid: number; port: number } | null> {
  try {
    const other = JSON.parse(await Deno.readTextFile(instanceFile)) as { pid: number; port: number };
    if (other.pid === Deno.pid) return null;
    const response = await fetch(`http://127.0.0.1:${other.port}/api/status`, { signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel();
    return response.ok ? other : null;
  } catch {
    return null;
  }
}

/** Opens a title's own folder in Explorer. The path comes from the title, never from the request. */
async function openFolder(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as { root?: unknown; key?: unknown } | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const target = parseEntryKey(typeof body?.key === "string" ? body.key : "");
  if (!root || !target) return Response.json({ error: "Missing root or key" }, { status: 400 });
  const folder = titleFolder(root, target);
  try {
    if (!(await Deno.stat(folder)).isDirectory) throw new Error();
  } catch {
    return Response.json({ error: `${winPath(folder)} does not exist.` }, { status: 404 });
  }
  showInExplorer(winPath(folder));
  return Response.json({ ok: true });
}

async function openAppFolder(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as { path?: unknown } | null;
  const key = typeof body?.path === "string" ? body.path : "";
  const folders: Record<string, string> = {
    data: exordiumRoot,
    library: libraryRoot,
    boxes: `${exordiumRoot}/boxes`,
    downloads: downloadsFolder,
    backups: `${exordiumRoot}/backups`,
    logs: `${exordiumRoot}/logs`,
    plugy: `${libraryRoot}/${LIBRARY_PLUGY}`,
  };
  const folder = folders[key];
  if (!folder) return Response.json({ error: "Unknown app folder" }, { status: 400 });
  await Deno.mkdir(folder, { recursive: true });
  showInExplorer(winPath(folder));
  return Response.json({ ok: true });
}

/** A description to show as text: a web address in its place is a link instead (see modLinks). */
function plainDescription(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && !webUrl(text) ? text : null;
}

/** A title's box, by install and title: `d2se-<slug>-<install tag>`. */
function boxIdFor(root: string, target: BoxTarget): string {
  const name = target.kind === "mod" ? target.folder : `core-${target.version}`;
  return `d2se-${slug(name)}-${installTag(root)}`;
}

function isNativeGameExeCore(core: string | null | undefined): boolean {
  return /^1\.0(?:[0-6](?:[bc])?)$/i.test(core?.trim() ?? "");
}

function loaderPlanOptions(setup: ModSetup): { expansion: boolean } {
  return { expansion: !isNativeGameExeCore(setup.mod.core) };
}

function gameFilesForCore<T extends { path: string }>(game: readonly T[], core: string | null | undefined): T[] {
  if (!isNativeGameExeCore(core)) return [...game];
  // Pre-LoD Game.exe versions open MPQs by name from the game folder. If expansion archives are
  // present beside them, they can mix classic code with LoD/current data and die during startup.
  const sharedArchives = new Set(GAME_ARCHIVES.map((name) => name.toLowerCase()));
  return game.filter((file) => {
    const path = file.path.toLowerCase();
    return !sharedArchives.has(path) || !EXPANSION_ARCHIVES.has(path);
  });
}

// ---- Logs -----------------------------------------------------------------------------------------

/**
 * What the game and its plugins write while running: D2's own trace (`D2<yymmdd>.txt`), plugin logs,
 * `Crashdump` and Exordium's loader log. They land in the box's game folder, not the mod folder,
 * because the game runs there. Only real files count: a link is something the mod shipped, such as
 * an old log left in its folder.
 */
const LOG_NAME = /\.(log|txt)$|^crashdump$/i;
/** How much of a log is sent: its end, which is where a crash is. */
const LOG_TAIL = 512 * 1024;

function logFolder(root: string, target: BoxTarget): string {
  return `${exordiumRoot}/boxes/${boxIdFor(root, target)}/game`;
}

async function listLogs(root: string, target: BoxTarget) {
  const folder = logFolder(root, target);
  const found: { name: string; size: number; modifiedAt: string | null }[] = [];
  try {
    for await (const entry of Deno.readDir(folder)) {
      if (entry.isSymlink || !entry.isFile || !LOG_NAME.test(entry.name)) continue;
      const info = await Deno.stat(`${folder}/${entry.name}`);
      found.push({ name: entry.name, size: info.size, modifiedAt: info.mtime?.toISOString() ?? null });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return found.sort((a, b) => (b.modifiedAt ?? "").localeCompare(a.modifiedAt ?? ""));
}

/**
 * GET: the box's logs, newest first, or with `name` the end of one as text. POST with `open`: the
 * folder in Explorer.
 */
async function logs(request: Request, url: URL): Promise<Response> {
  const target = parseEntryKey(url.searchParams.get("key") ?? "");
  const root = url.searchParams.get("root")?.trim();
  if (!target || !root) return Response.json({ error: "Missing root or key" }, { status: 400 });
  const folder = logFolder(root, target);

  if (request.method === "POST") {
    try {
      await Deno.stat(folder);
    } catch {
      return Response.json({ error: "This title has not been played yet." }, { status: 404 });
    }
    showInExplorer(winPath(folder));
    return Response.json({ ok: true });
  }

  const listed = await listLogs(root, target);
  const name = url.searchParams.get("name");
  if (!name) return Response.json({ folder: winPath(folder), logs: listed });
  const found = listed.find((log) => log.name.toLowerCase() === name.toLowerCase());
  if (!found) return Response.json({ error: "Log not found" }, { status: 404 });

  const file = await Deno.open(`${folder}/${found.name}`, { read: true });
  try {
    const start = Math.max(0, found.size - LOG_TAIL);
    await file.seek(start, Deno.SeekMode.Start);
    const bytes = new Uint8Array(found.size - start);
    let read = 0;
    while (read < bytes.length) {
      const n = await file.read(bytes.subarray(read));
      if (n === null) break;
      read += n;
    }
    // D2's trace mixes text with raw memory dumps; latin1 shows every byte without failing.
    const text = new TextDecoder("latin1").decode(bytes.subarray(0, read));
    return new Response(text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
        "x-log-truncated": start > 0 ? "1" : "0",
      },
    });
  } finally {
    file.close();
  }
}

/** What a title has: the images its manifest names, or for the banner D2SE's BMP. */
async function artSummary(root: string, target: BoxTarget) {
  const has = async (kind: ArtKind) => await modArt(root, target, kind) !== null;
  return {
    banner: await has("banner") ? "png" : await d2seBanner(root, target) ? "d2se" : null,
    icon: await has("icon"),
    portrait: await has("portrait"),
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
  plugY: PlugYFolder | null = null,
): { plan: Plan; sources: Map<string, string> } {
  const layers: FileLayer[] = [];
  const sources = new Map<string, string>();
  const addSources = (layer: string, base: string, files: readonly { path: string; source: string }[]) => {
    for (const file of files) sources.set(sourceKey(layer, file.path), `${base}/${file.source}`);
  };

  layers.push(toLayer("game", "game", game));
  addSources("game", root, game);

  if (core) {
    const coreBase = coreFolder(root, core.version);
    layers.push(toLayer("core", "core", core.scan.layer));
    addSources("core", coreBase, core.scan.layer);
    if (language && language !== "MOD") {
      const files = core.scan.languages[language] ?? [];
      layers.push(toLayer("core-language", "core", files));
      addSources("core-language", coreBase, files);
    }
  }

  if (plugY) {
    layers.push(toLayer("plugy", "core", plugY.files));
    addSources("plugy", plugY.folder, plugY.files);
  }

  if (mod) {
    const modBase = `${root}/${LIBRARY_FOLDERS.mods}/${mod.folder}`;
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
  copy = 1,
) {
  // Each copy has its own hive: `registry.hive`, then `registry.2.hive`, and so on.
  const hiveName = copy === 1 ? "registry.hive" : `registry.${copy}.hive`;
  for await (const entry of Deno.readDir(boxFolder)) {
    if (entry.isFile && entry.name.toLowerCase().startsWith(hiveName)) {
      await Deno.remove(`${boxFolder}/${entry.name}`);
    }
  }
  const file = `${boxFolder}/registry.txt`;
  await Deno.writeTextFile(file, formatHiveText(values));
  // What the run's changes are measured against, as it was at launch: collecting may happen later,
  // after the machine's keys or Exordium's own key list have changed.
  await Deno.writeTextFile(`${boxFolder}/registry.lower.json`, JSON.stringify(lower));
  const hive = `${boxFolder}/${hiveName}`;
  // The game's paths go into the loader config; the host's are what this server reads and writes.
  return { hive: gamePath(hive), file: gamePath(file), hostHive: hive, hostFile: file };
}

/**
 * After a run: the launcher read the box's hive back as text when the game exited, and whatever the
 * run changed becomes the title's writable layer (by box id). The comparison is against the values
 * the run started from, `registry.lower.json`, written when the box was prepared.
 */
async function collectRegistryDump(boxId: string, dump: string) {
  const lower = JSON.parse(
    await Deno.readTextFile(`${exordiumRoot}/boxes/${boxId}/registry.lower.json`),
  ) as ResolvedValue[];
  const after = parseHiveText(await Deno.readTextFile(dump));
  const layer = capturedChanges(lower, after);
  await writeWritableLayer(exordiumRoot, boxId, layer);
  await Deno.remove(dump);
  return { values: after.length, changes: layer.entries };
}

/** A path as the user reads it: backslashes on Windows, unchanged elsewhere. */
function winPath(path: string): string {
  return Deno.build.os === "windows" ? path.replace(/\//g, "\\") : path;
}

/**
 * A path as the game opens it: the loader config and the registry hold these. On Windows the same as
 * winPath; under Wine the host path through `Z:` (packages/runner/paths.ts).
 */
function gamePath(path: string): string {
  return Deno.build.os === "windows" ? path.replace(/\//g, "\\") : toWinePath(path);
}

function fileUrlPath(url: URL): string {
  const path = decodeURIComponent(url.pathname);
  return Deno.build.os === "windows" && /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path;
}

function executablePath(folder: string, executable: string): string {
  return /^[A-Za-z]:[\\/]/.test(executable) || executable.startsWith("/") ? executable : `${folder}/${executable}`;
}

async function installNativeLoader(
  folder: string,
  loader: ReturnType<typeof buildLoaderPlan>,
  registry: { hive: string; file: string },
  identity: { title: string; icon: string | null; windowTitle: string },
  run: { key: string; boxId: string; presence: string | null; diagnostics: AppSettings["diagnostics"] },
  copy = 1,
  othersRunning = false,
): Promise<{ config: string; log: string; launcher: string }> {
  // 1.14 keeps Blizzard's own Game.exe and is launched directly with registry/argument support only.
  // Every pre-1.14 core's Game.exe is the loader, linked in by the box (stampedGameExe).
  if (!othersRunning) {
    // From when each box's Game.exe was a stamped copy.
    await Deno.remove(`${folder.slice(0, folder.lastIndexOf("/"))}/loader-stamp.json`).catch(() => {});
  }
  await Deno.mkdir(sessions.folder, { recursive: true });
  // Copy 1 keeps the plain names, so running Game.exe by hand in the box still finds its config.
  const config = copy === 1 ? "exordium-loader.json" : `exordium-loader.${copy}.json`;
  const log = copy === 1 ? "exordium-loader.log" : `exordium-loader.${copy}.log`;
  await Deno.writeTextFile(
    `${folder}/${config}`,
    JSON.stringify(
      {
        hive: registry.hive,
        registryFile: registry.file,
        commandLine: loader.commandLine,
        gameVersion: loader.gameVersion ?? "",
        core: loader.core ?? "",
        singleExe: loader.singleExe,
        // Battle.net is reachable for a mod with a custom realm, or with the lockdown setting off.
        // Otherwise exordium-game greys the main-menu Battle.net button and blocks every way onto it
        // (lock_battlenet in main.cpp).
        battlenetAllowed: loader.battlenetAllowed,
        game: GAME_EXE,
        // The title's icon, which the loader puts on the game window (the taskbar's icon).
        icon: identity.icon ?? "",
        windowTitle: identity.windowTitle,
        // Run identity for future shortcut/session work. exordium-game currently ignores these.
        key: run.key,
        title: identity.title,
        boxId: run.boxId,
        copy,
        session: gamePath(sessions.file(run.boxId, copy)),
        ledger: gamePath(sessions.ledger),
        // Kept in the config for the next non-injecting game-activity implementation.
        ...(run.presence ? { discordClientId: DISCORD_CLIENT_ID, discordActivity: run.presence } : {}),
        handoff: true,
        graphics: true,
        graphicsInit: false,
        graphicsSurface: false,
        graphicsWrapper: false,
        graphicsWindow: false,
        watchdogSeconds: run.diagnostics.nativeLoaderDebug ? 5 : 0,
        probeFiles: run.diagnostics.verboseLaunchLogs
          ? ["data/global/excel/armor.bin", "data/global/excel/weapons.bin"]
          : [],
        diagnostics: {
          verboseLaunchLogs: run.diagnostics.verboseLaunchLogs,
          nativeLoaderDebug: run.diagnostics.nativeLoaderDebug,
          defenderTroubleshooting: run.diagnostics.defenderTroubleshooting,
        },
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
  return {
    config,
    log,
    launcher: GAME_EXE,
  };
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
  plugY: PlugYFolder | null = null,
): Plan {
  const files = new Map<string, ResolvedFile>();
  const add = (path: string, size: number, layer: string, role: ResolvedFile["role"]) => {
    files.set(path.toLowerCase(), { path, hash: "0".repeat(64), size, layer, role });
  };
  for (const file of game) add(file.path, file.size, "game", "game");
  for (const file of core?.scan.layer ?? []) add(file.path, file.size, "core", "core");
  for (const file of plugY?.files ?? []) add(file.path, file.size, "plugy", "core");
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
  if (/\.(png)$/i.test(path)) return "image/png";
  if (/\.(jpe?g)$/i.test(path)) return "image/jpeg";
  if (/\.(gif)$/i.test(path)) return "image/gif";
  if (/\.(webp)$/i.test(path)) return "image/webp";
  if (/\.(bmp)$/i.test(path)) return "image/bmp";
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

const SHELL32 = {
  ShellExecuteA: {
    parameters: ["pointer", "buffer", "buffer", "buffer", "buffer", "i32"],
    result: "pointer",
  },
} as const;

/** Opened on first use, on Windows only: opened at module level, it stopped the server loading elsewhere. */
let shell32: Deno.DynamicLibrary<typeof SHELL32> | null = null;

async function runElevated(scriptPath: string, resultPath: string, timeoutMs = 150_000): Promise<void> {
  if (Deno.build.os !== "windows") throw new Error("Elevated launches are only available on Windows.");
  shell32 ??= Deno.dlopen("shell32.dll", SHELL32);
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

/** The answer for a feature that only exists on Windows (D2SE, `.lnk` shortcuts, elevation). */
function windowsOnly(feature: string): Response {
  return Response.json({ error: `${feature} is only available on Windows.` }, { status: 501 });
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
