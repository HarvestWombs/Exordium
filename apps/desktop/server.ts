import {
  GAME_ARCHIVES,
  isSingleExeCore,
  type KnownFile,
  type ModImport,
  modProblems,
  type ModSetup,
  readD2SE,
  readSetupFile,
  type Renderer,
  rootCoreName,
  type ScannedFile,
  toLayer,
} from "@exordium/d2se";
import { BoxError, Boxes, type LinkMode } from "@exordium/box";
import { buildLoaderPlan } from "@exordium/launch";
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
  activeJobCount,
  archiveItem,
  archiveList,
  browseImage,
  downloadedFile,
  installDownloaded,
  type InstallTarget,
  jobList,
  KEYWORD_GROUPS,
  MODDB_URL,
  modDbList,
  startJob,
  startUrlJob,
  throughput,
} from "./browse.ts";
import { appLog, type Heartbeat, heartbeat, startAppLog } from "./applog.ts";
import { catalog, coreEntries, CoreInstallError, startCoreInstall } from "./cores.ts";
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
  DISCORD_CLIENT_ID,
  DiscordPresence,
  IDLE_ACTIVITY,
  runActivity,
} from "./discord.ts";
import { DOC_TYPES, findDocs, modLinks, webUrl } from "./docs.ts";
import { copyTree, installArchive } from "./install.ts";
import { exordiumManifestFromD2SE } from "./mod-manifest.ts";
import { runHidden } from "./native.ts";
import { pickFolderNative, pickOpenFilesNative } from "./native-dialog.ts";
import { exordiumRoot } from "./paths.ts";
import { isLive, processAlive, type SessionRecord, Sessions } from "./sessions.ts";
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
const LAUNCH_EXE = "exordium-launch.exe";
const PRESENCE_EXE = "exordium-presence.exe";
const HOOK_DLL = "exordium-hook.dll";
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
const art = new ArtStore(exordiumRoot);
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
  if (url.pathname === "/api/import-d2se-metadata") return await importD2SEMetadata(request);
  if (url.pathname === "/api/d2se-converter/preview") return await d2seConverterPreview(request);
  if (url.pathname === "/api/d2se-converter/write") return await d2seConverterWrite(request);
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
  if (url.pathname === "/api/options") return await options(request);
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
  if (localOnlyGuarded(url.pathname)) {
    const refusal = await localOnlyRefusal();
    if (refusal) return refusal;
  }
  if (url.pathname === "/api/discord/connect") return await discordConnect(request);
  if (url.pathname === "/api/discord/callback") return await discordCallback(url);
  if (url.pathname === "/api/discord/disconnect") return await discordDisconnect(request);
  if (url.pathname === "/api/cores") return await coresRoute(request, url);
  if (url.pathname === "/api/screenshots") return await screenshots(url);
  if (url.pathname === "/api/logs") return await logs(request, url);
  if (url.pathname === "/api/open-folder") return await openFolder(request);
  if (url.pathname === "/api/open-link") return await openLink(request);
  if (url.pathname === "/api/pick-folder") return await pickFolderRoute(url);
  if (url.pathname === "/api/pick-open-files") return await pickOpenFilesRoute(url);
  if (url.pathname === "/api/symlink-status") return Response.json(await symlinkStatus());
  if (url.pathname === "/api/restart-admin") return await restartAdmin(request);
  if (url.pathname === "/api/install-local-archive") return await installLocalArchive(request);
  if (url.pathname.startsWith("/api/library/")) return await libraryRoute(request, url);
  if (url.pathname.startsWith("/api/docs/")) return await serveDoc(url);
  if (url.pathname === "/api/browse" || url.pathname.startsWith("/api/browse/")) {
    return await browseRoute(request, url);
  }
  if (url.pathname === "/api/launch-d2se") return await launchD2SE(request);
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
  update?: Partial<TitleUpdateSettings>;
};

type TitleOptions = Partial<{
  language: string | null;
  renderer: Renderer;
  windowed: boolean;
  noSound: boolean;
  hardcore: boolean;
  plugY: boolean;
  direct: boolean;
  txt: boolean;
  skipToBNet: boolean;
  seed: string | null;
  startAct: 1 | 2 | 3 | 4 | 5 | null;
  /** About the title, set by the player: shown, never used to launch. */
  title: string | null;
  author: string | null;
  links: { label: string; url: string }[];
}>;

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

const RENDERER_CODES: Record<Renderer, number> = { ddraw: 0, d3d: 1, opengl: 2, glide: 3 };

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
  d2seUpdate?: unknown;
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
    seed: seedValue(launch.seed ?? manifest.seed),
    startAct: actValue(launch.startAct ?? manifest.startAct),
    description: textValue(manifest.description),
    readme: textValue(manifest.readme),
    d2mod: boolValue(loads.d2mod, false),
    nefex: boolValue(loads.nefex, false),
    d2extra: boolValue(loads.d2extra, false),
    d2seUtility: boolValue(loads.d2seUtility, false),
    d2se: boolValue(loads.d2se, false),
    d2seDll: textValue(loads.d2seDll),
    mpqs: textList(loads.mpqs ?? manifest.mpqs, "mpqs", problems),
    dlls: textList(loads.dlls ?? manifest.dlls, "dlls", problems),
    realm: realmValue(manifest.realm, problems),
    legacyUpdate: d2seUpdateValue(manifest.d2seUpdate, problems),
  });
  const result: TitleSetup = {
    setup,
    problems,
    author: textValue(manifest.author),
    links: Array.isArray(manifest.links) ? manifest.links as { label?: unknown; url?: unknown }[] : [],
  };
  const update = updateSettingsValue(manifest.update ?? manifest.updates, problems);
  if (update) result.update = update;
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
  description?: string | null;
  readme?: string | null;
  d2mod?: boolean;
  nefex?: boolean;
  d2extra?: boolean;
  d2seUtility?: boolean;
  d2se?: boolean;
  d2seDll?: string | null;
  mpqs?: string[];
  dlls?: string[];
  realm?: ModSetup["realm"];
  legacyUpdate?: ModSetup["update"];
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
      d2se: input.d2se ?? false,
      d2seDll: input.d2seDll ?? null,
      d2seUtility: input.d2seUtility ?? false,
      nefex: input.nefex ?? false,
      d2mod: input.d2mod ?? false,
      d2extra: input.d2extra ?? false,
      dlls: input.dlls ?? [],
      // The game opens patch_d2.mpq itself whenever it is there; it is not an option.
      patchD2: true,
      mpqs: input.mpqs ?? [],
    },
    realm: input.realm ?? null,
    update: input.legacyUpdate ?? null,
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

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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

function d2seUpdateValue(value: unknown, problems: TitleSetup["problems"]): ModSetup["update"] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    problems.push({ level: "warning", message: `${EXORDIUM_MOD_FILE} "d2seUpdate" should be an object.` });
    return null;
  }
  const mirrors = textList(value.mirrors, "d2seUpdate.mirrors", problems);
  const file = textValue(value.file);
  return file || mirrors.length > 0 ? { file, mirrors } : null;
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
  const importableMods: { folder: string; title: string; core: string | null }[] = [];
  const mods = await Promise.all(imported.mods.map(async (mod) => {
    const folder = `${imported.layout.root}/MODS/${mod.folder}`;
    // exordium.mod.json wins over D2SE_SETUP.ini (readTitleSetup).
    const native = await readExordiumMod(folder);
    if (!native && mod.setup) {
      importableMods.push({
        folder: mod.folder,
        title: mod.setup.mod.title ?? mod.setup.mod.name ?? mod.folder,
        core: mod.setup.mod.core,
      });
    }
    const target = { kind: "mod" as const, folder: mod.folder };
    const key = entryKey(target);
    const options = state.options[entryKey(target)] ?? {};
    const baseSetup = native?.setup ?? mod.setup ?? null;
    const setup = baseSetup ? applyOptions(baseSetup, options) : null;
    const core = setup?.mod.core ? cores.get(setup.mod.core.toLowerCase()) ?? null : null;
    const language = setup?.player.language?.toUpperCase() ?? null;
    const loader = setup
      ? buildLoaderPlan(
        previewPlan(gameFilesForCore(imported.game, setup.mod.core), core, mod, language),
        setup,
        loaderPlanOptions(setup),
      )
      : null;
    return {
      kind: "mod" as const,
      key,
      art: await artSummary(imported.layout.root, target),
      folder: mod.folder,
      title: options.title ?? setup?.mod.title ?? mod.folder,
      author: options.author ?? native?.author ?? null,
      realm: setup?.realm ?? null,
      description: plainDescription(setup?.mod.description),
      links: modLinks(setup?.mod ?? null, native?.links, options.links),
      ...findDocs(mod.scan.layer.map((file) => file.source), setup?.mod.readme ?? null),
      core: setup?.mod.core ?? null,
      version: setup?.mod.version ?? null,
      language: setup?.player.language ?? null,
      update: setup?.update ?? null,
      updateSettings: titleUpdateSettings(state, key, native?.update, setup?.update),
      updateCheck: state.updateChecks[key] ?? null,
      options,
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
      settings: loader?.settings ?? null,
    };
  }));
  // A core is also playable on its own, as D2SE's vanilla game, with the core's own D2SE_SETUP.ini.
  const coreEntries = await Promise.all(imported.cores.map(async (core) => {
    const target = { kind: "core" as const, version: core.version };
    const key = entryKey(target);
    const options = state.options[key] ?? {};
    const baseSetup = await readCoreSetup(imported.layout.root, core.version);
    const setup = baseSetup ? applyOptions(baseSetup, options) : null;
    const language = setup?.player.language?.toUpperCase() ?? null;
    const loader = setup
      ? buildLoaderPlan(
        previewPlan(gameFilesForCore(imported.game, setup.mod.core), core, null, language),
        setup,
        loaderPlanOptions(setup),
      )
      : null;
    return {
      kind: "core" as const,
      key,
      art: await artSummary(imported.layout.root, target),
      folder: core.version,
      title: coreTitle(core.version),
      author: options.author ?? null,
      realm: setup?.realm ?? null,
      description: plainDescription(setup?.mod.description),
      links: modLinks(setup?.mod ?? null, options.links),
      ...findDocs(core.scan.layer.map((file) => file.source), setup?.mod.readme ?? null),
      core: core.version,
      version: setup?.mod.version ?? null,
      language: setup?.player.language ?? null,
      update: setup?.update ?? null,
      updateSettings: titleUpdateSettings(state, key, undefined, setup?.update),
      updateCheck: state.updateChecks[key] ?? null,
      options,
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
      const result = await writeExordiumModDraft(`${imported.layout.root}/MODS/${mod.folder}`, mod.setup);
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
  const body = await request.json().catch(() => null) as { root?: unknown; folder?: unknown } | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  if (!root || !folder) return Response.json({ error: "Missing root or folder." }, { status: 400 });
  const imported = await readD2SE(root, { hash: false, hashWritable: false, linkData: true, mods: [folder] });
  if (!imported) return Response.json({ error: "That folder is not a D2SE install." }, { status: 404 });
  const mod = imported.mods.find((item) => item.folder.toLowerCase() === folder.toLowerCase());
  if (!mod?.setup) return Response.json({ error: "That mod has no D2SE_SETUP.ini to convert." }, { status: 404 });
  const target = `${imported.layout.root}/MODS/${mod.folder}/${EXORDIUM_MOD_FILE}`;
  const exists = await Deno.stat(target).then(() => true).catch(() => false);
  return Response.json({
    folder: mod.folder,
    path: winPath(target),
    exists,
    manifest: exordiumManifestFromD2SE(mod.setup),
  });
}

async function d2seConverterWrite(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { root?: unknown; folder?: unknown; text?: unknown; overwrite?: unknown }
    | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!root || !folder || !text.trim()) {
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
  const imported = await readD2SE(root, { hash: false, hashWritable: false, linkData: true, mods: [folder] });
  if (!imported) return Response.json({ error: "That folder is not a D2SE install." }, { status: 404 });
  const mod = imported.mods.find((item) => item.folder.toLowerCase() === folder.toLowerCase());
  if (!mod) return Response.json({ error: "That mod is not in this install." }, { status: 404 });
  const target = `${imported.layout.root}/MODS/${mod.folder}/${EXORDIUM_MOD_FILE}`;
  const exists = await Deno.stat(target).then(() => true).catch(() => false);
  if (exists && body?.overwrite !== true) {
    return Response.json({ error: `${EXORDIUM_MOD_FILE} already exists for ${mod.folder}.` }, { status: 409 });
  }
  await Deno.writeTextFile(target, JSON.stringify(parsed, null, 2) + "\n");
  return Response.json({ ok: true, folder: mod.folder, path: winPath(target) });
}

/** What a box runs: a mod folder, or a D2SE core on its own (vanilla, with the core's own setup). */
type BoxTarget = { kind: "mod"; folder: string } | { kind: "core"; version: string };

/** A core's folder: `D2SE/CORES/<version>`, or the install root itself for a 1.14 core. */
function coreFolder(root: string, version: string): string {
  return isSingleExeCore(version) ? root : `${root}/D2SE/CORES/${version}`;
}

/**
 * A core's own setup, for playing it vanilla: its `D2SE_SETUP.ini`. A 1.14 core has none (D2SE never
 * ran 1.14), and nor does a core from the browser's Cores tab (cores.ts), so those get DirectDraw in a
 * window, which needs no wrapper; Properties changes it.
 */
async function readCoreSetup(root: string, version: string): Promise<ModSetup | null> {
  const setup = await readSetupFile(coreFolder(root, version));
  if (setup) return setup;
  return nativeSetup({ title: coreTitle(version), core: version, renderer: "ddraw", windowed: true });
}

/**
 * GET `?root[&refresh=1]`: the cores catalog with what this install has. POST `{ root, core }`:
 * installs one into `D2SE\CORES` (cores.ts); the page polls GET for its progress.
 */
async function coresRoute(request: Request, url: URL): Promise<Response> {
  if (request.method === "POST") {
    const body = await request.json().catch(() => null) as { root?: unknown; core?: unknown } | null;
    const root = typeof body?.root === "string" ? body.root.trim().replace(/[\\/]+$/, "").replace(/\\/g, "/") : "";
    const core = typeof body?.core === "string" ? body.core.trim() : "";
    if (!root || !core) return Response.json({ error: "Missing root or core" }, { status: 400 });
    try {
      return Response.json(await startCoreInstall(root, core, downloadsFolder));
    } catch (error) {
      if (error instanceof CoreInstallError) return Response.json({ error: error.message }, { status: 400 });
      throw error;
    }
  }
  const root = url.searchParams.get("root")?.trim().replace(/[\\/]+$/, "").replace(/\\/g, "/") || null;
  try {
    const list = await catalog(url.searchParams.get("refresh") === "1");
    if (!list) return Response.json({ configured: false, cores: [] });
    const rootCore = root ? await rootCoreName(root).catch(() => null) : null;
    return Response.json({ configured: true, cores: await coreEntries(root, list, rootCore) });
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

async function boxSpecFor(root: string, target: BoxTarget) {
  const state = await readState();
  const coreVersion = target.kind === "core"
    ? target.version
    : (await readTitleSetup(`${root.replace(/[\\/]+$/, "")}/MODS/${target.folder}`))?.setup.mod.core ?? null;
  const cache = await hashCache();
  const imported = await readD2SE(root, {
    hash: true,
    hashWritable: false,
    linkData: true,
    cache,
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
    const native = await readExordiumMod(`${imported.layout.root}/MODS/${mod.folder}`);
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
    saves = `${imported.layout.root}/MODS/${mod.folder}/save`;
  } else {
    if (!core) throw new HttpError(404, `No D2SE core named "${target.version}".`);
    const coreSetup = await readCoreSetup(imported.layout.root, core.version);
    if (!coreSetup) throw new HttpError(422, `Core ${core.version} has no D2SE_SETUP.ini.`);
    setup = coreSetup;
    saves = `${coreFolder(imported.layout.root, core.version)}/save`;
  }

  setup = applyOptions(setup, state.options[entryKey(target)] ?? {});
  const language = setup.player.language?.toUpperCase() ?? null;
  const { plan, sources } = buildRealPlan(
    imported.layout.root,
    gameFilesForCore(imported.game, setup.mod.core),
    core,
    mod,
    language,
  );
  const loader = buildLoaderPlan(plan, setup, loaderPlanOptions(setup));
  if (loader.problems.some((problem) => problem.level === "error")) {
    throw new HttpError(422, loader.problems.map((problem) => problem.message).join("\n"));
  }
  const id = boxIdFor(imported.layout.root, target);
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
      plan,
      saves,
      folders: mod?.scan.data
        ? [{ path: "data", target: `${imported.layout.root}/MODS/${mod.folder}/${mod.scan.data}` }]
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
async function realiseD2SEBox(root: string, target: BoxTarget, copy = 1, othersRunning = false) {
  // TEMP timing: which phase makes Play slow.
  const timings: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  const { imported, state, appSettings, core, setup, plan, loader, id, boxes, spec } = await boxSpecFor(root, target);
  lap("readD2SE");
  lap("saveHashes");
  lap("setup");
  lap("plan");
  const realised = await boxes.realise(
    spec,
    { modes: BOX_MODES },
  ).catch((error) => {
    if (othersRunning && error instanceof BoxError) {
      throw new HttpError(409, "The mod changed since the running copy started. Close it to start another.");
    }
    throw error;
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
  const hive = await installRegistry(boxes.folder(id), registry, lowerRegistry, copy);
  lap("registry");
  const title = target.kind === "mod" ? setup.mod.title ?? target.folder : coreTitle(target.version);
  const iconFile = await artFile(imported.layout.root, target, "icon");
  const icon = iconFile ? winPath(iconFile) : null;
  const presence = gamePresenceAllowed(state, appSettings)
    ? activityJson(runActivity({ kind: target.kind, name: title, core: core?.version ?? loader.gameVersion ?? null }))
    : null;
  const files = await installNativeLoader(
    realised.folder,
    loader,
    hive,
    { title, icon },
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
  options: Record<string, TitleOptions>;
  updateSettings: Record<string, TitleUpdateSettings>;
  updateChecks: Record<string, TitleUpdateCheck>;
  /** Title keys pinned to the top of the list. */
  favorites: string[];
  /** Title keys hidden from the list; their files are untouched. */
  hidden: string[];
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

interface AppSettings {
  library: {
    autoScanOnStartup: boolean;
    hideUnsupported: boolean;
    defaultView: "list" | "grid";
    extraFolders: string[];
  };
  launch: {
    /** Minimize Exordium's window once a game has started. It keeps running: it follows the run. */
    minimizeOnLaunch: boolean;
    showLogsOnFailure: boolean;
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
    compactSidebar: boolean;
    reduceMotion: boolean;
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
const legacyStateFile = `${(Deno.env.get("LOCALAPPDATA") ?? Deno.cwd()).replace(/\\/g, "/")}/Exordium/state.json`;
const DEFAULT_APP_SETTINGS: AppSettings = {
  library: {
    autoScanOnStartup: true,
    hideUnsupported: false,
    defaultView: "grid",
    extraFolders: [],
  },
  launch: {
    minimizeOnLaunch: false,
    showLogsOnFailure: true,
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
    compactSidebar: false,
    reduceMotion: false,
  },
};

async function readState(): Promise<AppState> {
  try {
    return {
      root: null,
      lastPlayed: null,
      playedAt: {},
      options: {},
      updateSettings: {},
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
        options: {},
        updateSettings: {},
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
      options: {},
      updateSettings: {},
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
    }
  }
  await discordPresence.set(want).catch(() => {});
}

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
      "/api/browse/download",
      "/api/browse/url-download",
    ].includes(path);
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
    root: state.root,
    lastPlayed: state.lastPlayed,
    playedAt: state.playedAt,
    favorites: state.favorites,
    hidden: state.hidden,
    // A run whose game has exited is still settling (registry, box, backup) for ~10 s; it is not shown
    // as running any more. copiesRunning still counts it, so nothing rebuilds the box meanwhile.
    running: [...sessionRunning, ...legacyRunning].filter((run) => !endedRuns.has(`${run.key}#${run.copy}`)),
    // Seconds played, runs and the last end per title, from the launchers' ledger.
    playtime: Object.fromEntries(await sessions.playtime()),
    // A desktop shortcut starts Exordium.exe itself, which only exists in the packaged app.
    packaged: isPackaged(),
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
      art: winPath(`${exordiumRoot}/art`),
    },
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
    defaultView: ["list", "grid"],
    extraFolders: "string[]",
  });
  mergeObject(next.launch, record.launch, {
    minimizeOnLaunch: "boolean",
    showLogsOnFailure: "boolean",
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
    compactSidebar: "boolean",
    reduceMotion: "boolean",
  });
  return next;
}

type SettingShape = Record<string, "boolean" | "number" | "string[]" | string[]>;

function mergeObject(target: Record<string, unknown>, source: unknown, shape: SettingShape): void {
  if (!isRecord(source)) return;
  for (const [key, spec] of Object.entries(shape)) {
    const value = source[key];
    if (spec === "boolean" && typeof value === "boolean") target[key] = value;
    else if (spec === "number" && typeof value === "number" && Number.isFinite(value)) target[key] = value;
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

async function options(request: Request): Promise<Response> {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json().catch(() => null) as
    | { root?: unknown; folder?: unknown; core?: unknown; options?: unknown }
    | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const core = typeof body?.core === "string" ? body.core.trim() : "";
  if (!root || (!folder && !core)) return Response.json({ error: "Missing root, and folder or core" }, { status: 400 });
  const target: BoxTarget = folder ? { kind: "mod", folder } : { kind: "core", version: core };
  const key = entryKey(target);

  const state = await writeState((state) => {
    state.root = root;
    state.options ??= {};
    if (request.method === "DELETE") delete state.options[key];
    else state.options[key] = cleanOptions(body?.options);
  });
  return Response.json({ key, options: state.options[key] ?? {} });
}

function cleanOptions(input: unknown): TitleOptions {
  if (!input || typeof input !== "object") return {};
  const record = input as Record<string, unknown>;
  const next: TitleOptions = {};
  if (
    record.renderer === "ddraw" || record.renderer === "d3d" || record.renderer === "opengl" ||
    record.renderer === "glide"
  ) {
    next.renderer = record.renderer;
  }
  for (const key of ["windowed", "noSound", "hardcore", "plugY", "direct", "txt", "skipToBNet"] as const) {
    if (typeof record[key] === "boolean") next[key] = record[key];
  }
  if (typeof record.language === "string") {
    const language = record.language.trim();
    next.language = language && language !== "MOD" ? language : null;
  } else if (record.language === null) {
    next.language = null;
  }
  if (typeof record.title === "string") {
    const title = record.title.trim().slice(0, 120);
    next.title = title || null;
  } else if (record.title === null) {
    next.title = null;
  }
  if (typeof record.author === "string") {
    const author = record.author.trim().slice(0, 200);
    next.author = author || null;
  }
  if (Array.isArray(record.links)) {
    next.links = record.links
      .map((link) => link as { label?: unknown; url?: unknown })
      .map((link) => ({
        label: typeof link.label === "string" ? link.label.trim().slice(0, 80) : "",
        url: webUrl(link.url),
      }))
      .filter((link): link is { label: string; url: string } => link.url !== null)
      .slice(0, 20);
  }
  if (typeof record.seed === "string") {
    next.seed = seedValue(record.seed);
  } else if (record.seed === null) {
    next.seed = null;
  }
  if (typeof record.startAct === "number" || typeof record.startAct === "string") {
    next.startAct = actValue(record.startAct);
  } else if (record.startAct === null) {
    next.startAct = null;
  }
  return next;
}

function cleanUpdateSettings(input: unknown): TitleUpdateSettings {
  const record = isRecord(input) ? input : {};
  const channel = record.channel === "testing" || record.channel === "local" ? record.channel : "stable";
  const endpoint = typeof record.endpoint === "string" ? record.endpoint.trim().slice(0, 2048) : "";
  return {
    automatic: typeof record.automatic === "boolean" ? record.automatic : false,
    background: typeof record.background === "boolean" ? record.background : true,
    channel,
    endpoint: endpoint || null,
  };
}

function mergeTitleUpdateSettings(
  base?: Partial<TitleUpdateSettings>,
  d2se?: { file: string | null; mirrors: string[] } | null,
): TitleUpdateSettings {
  const endpoint = base?.endpoint ?? d2seEndpoint(d2se);
  return {
    automatic: base?.automatic ?? false,
    background: base?.background ?? true,
    channel: base?.channel ?? "stable",
    endpoint,
  };
}

function titleUpdateSettings(
  state: AppState,
  key: string,
  manifest?: Partial<TitleUpdateSettings>,
  d2se?: { file: string | null; mirrors: string[] } | null,
): TitleUpdateSettings {
  return {
    ...mergeTitleUpdateSettings(manifest, d2se),
    ...(state.updateSettings?.[key] ?? {}),
  };
}

function d2seEndpoint(update: { file: string | null; mirrors: string[] } | null | undefined): string | null {
  if (!update) return null;
  const candidates = [update.file, ...update.mirrors].filter((value): value is string => !!value?.trim());
  return candidates.find((value) =>
    /^https?:\/\//i.test(value) || /^[a-z]:[\\/]/i.test(value) || value.startsWith(".")
  ) ??
    null;
}

async function titleUpdates(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null) as
    | { root?: unknown; folder?: unknown; core?: unknown; settings?: unknown; action?: unknown; version?: unknown }
    | null;
  const root = typeof body?.root === "string" ? body.root.trim() : "";
  const folder = typeof body?.folder === "string" ? body.folder.trim() : "";
  const core = typeof body?.core === "string" ? body.core.trim() : "";
  if (!root || (!folder && !core)) return Response.json({ error: "Missing root, and folder or core" }, { status: 400 });
  const target: BoxTarget = folder ? { kind: "mod", folder } : { kind: "core", version: core };
  const key = entryKey(target);
  const action = typeof body?.action === "string" ? body.action : "save";

  if (action === "save") {
    const settings = cleanUpdateSettings(body?.settings);
    const state = await writeState((state) => {
      state.root = root;
      state.updateSettings ??= {};
      state.updateSettings[key] = settings;
    });
    return Response.json({ key, settings: state.updateSettings[key], check: state.updateChecks?.[key] ?? null });
  }

  if (action === "check") {
    const refusal = await localOnlyRefusal();
    if (refusal) return refusal;
    const settings = cleanUpdateSettings(body?.settings ?? (await readState()).updateSettings?.[key]);
    if (!settings.endpoint) return Response.json({ error: "Set an update endpoint first." }, { status: 400 });
    const currentVersion = typeof body?.version === "string" && body.version.trim() ? body.version.trim() : null;
    const check = await checkTitleUpdate(root, target, settings, currentVersion);
    await writeState((state) => {
      state.root = root;
      state.updateSettings ??= {};
      state.updateChecks ??= {};
      state.updateSettings[key] = settings;
      state.updateChecks[key] = check;
    });
    return Response.json({ key, settings, check });
  }

  return Response.json({ error: "Unknown update action." }, { status: 400 });
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
    ? `${root.replace(/\\/g, "/")}/MODS/${target.folder}`
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

function applyOptions(setup: ModSetup, options: TitleOptions): ModSetup {
  const renderer = options.renderer ?? setup.player.renderer;
  const player = {
    ...setup.player,
    renderer,
    rendererCode: RENDERER_CODES[renderer] ?? setup.player.rendererCode,
    language: options.language === undefined ? setup.player.language : options.language,
    windowed: options.windowed ?? setup.player.windowed,
    noSound: options.noSound ?? setup.player.noSound,
    hardcore: options.hardcore ?? setup.player.hardcore,
    plugY: options.plugY ?? setup.player.plugY,
    direct: options.direct ?? setup.player.direct,
    txt: options.txt ?? setup.player.txt,
    skipToBNet: options.skipToBNet ?? setup.player.skipToBNet ?? false,
    seed: options.seed === undefined ? setup.player.seed ?? null : options.seed,
    startAct: options.startAct === undefined ? setup.player.startAct ?? null : options.startAct,
  };
  return {
    ...setup,
    player,
    mod: {
      ...setup.mod,
      modable: setup.mod.modable || options.direct !== undefined || options.txt !== undefined,
    },
  };
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

  try {
    const box = await realiseD2SEBox(read.root, read.target, copy, others.length > 0);
    await Deno.remove(`${box.folder}/${box.log}`).catch(() => {});
    const startedAt = new Date().toISOString();
    let pid: number;
    if (box.nativeGameExe || box.singleExe) {
      await applyRegistryFile(box.registryFile);
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
): Promise<void> {
  let exitCode = 0;
  try {
    exitCode = (await child.status).code;
    endedRuns.add(`${key}#${copy}`);
    void updatePresence();
    notify("status");
    await collectRegistryMachine(box.id).catch((error) => {
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

async function applyRegistryFile(file: string): Promise<void> {
  const entries = parseHiveText(await Deno.readTextFile(file.replace(/\\/g, "/")));
  for (const entry of entries) await writeMachineValue(entry.key, entry.name, entry.value);
}

async function writeMachineValue(key: string, name: string, value: RegistryValue): Promise<void> {
  if (!/^HKCU\\/i.test(key) && !/^HKEY_CURRENT_USER\\/i.test(key)) {
    throw new HttpError(500, `Classic launch can only write HKCU values for now; got ${key}.`);
  }
  const args = ["add", key, ...regValueNameArgs(name), "/t", regType(value), "/d", regData(value), "/f"];
  const code = await runHidden("reg.exe", args);
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
  return target.kind === "mod" ? `${root}/MODS/${target.folder}` : coreFolder(root, target.version);
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
 * Artwork a mod ships itself: `exordium.mod.json`'s `art.banner` / `art.icon` / `art.portrait`, a PNG
 * inside the mod's folder. The path must stay inside the folder and the file must really be a PNG.
 */
async function modArt(root: string, target: BoxTarget, kind: ArtKind): Promise<string | null> {
  if (target.kind !== "mod") return null;
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
    return isPng(head) ? file : null;
  } catch {
    return null;
  }
}

/** The title's artwork file: the player's own, else what the mod ships. */
async function artFile(root: string | null, target: BoxTarget, kind: ArtKind): Promise<string | null> {
  if (await art.has(artKey(target), kind)) return art.path(artKey(target), kind);
  return root ? await modArt(root, target, kind) : null;
}

/**
 * GET `?root&key&kind`: the title's PNG (the player's, else the mod's own), or for a banner its D2SE
 * `ModBanner` as it is.
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
    const shipped = root ? await modArt(root, target, kind) : null;
    if (shipped) {
      return new Response(await Deno.readFile(shipped), {
        headers: { "content-type": "image/png", "cache-control": "no-cache" },
      });
    }
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
  new Deno.Command("explorer.exe", {
    args: select ? [`/select,${target}`] : [target],
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
      case "/api/browse/moddb":
        return Response.json(await modDbList(browseCache, url.searchParams.get("refresh") === "1"));
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
        const modsDir = `${root.replace(/\\/g, "/")}/MODS`;
        if (!root || !(await Deno.stat(modsDir).catch(() => null))?.isDirectory) {
          return Response.json({ error: `No MODS folder in ${winPath(root) || "the install"}.` }, { status: 400 });
        }
        // Unpacked beside MODS, on the same drive, so moving the mod in is a rename.
        const target: InstallTarget = { modsDir, stagingDir: `${root.replace(/\\/g, "/")}/.exordium-staging` };
        const downloadSettings = {
          keepArchives: appSettings.downloads.keepArchives,
          verifyAfterDownload: appSettings.downloads.verifyAfterDownload,
        };
        const job = url.pathname === "/api/browse/download"
          ? await startJob(downloadsFolder, browseCache, id, file, title, target, downloadSettings)
          : await installDownloaded(downloadsFolder, browseCache, id, file, title, target, downloadSettings);
        return Response.json(job);
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
        const modsDir = `${root.replace(/\\/g, "/")}/MODS`;
        if (!root || !(await Deno.stat(modsDir).catch(() => null))?.isDirectory) {
          return Response.json({ error: `No MODS folder in ${winPath(root) || "the install"}.` }, { status: 400 });
        }
        const target: InstallTarget = { modsDir, stagingDir: `${root.replace(/\\/g, "/")}/.exordium-staging` };
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
  const modsDir = `${root.replace(/\\/g, "/")}/MODS`;
  if (!root || !(await Deno.stat(modsDir).catch(() => null))?.isDirectory) {
    return Response.json({ error: `No MODS folder in ${winPath(root) || "the install"}.` }, { status: 400 });
  }
  const result = await installArchive(archive, `${root.replace(/\\/g, "/")}/.exordium-staging/local`, modsDir, title, {
    keepDir: `${downloadsFolder}/local/${crypto.randomUUID()}/unpacked`,
  });
  const folders = result.installed.map((mod) => mod.name);
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
  if (!isPackaged()) {
    return Response.json({ error: "Desktop shortcuts start the packaged Exordium.exe; this is the dev server." }, {
      status: 409,
    });
  }
  const state = await readState();
  const root = state.root;
  if (!root) return Response.json({ error: "No install chosen." }, { status: 400 });
  const setup = target.kind === "mod"
    ? (await readTitleSetup(`${root}/MODS/${target.folder}`))?.setup
    : await readCoreSetup(root, target.version);
  const title = target.kind === "mod" ? setup?.mod.title ?? target.folder : coreTitle(target.version);
  const exe = Deno.execPath();
  let icon = exe;
  const iconPng = await artFile(root, target, "icon");
  if (iconPng) {
    // Kept in Exordium's art folder, never the mod's: the .ico is the shortcut's, not the mod's.
    const ico = art.path(artKey(target), "icon").replace(/\.png$/i, ".ico");
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
  const folder = `${root.replace(/\\/g, "/")}/MODS/${target.folder}`;
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
    if (state.lastPlayed === key) state.lastPlayed = null;
  });
  return Response.json({ ok: true, savesBackup });
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
    boxes: `${exordiumRoot}/boxes`,
    downloads: downloadsFolder,
    backups: `${exordiumRoot}/backups`,
    logs: `${exordiumRoot}/logs`,
    art: `${exordiumRoot}/art`,
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

/** What a title has: its own PNGs, or for the banner D2SE's BMP. */
async function artSummary(root: string, target: BoxTarget) {
  const key = artKey(target);
  const has = async (kind: ArtKind) => await art.has(key, kind) || await modArt(root, target, kind) !== null;
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
  return { hive: winPath(`${boxFolder}/${hiveName}`), file: winPath(file) };
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

function winPath(path: string): string {
  return path.replace(/\//g, "\\");
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
  identity: { title: string; icon: string | null },
  run: { key: string; boxId: string; presence: string | null; diagnostics: AppSettings["diagnostics"] },
  copy = 1,
  othersRunning = false,
): Promise<{ config: string; log: string; launcher: string }> {
  // 1.14 keeps Blizzard's own Game.exe and is launched directly with registry/argument support only.
  // Every pre-1.14 core gets exordium-game.exe stamped as Game.exe. Release builds intentionally do
  // not ship or call the old remote-DLL-injection launcher.
  if (!othersRunning) {
    await Deno.remove(`${folder}/${LAUNCH_EXE}`).catch(() => {});
    await Deno.remove(`${folder}/${PRESENCE_EXE}`).catch(() => {});
    await Deno.remove(`${folder}/${HOOK_DLL}`).catch(() => {});
  }
  if (!loader.singleExe && !loader.nativeGameExe) {
    await installLoaderAsGame(folder, await nativeBuild("exordium-game.exe"), loader, identity, othersRunning);
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
        registryOnlyHook: false,
        game: GAME_EXE,
        // Run identity for future shortcut/session work. exordium-game currently ignores these.
        key: run.key,
        title: identity.title,
        boxId: run.boxId,
        copy,
        session: winPath(sessions.file(run.boxId, copy)),
        ledger: winPath(sessions.ledger),
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

function nativeBuildPath(name: string): string {
  return fileUrlPath(new URL(`../../native/loader/build/${name}`, import.meta.url));
}

/** One of the native builds (native/loader/build), which the packaged app carries. */
async function nativeBuild(name: string): Promise<Uint8Array> {
  const source = nativeBuildPath(name);
  try {
    return await Deno.readFile(source);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new HttpError(500, `${name} is not built at ${source}. Run \`deno task build:loader\`.`);
    }
    throw error;
  }
}

/** Pre-1.14: the loader becomes the box's Game.exe, stamped as the core's own. */
async function installLoaderAsGame(
  folder: string,
  exe: Uint8Array,
  loader: ReturnType<typeof buildLoaderPlan>,
  identity: { title: string; icon: string | null },
  othersRunning: boolean,
): Promise<void> {
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
  // A running copy holds Game.exe open; a new title name or icon applies once every copy has closed.
  if (!upToDate && !othersRunning) {
    await stampLoader(exe, gameExe, stamped, folder, version, identity, markerFile, want);
  }
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
