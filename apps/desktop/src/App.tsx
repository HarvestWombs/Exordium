import * as React from "react";
import type { ReactNode } from "react";
import { Browse, titleKey } from "./Browse.tsx";
import { Lightbox } from "./Lightbox.tsx";

type Level = "error" | "warning";
type ArtKind = "banner" | "icon" | "portrait";

interface Problem {
  level: Level;
  message: string;
}

interface ArchiveLoad {
  kind: string;
  path: string;
  priority: number;
  required: boolean;
}

interface PluginLoad {
  kind: string;
  path: string;
  required: boolean;
  init: string | number | null;
  release: string | number | null;
}

interface TitleOptions {
  language?: string | null;
  renderer?: string;
  windowed?: boolean;
  noSound?: boolean;
  hardcore?: boolean;
  plugY?: boolean;
  direct?: boolean;
  txt?: boolean;
  skipToBNet?: boolean;
  seed?: string | null;
  startAct?: 1 | 2 | 3 | 4 | 5 | null;
  title?: string | null;
  author?: string | null;
  links?: { label: string; url: string }[];
}

interface TitleUpdateSettings {
  automatic: boolean;
  background: boolean;
  channel: "stable" | "testing" | "local";
  endpoint: string | null;
}

interface TitleUpdateCheck {
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
}

interface ModLink {
  label: string;
  url: string;
  kind: "discord" | "github" | "moddb" | "youtube" | "reddit" | "forum" | "docs" | "web";
}

interface DocEntry {
  label: string;
  /** Relative to the mod folder, `/`-separated. */
  path: string;
  kind: "html" | "text" | "rtf";
}

/** A mod, or a D2SE core played on its own. */
interface Title {
  kind: "mod" | "core";
  /** `mod:<folder>` or `core:<version>`. */
  key: string;
  folder: string;
  title: string;
  author: string | null;
  /** The mod's own words about itself (exordium.mod.json, or D2SE's ModDescription when it is text). */
  description: string | null;
  links: ModLink[];
  docs: DocEntry[];
  changelogs: DocEntry[];
  core: string | null;
  version: string | null;
  language: string | null;
  realm: {
    gateway: string | null;
    timezone: string | null;
    gatewayName: string | null;
    selected: string | null;
    port: string | null;
  } | null;
  update: { file: string | null; mirrors: string[] } | null;
  updateSettings: TitleUpdateSettings;
  updateCheck: TitleUpdateCheck | null;
  options: TitleOptions;
  files: number;
  saves: number;
  screenshots: number;
  languages: string[];
  problems: Problem[];
  archives: ArchiveLoad[];
  plugins: PluginLoad[];
  art: { banner: "png" | "d2se" | null; icon: boolean; portrait: boolean };
  settings: {
    renderer: string;
    windowed: boolean;
    noSound: boolean;
    direct: boolean;
    txt: boolean;
    hardcore: boolean;
    plugY: boolean;
    language: string | null;
    skipToBNet?: boolean;
    seed?: string | null;
    startAct?: 1 | 2 | 3 | 4 | 5 | null;
  } | null;
}

interface Scan {
  root: string;
  cores: Title[];
  mods: Title[];
  importableMods: { folder: string; title: string; core: string | null }[];
}

interface Running {
  key: string;
  copy: number;
  title: string;
  pid: number;
  startedAt: string;
}

/** A title's play time, from the launchers' ledger. */
interface Playtime {
  seconds: number;
  runs: number;
  lastEndedAt: string | null;
}

interface Status {
  root: string | null;
  lastPlayed: string | null;
  playedAt: Record<string, string>;
  favorites: string[];
  hidden: string[];
  running: Running[];
  playtime: Record<string, Playtime>;
  /** Running as the packaged Exordium.exe, which a desktop shortcut can start. */
  packaged: boolean;
  discord: {
    enabled: boolean;
    gameActivity: boolean;
    connected: boolean;
    account: {
      id: string;
      username: string;
      globalName: string | null;
      avatar: string | null;
      scopes: string[];
      expiresAt: string | null;
    } | null;
  };
  appSettings: AppSettingsState;
}

type SettingsSection =
  | "library"
  | "launch"
  | "boxes"
  | "backups"
  | "downloads"
  | "privacy"
  | "diagnostics"
  | "appearance"
  | "discord";

interface AppPreferences {
  library: {
    autoScanOnStartup: boolean;
    hideUnsupported: boolean;
    defaultView: "list" | "grid";
    extraFolders: string[];
  };
  launch: {
    minimizeOnLaunch: boolean;
    showLogsOnFailure: boolean;
  };
  boxes: {
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

interface AppSettingsState {
  settings: AppPreferences;
  paths: Record<"data" | "boxes" | "downloads" | "backups" | "logs" | "art", string>;
}

interface Character {
  name: string;
  className: string;
  level: number;
  hardcore: boolean;
  dead: boolean;
  expansion: boolean;
  savedAt: string | null;
}

interface Screenshot {
  name: string;
  size: number;
  modifiedAt: string | null;
}

type Filter = "all" | "mods" | "cores" | "issues" | "hidden";
type Tab = "overview" | "documentation" | "changelogs" | "screenshots" | "backups" | "logs";
type DialogPage = "general" | "about" | "updates" | "files" | "artwork";

const RENDERERS: Record<string, string> = { glide: "Glide", ddraw: "DirectDraw", d3d: "Direct3D", opengl: "OpenGL" };

export function App() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [root, setRoot] = React.useState<string | null>(null);
  const [scan, setScan] = React.useState<Scan | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<Tab>("overview");
  const [dialog, setDialog] = React.useState<DialogPage | null>(null);
  const [starting, setStarting] = React.useState<string | null>(null);
  // A short line in the status bar for what Exordium is doing right now (e.g. a launch in progress),
  // since Play only turns to "Starting" and the box build that follows can take many seconds.
  const [activity, setActivity] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [dismissedImportRoot, setDismissedImportRoot] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem("exordium.convertDismissed");
    } catch {
      return null;
    }
  });
  const [converterOpen, setConverterOpen] = React.useState(false);
  const [menu, setMenu] = React.useState<{ x: number; y: number; t: Title } | null>(null);
  const [confirmBox, setConfirmBox] = React.useState<ConfirmRequest | null>(null);
  const [artVersion, setArtVersion] = React.useState(0);
  const [desktop, setDesktop] = React.useState(false);
  const [view, setView] = React.useState<"library" | "browse" | "settings">("library");
  const [libraryView, setLibraryView] = React.useState<"list" | "grid">("list");
  // In grid view the main area is the library's home, a grid of every title, until one is opened.
  const [gridHome, setGridHome] = React.useState(true);
  const [maximized, setMaximized] = React.useState(false);
  const [systemLight, setSystemLight] = React.useState(false);

  const titles = React.useMemo(() => [...(scan?.mods ?? []), ...(scan?.cores ?? [])], [scan]);
  const selected = titles.find((t) => t.key === selectedKey) ?? null;
  const runningKeys = new Set(status?.running.map((r) => r.key) ?? []);
  const showImportPrompt = Boolean(
    view === "library" && root && scan?.root === root && scan.importableMods.length > 0 &&
      dismissedImportRoot !== root,
  );

  const refreshStatus = React.useCallback(async () => {
    const next = await (await fetch("/api/status")).json() as Status;
    setStatus(next);
    return next;
  }, []);

  const load = React.useCallback(async (installRoot: string): Promise<boolean> => {
    setScanning(true);
    setError(null);
    try {
      const response = await fetch(`/api/scan-d2se?root=${encodeURIComponent(installRoot)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not read that install.");
      setScan(body);
      await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: installRoot }),
      });
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setScanning(false);
    }
  }, []);

  // Start where the player left off: the saved install, and the title played last.
  React.useEffect(() => {
    // In the desktop app this strips the OS frame, leaving the top bar as the title bar; in a
    // browser there is no window to drive and the page keeps the browser's chrome. See window.ts.
    void (async () => {
      try {
        const body = await (await fetch("/api/window/ready", { method: "POST" })).json();
        setDesktop(body.desktop === true);
      } catch {
        // No window control; nothing to show.
      }
    })();
    void (async () => {
      const first = await refreshStatus();
      setRoot(first.root);
      if (first.lastPlayed) setSelectedKey(first.lastPlayed);
      // "Scan on startup" off: the library waits for Read library (or a change that reads it).
      if (first.root && first.appSettings.settings.library.autoScanOnStartup && !await load(first.root)) {
        setRoot(null);
      }
    })();
  }, [load, refreshStatus]);

  React.useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;
    const sync = () => setSystemLight(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    const savedView = status?.appSettings.settings.library.defaultView;
    if (savedView) setLibraryView(savedView);
  }, [status?.appSettings.settings.library.defaultView]);

  // Windows can maximize or restore the window on its own (Snap to the top, Win+Up, dragging a
  // maximized window out), so the buttons and edge bands follow its real state on every resize.
  React.useEffect(() => {
    if (!desktop) return;
    let pending = 0;
    const onResize = () => {
      clearTimeout(pending);
      pending = setTimeout(async () => {
        try {
          const body = await (await fetch("/api/window/state")).json();
          setMaximized(body.maximized === true);
        } catch {
          // Keep the last known state.
        }
      }, 100);
    };
    globalThis.addEventListener("resize", onResize);
    return () => {
      clearTimeout(pending);
      globalThis.removeEventListener("resize", onResize);
    };
  }, [desktop]);

  // Nothing played yet: open on the first title.
  React.useEffect(() => {
    if (!selectedKey && titles[0]) setSelectedKey(titles[0].key);
  }, [selectedKey, titles]);

  // A heartbeat to the server's log every 30 s, with the page's memory and size, and any uncaught
  // error: what is needed to tell a dead or bloated page from a stuck server (applog.ts).
  React.useEffect(() => {
    const send = (extra: Record<string, unknown> = {}) => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      void fetch("/api/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          heap: memory?.usedJSHeapSize,
          nodes: document.getElementsByTagName("*").length,
          visible: document.visibilityState === "visible",
          ...extra,
        }),
      }).catch(() => {});
    };
    const onError = (event: ErrorEvent) => send({ error: `${event.message} at ${event.filename}:${event.lineno}` });
    const onRejection = (event: PromiseRejectionEvent) =>
      send({ error: `unhandled rejection: ${String(event.reason)}` });
    send();
    const timer = setInterval(() => send(), 30_000);
    globalThis.addEventListener("error", onError);
    globalThis.addEventListener("unhandledrejection", onRejection);
    return () => {
      clearInterval(timer);
      globalThis.removeEventListener("error", onError);
      globalThis.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // The server says when a game starts or ends, including one started for a desktop shortcut rather
  // than from this page. EventSource reconnects by itself if the stream drops.
  React.useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("status", () => void refreshStatus());
    return () => source.close();
  }, [refreshStatus]);

  async function play(title: Title) {
    if (!root) return;
    setStarting(title.key);
    setError(null);
    setActivity(`Starting ${title.title} — preparing its box…`);
    try {
      const response = await fetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(title.kind === "core" ? { root, core: title.folder } : { root, folder: title.folder }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The game did not start.");
      const next = await refreshStatus();
      if (next.appSettings.settings.launch.minimizeOnLaunch) void fetch("/api/window/minimize").catch(() => {});
      setActivity(`${title.title} launched`);
      setTimeout(() => setActivity((current) => (current === `${title.title} launched` ? null : current)), 4000);
    } catch (err) {
      setError((err as Error).message);
      setActivity(null);
      if (status?.appSettings.settings.launch.showLogsOnFailure) {
        openTitle(title.key);
        setTab("logs");
      }
    } finally {
      setStarting(null);
    }
  }

  const favorites = new Set(status?.favorites ?? []);
  const hidden = new Set(status?.hidden ?? []);
  const visible = titles.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    // Hidden titles leave every list but the Hidden one; their files are untouched.
    if (filter === "hidden") return hidden.has(t.key);
    if (hidden.has(t.key)) return false;
    if (
      status?.appSettings.settings.library.hideUnsupported &&
      filter !== "issues" &&
      t.problems.some((problem) => problem.level === "error")
    ) return false;
    if (filter === "mods") return t.kind === "mod";
    if (filter === "cores") return t.kind === "core";
    if (filter === "issues") return t.problems.length > 0;
    return true;
  });
  const pinned = titles.filter((t) => favorites.has(t.key) && !hidden.has(t.key));
  const recent = titles
    .filter((t) => status?.playedAt[t.key] && !hidden.has(t.key))
    .sort((a, b) => status!.playedAt[b.key]!.localeCompare(status!.playedAt[a.key]!))
    .slice(0, 3);
  function openTitle(key: string) {
    setSelectedKey(key);
    setGridHome(false);
  }

  const row = (t: Title, prefix = "") => (
    <TitleRow
      key={prefix + t.key}
      t={t}
      root={root}
      art={artVersion}
      selected={t.key === selectedKey && !(libraryView === "grid" && gridHome)}
      running={runningKeys.has(t.key)}
      favorite={favorites.has(t.key)}
      onSelect={openTitle}
      onMenu={(x, y) => setMenu({ x, y, t })}
    />
  );

  function say(message: string) {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 6000);
  }

  async function library(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`/api/library/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "That did not work.");
    return result;
  }

  async function titleAction(action: TitleAction, t: Title) {
    setMenu(null);
    try {
      switch (action) {
        case "favorite": {
          // Shown at once; the server is told in the background, and a failure puts it back.
          const on = !favorites.has(t.key);
          setStatus((current) =>
            current &&
            {
              ...current,
              favorites: on ? [...current.favorites, t.key] : current.favorites.filter((key) => key !== t.key),
            }
          );
          library("favorite", { key: t.key, on }).catch((err) => {
            setError((err as Error).message);
            void refreshStatus();
          });
          break;
        }
        case "shortcut": {
          const result = await library("shortcut", { key: t.key });
          say(`Added ${result.name} to your desktop.`);
          break;
        }
        case "files":
          await fetch("/api/open-folder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ root, key: t.key }),
          });
          break;
        case "unhide":
          await library("hide", { key: t.key, on: false });
          await refreshStatus();
          say(`${t.title} is back in the list.`);
          break;
        case "hide":
          setConfirmBox({
            title: `Hide ${t.title}?`,
            body:
              "It leaves the mod list; its files are not touched. Hidden titles are under the Hidden filter, where you can bring them back.",
            action: "Hide",
            run: async () => {
              await library("hide", { key: t.key, on: true });
              await refreshStatus();
              if (selectedKey === t.key) setSelectedKey(null);
            },
          });
          break;
        case "uninstall": {
          const response = await fetch(
            `/api/characters?root=${encodeURIComponent(root ?? "")}&key=${encodeURIComponent(t.key)}`,
          );
          const characters = response.ok ? ((await response.json()).characters as unknown[]).length : 0;
          setConfirmBox({
            title: `Uninstall ${t.title}?`,
            body: `This deletes ${root}\\MODS\\${t.folder} and everything in it.${
              characters ? ` Its save folder holds ${characters} character${characters === 1 ? "" : "s"}.` : ""
            }`,
            action: "Uninstall",
            danger: true,
            checkbox: characters ? "Keep a copy of the characters in Exordium's folder first" : undefined,
            run: async (keepSaves) => {
              const result = await library("uninstall", { key: t.key, root, keepSaves });
              if (selectedKey === t.key) setSelectedKey(null);
              await refreshStatus();
              if (root) await load(root);
              say(
                result.savesBackup
                  ? `${t.title} was uninstalled. Its characters were copied to ${result.savesBackup}.`
                  : `${t.title} was uninstalled.`,
              );
            },
          });
          break;
        }
        case "properties":
          setSelectedKey(t.key);
          setView("library");
          setDialog("general");
          break;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleMaximize() {
    const body = await (await fetch("/api/window/maximize", { method: "POST" })).json();
    if (body.ok) setMaximized(body.maximized);
  }

  // The bar's empty space, wordmark included, moves the window; its controls don't.
  const isDragSpace = (e: React.MouseEvent) =>
    desktop && e.button === 0 && !(e.target as HTMLElement).closest("button, input, form");

  const appearance = status?.appSettings.settings.appearance;
  const resolvedTheme = appearance?.theme === "system" ? (systemLight ? "light" : "dark") : appearance?.theme ?? "dark";
  const appClass = [
    "app",
    desktop ? "desktop" : "",
    `theme-${resolvedTheme}`,
    appearance?.compactSidebar ? "compact-sidebar" : "",
    appearance?.reduceMotion ? "reduce-motion" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={appClass}>
      {desktop && !maximized && <ResizeHandles />}
      <header
        className="topbar"
        onMouseDown={(e) => {
          if (isDragSpace(e) && e.detail === 1) {
            void fetch("/api/window/drag", { method: "POST" })
              .then((response) => response.json())
              .then((body) => {
                if (body.ok) setMaximized(body.maximized);
              })
              .catch(() => {});
          }
        }}
        onDoubleClick={(e) => {
          if (isDragSpace(e)) void toggleMaximize();
        }}
      >
        <div className="wordmark">EXORDIUM</div>
        <nav className="topnav">
          <button
            type="button"
            className={view === "library" ? "topnav-item active" : "topnav-item"}
            onClick={() => setView("library")}
          >
            LIBRARY
          </button>
          <button
            type="button"
            className={view === "browse" ? "topnav-item active" : "topnav-item"}
            onClick={() => setView("browse")}
          >
            BROWSE
          </button>
          <button
            type="button"
            className={view === "settings" ? "topnav-item active" : "topnav-item"}
            onClick={() => setView("settings")}
          >
            SETTINGS
          </button>
        </nav>
        <div className="grow" />
        {desktop && <WindowControls maximized={maximized} onToggleMaximize={() => void toggleMaximize()} />}
      </header>

      {error && (
        <div className="banner-error" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      {notice && <div className="banner-note" role="status">{notice}</div>}
      {showImportPrompt && (
        <div className="banner-action" role="status">
          <div>
            <strong>Convert D2SE metadata?</strong>
            <span>
              {scan!.importableMods.length} mod{scan!.importableMods.length === 1 ? "" : "s"}{" "}
              can be reviewed and saved as editable <code>exordium.mod.json</code> files.
            </span>
          </div>
          <button type="button" className="ghost primary" onClick={() => setConverterOpen(true)}>
            Open converter
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setDismissedImportRoot(root);
              try {
                if (root) localStorage.setItem("exordium.convertDismissed", root);
              } catch {
                // Storage unavailable: hidden for this session only.
              }
            }}
          >
            Not now
          </button>
        </div>
      )}
      {converterOpen && root && scan && (
        <D2SEConverter
          root={root}
          mods={scan.importableMods}
          onClose={() => setConverterOpen(false)}
          onSaved={async (message) => {
            await load(root);
            say(message);
          }}
        />
      )}
      {menu && (
        <TitleMenu
          x={menu.x}
          y={menu.y}
          t={menu.t}
          favorite={favorites.has(menu.t.key)}
          hidden={hidden.has(menu.t.key)}
          packaged={status?.packaged ?? false}
          onAction={(action) => void titleAction(action, menu.t)}
          onClose={() => setMenu(null)}
        />
      )}
      {confirmBox && <ConfirmDialog request={confirmBox} onClose={() => setConfirmBox(null)} />}

      {view === "browse" && (
        <Browse
          installed={new Set(titles.flatMap((t) => [titleKey(t.title), titleKey(t.folder)]))}
          root={root}
          onInstalled={(name) => {
            // A new folder in MODS: read the install again and open the mod on its page. openTitle
            // leaves the grid home, so "Open in library" lands on the mod in grid view too.
            setView("library");
            if (root) void load(root).then(() => openTitle(`mod:${name}`));
          }}
          onCoreInstalled={(core) => {
            // A new core in D2SE\CORES: read the install again so mods built on it can run. The page
            // stays on the Cores tab, where several are often installed in a row.
            if (root && core) void load(root);
          }}
        />
      )}
      {view === "settings" && status && <AppSettings status={status} onChanged={refreshStatus} />}
      {view === "library" && !root && status && (
        <SetupPage
          app={status.appSettings}
          busy={scanning}
          onChoose={(next) => {
            void load(next).then((ok) => {
              if (ok) setRoot(next);
            });
          }}
        />
      )}
      <div className="body" hidden={view !== "library" || !root}>
        <aside className="sidebar">
          <div className="sidebar-head">
            <label className="search">
              <SearchIcon />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder={scan ? `Search ${scan.mods.length} mods and ${scan.cores.length} cores` : "Search"}
                aria-label="Search the library"
              />
            </label>
            <div className="chips">
              {(["all", "mods", "cores", "issues", ...(hidden.size ? ["hidden" as const] : [])] as const).map((f) => (
                <button
                  type="button"
                  key={f}
                  className={filter === f ? "chip on" : "chip"}
                  onClick={() => setFilter(f)}
                >
                  {f[0]!.toUpperCase() + f.slice(1)}
                  {f === "hidden" ? ` · ${hidden.size}` : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="list">
            {scanning && !scan && <p className="muted pad">Reading the install…</p>}
            {!scanning && !scan && root && (
              <div className="pad">
                <p className="muted small">The library has not been read yet.</p>
                <button type="button" className="ghost primary compact" onClick={() => void load(root)}>
                  Read library
                </button>
              </div>
            )}
            {filter === "all" && !search && pinned.length > 0 && (
              <ListSection label="FAVORITES">{pinned.map((t) => row(t, "favorite-"))}</ListSection>
            )}
            {filter === "all" && !search && recent.length > 0 && (
              <ListSection label="RECENT">{recent.map((t) => row(t, "recent-"))}</ListSection>
            )}
            {scan && filter !== "cores" && (
              <ListSection label={`MODS · ${visible.filter((t) => t.kind === "mod").length}`}>
                {visible.filter((t) =>
                  t.kind === "mod"
                ).map((t) => row(t))}
              </ListSection>
            )}
            {scan && filter !== "mods" && (
              <ListSection label={`CORES · ${visible.filter((t) => t.kind === "core").length}`}>
                {visible.filter((t) =>
                  t.kind === "core"
                ).map((t) => row(t))}
              </ListSection>
            )}
          </div>
        </aside>

        <main className="main">
          {libraryView === "grid" && gridHome && scan
            ? (
              <LibraryGrid
                shelves={[
                  ...(filter === "all" && !search && pinned.length > 0 ? [{ label: "FAVORITES", titles: pinned }] : []),
                  ...(filter === "all" && !search && recent.length > 0 ? [{ label: "RECENT", titles: recent }] : []),
                  ...(filter !== "cores" ? [{ label: "MODS", titles: visible.filter((t) => t.kind === "mod") }] : []),
                  ...(filter !== "mods" ? [{ label: "CORES", titles: visible.filter((t) => t.kind === "core") }] : []),
                ]}
                root={root}
                art={artVersion}
                running={runningKeys}
                favorites={favorites}
                starting={starting}
                onOpen={openTitle}
                onPlay={(t) => void play(t)}
                onMenu={(x, y, t) => setMenu({ x, y, t })}
              />
            )
            : selected && root
            ? (
              <TitlePage
                t={selected}
                root={root}
                art={artVersion}
                tab={tab}
                onTab={setTab}
                playedAt={status?.playedAt[selected.key] ?? null}
                playtime={status?.playtime[selected.key] ?? null}
                running={status?.running.filter((r) => r.key === selected.key).length ?? 0}
                favorite={favorites.has(selected.key)}
                onFavorite={() => void titleAction("favorite", selected)}
                starting={starting === selected.key}
                onPlay={() => void play(selected)}
                onProperties={() => setDialog("general")}
                onBack={libraryView === "grid" ? () => setGridHome(true) : undefined}
              />
            )
            : (
              <div className="empty">
                {scanning
                  ? "Reading the install…"
                  : !scan && root
                  ? (
                    <button type="button" className="ghost primary" onClick={() => void load(root)}>
                      Read library
                    </button>
                  )
                  : "Nothing to show yet."}
              </div>
            )}
        </main>
      </div>

      <footer className="statusbar">
        <span className={activity || scanning || status?.running.length ? "dot live" : "dot"} />
        <span>
          {activity ??
            (scanning
              ? "Reading the install…"
              : status?.running.length
              ? runningSummary(status.running)
              : "Nothing running")}
        </span>
        <div className="grow" />
        <span>Registry: private per title</span>
        <span>·</span>
        <span>{scan ? `Library: ${scan.mods.length} mods, ${scan.cores.length} cores` : "Library: not read yet"}</span>
      </footer>

      {dialog && selected && root && (
        <Properties
          t={selected}
          root={root}
          page={dialog}
          art={artVersion}
          onPage={setDialog}
          onClose={() => setDialog(null)}
          onArtChanged={async () => {
            setArtVersion((v) => v + 1);
            await load(root);
          }}
        />
      )}
    </div>
  );
}

const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "launch", label: "Launching" },
  { id: "boxes", label: "Boxes" },
  { id: "backups", label: "Backups" },
  { id: "downloads", label: "Downloads" },
  { id: "privacy", label: "Privacy" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "appearance", label: "Appearance" },
  { id: "discord", label: "Discord" },
];

function AppSettings({ status, onChanged }: { status: Status; onChanged: () => Promise<unknown> }) {
  const [section, setSection] = React.useState<SettingsSection>("library");
  const [app, setApp] = React.useState<AppSettingsState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch("/api/app-settings");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not read app settings.");
    setApp(body);
  }, []);

  React.useEffect(() => {
    void refresh().catch((error) => setProblem((error as Error).message));
  }, [refresh]);

  async function patchSettings(patch: unknown) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save app settings.");
      setApp(body);
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="body settings-body">
      <aside className="settings-sidebar">
        <span className="eyebrow">SETTINGS</span>
        {SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "on" : ""}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>
      <div className="settings-page">
        {problem && <p className="error">{problem}</p>}
        {!app ? <p className="muted">Reading settings…</p> : (
          <SettingsSectionView
            section={section}
            app={app}
            status={status}
            busy={busy}
            onPatch={(patch) => void patchSettings(patch)}
            onDiscordChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}

function SettingsSectionView(
  { section, app, status, busy, onPatch, onDiscordChanged }: {
    section: SettingsSection;
    app: AppSettingsState;
    status: Status;
    busy: boolean;
    onPatch: (patch: unknown) => void;
    onDiscordChanged: () => Promise<unknown>;
  },
) {
  const s = app.settings;
  if (section === "discord") {
    return (
      <>
        <SettingsHead title="Discord" text="Account linking and activity visibility." />
        <DiscordSettings status={status} onChanged={onDiscordChanged} />
      </>
    );
  }
  if (section === "library") {
    return (
      <>
        <SettingsHead title="Library" text="How Exordium finds and presents your Diablo II install." />
        <SettingsGroup title="Install">
          <PathRow label="Diablo II folder" value={status.root ?? "No install selected"} />
          <ToggleRow
            label="Scan on startup"
            hint="Read the Diablo II install when Exordium opens, so the library is ready. Off waits for Read library."
            checked={s.library.autoScanOnStartup}
            disabled={busy}
            onChange={(value) => onPatch({ library: { autoScanOnStartup: value } })}
          />
          <ToggleRow
            label="Hide unsupported titles"
            hint="Leave out mods whose core is missing or that cannot launch."
            checked={s.library.hideUnsupported}
            disabled={busy}
            onChange={(value) => onPatch({ library: { hideUnsupported: value } })}
          />
          <SelectRow
            label="Default view"
            hint="List or grid when you open the library. The sidebar is always a list."
            value={s.library.defaultView}
            disabled={busy}
            options={[["list", "List"], ["grid", "Grid"]]}
            onChange={(value) => onPatch({ library: { defaultView: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title="Storage">
          <PathRow label="Exordium folder" value={app.paths.data} openKey="data" />
          <PathRow label="Artwork folder" value={app.paths.art} openKey="art" />
        </SettingsGroup>
      </>
    );
  }
  if (section === "launch") {
    return (
      <>
        <SettingsHead title="Launching" text="Global launch behavior that applies before per-mod options." />
        <SettingsGroup title="Behavior">
          <ToggleRow
            label="Minimize Exordium when a game starts"
            hint="Exordium keeps running in the taskbar: it follows the game to back up characters and show Discord activity."
            checked={s.launch.minimizeOnLaunch}
            disabled={busy}
            onChange={(value) => onPatch({ launch: { minimizeOnLaunch: value } })}
          />
          <ToggleRow
            label="Show logs when launch fails"
            hint="Open the title's Logs tab when a game fails to start."
            checked={s.launch.showLogsOnFailure}
            disabled={busy}
            onChange={(value) => onPatch({ launch: { showLogsOnFailure: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "boxes") {
    return (
      <>
        <SettingsHead
          title="Boxes"
          text="Each title runs from its own box: links to the game and mod files. It is brought up to date every launch."
        />
        <SettingsGroup title="Storage">
          <PathRow label="Box folder" value={app.paths.boxes} openKey="boxes" />
          <ToggleRow
            label="Clean stale boxes automatically"
            hint="When the library is read, delete the boxes of mods and cores no longer installed. Saves and backups are kept."
            checked={s.boxes.autoCleanStale}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { autoCleanStale: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title="Rebuild Box">
          <ToggleRow
            label="Confirm before rebuilding"
            hint="Ask first when you press Rebuild Box in a title's properties."
            checked={s.boxes.confirmRebuild}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { confirmRebuild: value } })}
          />
          <ToggleRow
            label="Back up saves before rebuilding"
            hint="Copy the title's characters first, to its Backups, unless they match the newest backup."
            checked={s.boxes.backupBeforeRebuild}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { backupBeforeRebuild: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "backups") {
    return (
      <>
        <SettingsHead title="Backups" text="Copies of each title's save folder, for every title." />
        <BackupSettingsPage />
      </>
    );
  }
  if (section === "downloads") {
    return (
      <>
        <SettingsHead title="Downloads" text="Mods and cores downloaded from Browse." />
        <SettingsGroup title="Downloads">
          <PathRow label="Download folder" value={app.paths.downloads} openKey="downloads" />
          <NumberRow
            label="Parallel downloads"
            hint="How many downloads run at once."
            value={s.downloads.maxParallel}
            min={1}
            max={8}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { maxParallel: value } })}
          />
          <ToggleRow
            label="Keep downloaded archives"
            hint="Keep the archive after a mod installs. Off deletes it to save space."
            checked={s.downloads.keepArchives}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { keepArchives: value } })}
          />
          <ToggleRow
            label="Verify downloads after completion"
            hint="Refuse to install a download that came in shorter or longer than its source said. Cores are always checked against their checksum."
            checked={s.downloads.verifyAfterDownload}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { verifyAfterDownload: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "privacy") {
    return (
      <>
        <SettingsHead title="Privacy" text="What Exordium does online. Discord's own settings are under Discord." />
        <SettingsGroup title="Network">
          <ToggleRow
            label="Local-only mode"
            hint="Stay offline: Browse, cores, Discord sign-in and Discord activity are all off. Games still launch."
            checked={s.privacy.localOnly}
            disabled={busy}
            onChange={(value) => onPatch({ privacy: { localOnly: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "diagnostics") {
    return (
      <>
        <SettingsHead title="Diagnostics" text="Tools for launch failures, crashes, and Defender troubleshooting." />
        <SettingsGroup title="Logs">
          <PathRow label="Exordium logs" value={app.paths.logs} openKey="logs" />
          <ToggleRow
            label="Verbose launch logs"
            hint="Write extra detail to the loader log for each launch."
            checked={s.diagnostics.verboseLaunchLogs}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { verboseLaunchLogs: value } })}
          />
          <ToggleRow
            label="Native loader debug"
            hint="Have the loader log where it is during startup, for diagnosing hangs."
            checked={s.diagnostics.nativeLoaderDebug}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { nativeLoaderDebug: value } })}
          />
          <ToggleRow
            label="Defender troubleshooting mode"
            hint="Avoid behavior antivirus may flag. Also turns off Discord game activity."
            checked={s.diagnostics.defenderTroubleshooting}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { defenderTroubleshooting: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  return (
    <>
      <SettingsHead title="Appearance" text="Display preferences for the launcher shell." />
      <SettingsGroup title="Display">
        <SelectRow
          label="Theme"
          hint="Dark, dim light, or follow Windows."
          value={s.appearance.theme}
          disabled={busy}
          options={[["dark", "Dark"], ["light", "Dim light"], ["system", "Use system"]]}
          onChange={(value) => onPatch({ appearance: { theme: value } })}
        />
        <ToggleRow
          label="Compact sidebar"
          hint="Smaller rows in the library sidebar, so more titles fit."
          checked={s.appearance.compactSidebar}
          disabled={busy}
          onChange={(value) => onPatch({ appearance: { compactSidebar: value } })}
        />
        <ToggleRow
          label="Reduce motion"
          hint="Turn off animations and transitions."
          checked={s.appearance.reduceMotion}
          disabled={busy}
          onChange={(value) => onPatch({ appearance: { reduceMotion: value } })}
        />
      </SettingsGroup>
    </>
  );
}

function SettingsHead({ title, text }: { title: string; text: string }) {
  return (
    <div className="settings-page-head">
      <h1>{title}</h1>
      <p className="muted">{text}</p>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="option-section settings-group">
      <h2 className="eyebrow">{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

function ToggleRow(
  { label, hint, checked, disabled, onChange }: {
    label: string;
    hint?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (value: boolean) => void;
  },
) {
  return (
    <label className="settings-row">
      <span className="settings-label">
        {label}
        {hint && <small className="settings-hint">{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function SelectRow(
  { label, hint, value, options, disabled, onChange }: {
    label: string;
    hint?: string;
    value: string;
    options: [string, string][];
    disabled?: boolean;
    onChange: (value: string) => void;
  },
) {
  return (
    <label className="settings-row">
      <span className="settings-label">
        {label}
        {hint && <small className="settings-hint">{hint}</small>}
      </span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>
  );
}

function NumberRow(
  { label, hint, value, min, max, disabled, onChange }: {
    label: string;
    hint?: string;
    value: number;
    min: number;
    max: number;
    disabled?: boolean;
    onChange: (value: number) => void;
  },
) {
  return (
    <label className="settings-row">
      <span className="settings-label">
        {label}
        {hint && <small className="settings-hint">{hint}</small>}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function PathRow({ label, value, openKey }: { label: string; value: string; openKey?: string }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <div className="path-actions">
        <code>{value}</code>
        {openKey && (
          <button type="button" className="ghost" onClick={() => void openAppFolder(openKey)}>
            Open
          </button>
        )}
      </div>
    </div>
  );
}

/** Settings -> Backups: the backup settings every title shares (backups.ts, /api/backups). */
function BackupSettingsPage() {
  const [settings, setSettings] = React.useState<BackupSettings | null>(null);
  const [keep, setKeep] = React.useState("");
  const [folder, setFolder] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const apply = React.useCallback((next: BackupSettings) => {
    setSettings(next);
    setKeep(String(next.keep));
    setFolder(next.custom ? next.folder : "");
  }, []);

  React.useEffect(() => {
    void (async () => {
      const response = await fetch("/api/backups");
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.settings) apply(body.settings);
      else setProblem(body.error ?? "Could not read the backup settings.");
    })();
  }, [apply]);

  async function save(change: Partial<{ auto: boolean; keep: number; folder: string }>) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", ...change }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save.");
      apply(body.settings);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return problem ? <p className="error">{problem}</p> : <p className="muted">Reading…</p>;
  return (
    <>
      <SettingsGroup title="Automatic">
        <ToggleRow
          label="Back up when a game closes"
          hint="When the last copy of a title closes, copy its save folder. Skipped if nothing changed since the last backup."
          checked={settings.auto}
          disabled={busy}
          onChange={(value) => void save({ auto: value })}
        />
        <label className="settings-row">
          <span className="settings-label">
            Keep the newest
            <small className="settings-hint">
              Automatic backups kept per title. Manual ones stay until you delete them.
            </small>
          </span>
          <input
            type="number"
            min={1}
            max={999}
            value={keep}
            disabled={busy}
            onChange={(event) => setKeep(event.currentTarget.value)}
            onBlur={() => {
              const value = Number(keep);
              if (Number.isInteger(value) && value >= 1 && value !== settings.keep) void save({ keep: value });
              else setKeep(String(settings.keep));
            }}
          />
        </label>
      </SettingsGroup>
      <SettingsGroup title="Location">
        <div className="settings-row">
          <span className="settings-label">
            Backup folder
            <small className="settings-hint">
              Blank uses Exordium's own folder. A cloud-synced folder keeps them off this machine. Changing it does not
              move existing backups.
            </small>
          </span>
          <div className="path-actions">
            <input
              type="text"
              value={folder}
              placeholder={settings.custom ? "" : settings.folder}
              disabled={busy}
              onChange={(event) => setFolder(event.currentTarget.value)}
            />
            <button
              type="button"
              className="ghost"
              disabled={busy || folder.trim() === (settings.custom ? settings.folder : "")}
              onClick={() => void save({ folder })}
            >
              Save
            </button>
          </div>
        </div>
      </SettingsGroup>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}

function DiscordSettings(
  { status, onChanged }: {
    status: Status;
    onChanged: () => Promise<unknown>;
  },
) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const account = status.discord.account;

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setProblem(null);
    try {
      const init: RequestInit = { method: "POST" };
      if (body) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const response = await fetch(path, init);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Discord settings did not update.");
      await onChanged();
      return json;
    } catch (error) {
      setProblem((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const body = await post("/api/discord/connect");
    if (body?.url) await openLink(body.url);
  }

  return (
    <>
      <SettingsGroup title="Account">
        <div className="settings-row">
          <span className="settings-label">
            {account ? account.globalName ?? account.username : "Discord account"}
            <small className="settings-hint">
              {account
                ? `Connected. Scopes: ${account.scopes.join(", ") || "none"}.`
                : "Sign in with Discord: your identity for social features as they land. No password is shared."}
            </small>
          </span>
          {account
            ? (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void post("/api/discord/disconnect")}
              >
                Disconnect
              </button>
            )
            : (
              <button type="button" className="ghost compact" disabled={busy} onClick={() => void connect()}>
                Connect Discord
              </button>
            )}
        </div>
      </SettingsGroup>
      <SettingsGroup title="Activity">
        <ToggleRow
          label="Show launched games"
          hint="Show what you're playing in Discord (title, core, time played). Needs Exordium open while you play."
          checked={status.discord.gameActivity}
          disabled={busy}
          onChange={(value) => void post("/api/discord", { gameActivity: value })}
        />
        <ToggleRow
          label="Show Exordium idle status"
          hint="Shows &quot;Choosing a mod · in Exordium&quot; while Exordium is open and nothing runs. Separate from games."
          checked={status.discord.enabled}
          disabled={busy}
          onChange={(value) => void post("/api/discord", { enabled: value })}
        />
      </SettingsGroup>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}

function SetupPage(
  { app, busy, onChoose }: { app: AppSettingsState; busy: boolean; onChoose: (root: string) => void },
) {
  const [folder, setFolder] = React.useState("");
  const [symlink, setSymlink] = React.useState<{ ok: boolean; admin: boolean; error: string | null } | null>(null);
  const ready = folder.trim().length > 0;
  React.useEffect(() => {
    void fetch("/api/symlink-status").then((response) => response.json()).then(setSymlink).catch(() => {});
  }, []);
  async function choose(current: string, setter: (value: string) => void, title: string) {
    const params = new URLSearchParams({ title });
    if (current) params.set("path", current);
    const response = await fetch(`/api/pick-folder?${params}`);
    if (!response.ok) return;
    const body = await response.json();
    if (body.path) setter(body.path);
  }
  return (
    <main className="setup-page">
      <div className="setup-shell">
        <div className="setup-head">
          <p className="eyebrow accent">First launch</p>
          <h1>Set up Exordium</h1>
          <p className="muted">
            Pick your Diablo II folder once. Exordium keeps its own files in one portable folder so they are easy to
            inspect, back up, or clear.
          </p>
        </div>
        <ol className="setup-steps">
          <li className={`setup-step active ${folder.trim() ? "done" : ""}`}>
            <span className="setup-num">{folder.trim() ? "✓" : "1"}</span>
            <div>
              <h2>Diablo II install</h2>
              <p className="muted">Choose the folder that contains Game.exe, D2SE.exe, D2SE\CORES, and MODS.</p>
              <div className="setup-path">
                <input
                  value={folder}
                  placeholder="C:\Program Files (x86)\Diablo II"
                  disabled={busy}
                  onChange={(event) => setFolder(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === "Enter" && ready && !busy && onChoose(folder.trim())}
                  autoFocus
                />
                <button
                  type="button"
                  className="ghost primary"
                  disabled={busy}
                  onClick={() => void choose(folder, setFolder, "Choose Diablo II install")}
                >
                  Choose…
                </button>
              </div>
            </div>
          </li>
          <li className="setup-step done">
            <span className="setup-num">✓</span>
            <div>
              <h2>Storage</h2>
              <p className="muted">Boxes, backups, downloads, logs and settings are kept together in one folder:</p>
              <code className="setup-code">{app.paths.data}</code>
            </div>
          </li>
          <li className="setup-step">
            <span className="setup-num">3</span>
            <div>
              <h2>
                Imports <span className="muted small">optional</span>
              </h2>
              <p className="muted">
                D2SE mods are kept in place. After setup, Exordium can create editable exordium.mod.json drafts from
                D2SE_SETUP.ini.
              </p>
            </div>
          </li>
        </ol>
        {symlink && !symlink.ok && (
          <div className="setup-warning">
            <strong>Symlinks are not available.</strong>
            <span>
              Boxes need file symlinks to avoid copying full MPQs. Enable Windows Developer Mode or restart Exordium as
              administrator.
            </span>
            {!symlink.admin && (
              <button
                type="button"
                className="ghost"
                onClick={() => void fetch("/api/restart-admin", { method: "POST" })}
              >
                Restart as admin
              </button>
            )}
          </div>
        )}
        {ready && (
          <div className="setup-finish">
            <button type="button" className="ghost primary" disabled={busy} onClick={() => onChoose(folder.trim())}>
              {busy ? "Reading…" : "Finish setup"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function ListSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="list-section">
      <div className="list-label">{label}</div>
      <div className="list-items">{children}</div>
    </section>
  );
}

function TitleRow(
  { t, root, art, selected, running, favorite, onSelect, onMenu }: {
    t: Title;
    root: string | null;
    art: number;
    selected: boolean;
    running: boolean;
    favorite: boolean;
    onSelect: (key: string) => void;
    onMenu: (x: number, y: number) => void;
  },
) {
  const health = t.problems.some((p) => p.level === "error") ? "bad" : t.problems.length ? "warn" : "good";
  return (
    <button
      type="button"
      className={selected ? "row on" : "row"}
      onClick={() => onSelect(t.key)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(t.key);
        onMenu(e.clientX, e.clientY);
      }}
    >
      <TitleIcon t={t} root={root} art={art} size={24} />
      <span className="row-title">{t.title}</span>
      {favorite && <span className="row-star" title="Favorite">★</span>}
      {running
        ? <span className="row-live">RUNNING</span>
        : <span className={`dot ${health}`} title={health === "good" ? "Ready" : `${t.problems.length} problems`} />}
    </button>
  );
}

type TitleAction = "favorite" | "shortcut" | "files" | "hide" | "unhide" | "uninstall" | "properties";

interface ConfirmRequest {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  /** A checkbox shown ticked; its state is passed to run. */
  checkbox?: string | undefined;
  run: (checked: boolean) => Promise<void>;
}

/** The mod list's right-click menu, at the pointer; Manage opens a submenu on hover. */
function TitleMenu(
  { x, y, t, favorite, hidden, packaged, onAction, onClose }: {
    x: number;
    y: number;
    t: Title;
    favorite: boolean;
    hidden: boolean;
    packaged: boolean;
    onAction: (action: TitleAction) => void;
    onClose: () => void;
  },
) {
  const ref = React.useRef<HTMLDivElement>(null);
  const subRef = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState({ left: x, top: y });
  // The "Manage" submenu opens beside its row; on a title near the bottom (or right) of the window it
  // ran off-screen. Once it shows, it is measured and shifted up (or flipped left) to fit.
  const [subStyle, setSubStyle] = React.useState<React.CSSProperties>({});
  React.useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({
      left: Math.max(8, Math.min(x, globalThis.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, globalThis.innerHeight - box.height - 8)),
    });
  }, [x, y]);
  function placeSubmenu() {
    setSubStyle({});
    requestAnimationFrame(() => {
      const element = subRef.current;
      if (!element) return;
      // Measured shown, whether or not :hover has applied yet.
      const display = element.style.display;
      element.style.display = "flex";
      const sub = element.getBoundingClientRect();
      element.style.display = display;
      if (sub.height === 0) return;
      const next: React.CSSProperties = {};
      const overflowBottom = sub.bottom - (globalThis.innerHeight - 8);
      if (overflowBottom > 0) next.top = `${-6 - Math.min(overflowBottom, sub.top - 8)}px`;
      if (sub.right > globalThis.innerWidth - 8) {
        next.left = "auto";
        next.right = "calc(100% + 2px)";
      }
      setSubStyle(next);
    });
  }
  React.useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "mousedown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    globalThis.addEventListener("mousedown", close);
    globalThis.addEventListener("keydown", close);
    globalThis.addEventListener("blur", close);
    globalThis.addEventListener("resize", close);
    return () => {
      globalThis.removeEventListener("mousedown", close);
      globalThis.removeEventListener("keydown", close);
      globalThis.removeEventListener("blur", close);
      globalThis.removeEventListener("resize", close);
    };
  }, [onClose]);
  const item = (action: TitleAction, label: string, disabled = false, title?: string) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={() => onAction(action)}
    >
      {label}
    </button>
  );
  return (
    <div ref={ref} className="menu" role="menu" style={place} onContextMenu={(e) => e.preventDefault()}>
      {item("favorite", favorite ? "Remove from favorites" : "Add to favorites")}
      <div className="menu-sub" onMouseEnter={placeSubmenu} onFocus={placeSubmenu}>
        <button type="button" role="menuitem" aria-haspopup="menu">
          Manage <span className="menu-arrow">›</span>
        </button>
        <div ref={subRef} className="menu submenu" role="menu" style={subStyle}>
          {item(
            "shortcut",
            "Add desktop shortcut",
            !packaged,
            packaged ? undefined : "Shortcuts start the packaged Exordium.exe",
          )}
          {item("files", "Browse local files")}
          {hidden ? item("unhide", "Show in the list again") : item("hide", "Hide from the list")}
          {item(
            "uninstall",
            "Uninstall",
            t.kind === "core",
            t.kind === "core" ? "A core is shared by the mods built on it" : undefined,
          )}
        </div>
      </div>
      <hr />
      {item("properties", "Properties")}
    </div>
  );
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [checked, setChecked] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  async function run() {
    setBusy(true);
    setProblem(null);
    try {
      await request.run(checked);
      onClose();
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="confirm" role="alertdialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.body}</p>
        {request.checkbox && (
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={checked}
              disabled={busy}
              onChange={(e) => setChecked(e.currentTarget.checked)}
            />
            {request.checkbox}
          </label>
        )}
        {problem && <p className="bad-text small">{problem}</p>}
        <div className="row-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={request.danger ? "ghost danger" : "ghost primary"}
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? "Working…" : request.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function D2SEConverter(
  { root, mods, onClose, onSaved }: {
    root: string;
    mods: Scan["importableMods"];
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
  },
) {
  const [folder, setFolder] = React.useState(mods[0]?.folder ?? "");
  const [text, setText] = React.useState("");
  const [exists, setExists] = React.useState(false);
  const [path, setPath] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [saved, setSaved] = React.useState(0);
  const shownMods = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? mods.filter((mod) => `${mod.title} ${mod.folder}`.toLowerCase().includes(needle)) : mods;
  }, [mods, filter]);
  const discardOk = React.useCallback(
    () => !dirty || confirm("Discard your unsaved changes to this exordium.mod.json?"),
    [dirty],
  );
  const close = React.useCallback(() => {
    if (!busy && discardOk()) onClose();
  }, [busy, discardOk, onClose]);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [close]);
  const manifest = React.useMemo(() => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [text]);

  React.useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    setBusy(true);
    setProblem(null);
    fetch("/api/d2se-converter/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, folder }),
    })
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) throw new Error(body.error ?? "Could not convert this mod.");
        setText(JSON.stringify(body.manifest, null, 2));
        setExists(body.exists === true);
        setPath(body.path ?? "");
        setDirty(false);
      })
      .catch((error) => !cancelled && setProblem((error as Error).message))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [folder, root]);

  function patchManifest(key: string, value: string) {
    const base = manifest ?? {};
    setText(JSON.stringify({ ...base, [key]: value }, null, 2));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/d2se-converter/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root, folder, text, overwrite: exists }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not write exordium.mod.json.");
      // The saved mod leaves the list once the library is read again: move on to the next one.
      const at = mods.findIndex((mod) => mod.folder === folder);
      const next = mods[at + 1] ?? mods[at - 1] ?? null;
      setDirty(false);
      setSaved((n) => n + 1);
      await onSaved(`Saved ${body.path ?? "exordium.mod.json"}.`);
      if (next) setFolder(next.folder);
      else onClose();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: "title" | "name" | "author" | "version" | "core") => (
    <label>
      <span>{key}</span>
      <input
        value={String(manifest?.[key] ?? "")}
        disabled={busy || !manifest}
        onChange={(event) => patchManifest(key, event.currentTarget.value)}
      />
    </label>
  );

  return (
    <div className="scrim" onClick={(event) => event.target === event.currentTarget && close()}>
      <div className="converter-modal" role="dialog" aria-modal="true" aria-label="D2SE to Exordium converter">
        <header>
          <div>
            <p className="eyebrow accent">D2SE converter</p>
            <h2>Build exordium.mod.json</h2>
          </div>
          <span className="muted small converter-progress">
            {mods.length} to review{saved > 0 ? ` · ${saved} saved` : ""}
          </span>
          <button type="button" className="window-button" aria-label="Close" disabled={busy} onClick={close}>
            ×
          </button>
        </header>
        <div className="converter-body">
          <aside className="converter-list">
            {mods.length > 8 && (
              <input
                className="converter-filter"
                value={filter}
                onChange={(event) => setFilter(event.currentTarget.value)}
                placeholder="Filter mods…"
                aria-label="Filter mods"
              />
            )}
            {shownMods.map((mod) => (
              <button
                type="button"
                key={mod.folder}
                className={mod.folder === folder ? "on" : ""}
                disabled={busy}
                onClick={() => mod.folder !== folder && discardOk() && setFolder(mod.folder)}
              >
                <strong>{mod.title}</strong>
                <span>{mod.folder}{mod.core ? ` · ${mod.core}` : ""}</span>
              </button>
            ))}
          </aside>
          <section className="converter-editor">
            <div className="converter-grid">
              {field("title")}
              {field("name")}
              {field("author")}
              {field("version")}
              {field("core")}
            </div>
            <label className="converter-description">
              <span>description</span>
              <textarea
                value={String(manifest?.description ?? "")}
                disabled={busy || !manifest}
                onChange={(event) => patchManifest("description", event.currentTarget.value)}
              />
            </label>
            <label className="converter-json">
              <span>JSON preview</span>
              <textarea
                value={text}
                disabled={busy}
                spellCheck={false}
                onChange={(event) => {
                  setText(event.currentTarget.value);
                  setDirty(true);
                }}
              />
            </label>
            <p className="muted small">
              {path || "Choose a mod to convert."}
              {exists ? " Existing file will be overwritten when you save." : ""}
              {dirty ? " Unsaved changes." : ""}
            </p>
            {problem && <p className="bad-text small">{problem}</p>}
          </section>
        </div>
        <footer>
          <button type="button" className="ghost" disabled={busy} onClick={close}>Close</button>
          <button type="button" className="ghost primary" disabled={busy || !manifest} onClick={() => void save()}>
            {busy ? "Working…" : exists ? "Save changes" : "Create file"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function artUrl(root: string | null, key: string, kind: ArtKind, version: number): string {
  return `/api/art?root=${encodeURIComponent(root ?? "")}&key=${encodeURIComponent(key)}&kind=${kind}&v=${version}`;
}

function screenshotUrl(root: string, key: string, name: string): string {
  return `/api/screenshots?root=${encodeURIComponent(root)}&key=${encodeURIComponent(key)}&name=${
    encodeURIComponent(name)
  }`;
}

function initials(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !/^(the|of|a)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || title.slice(0, 2)).toUpperCase();
}

function TitleIcon({ t, root, art, size }: { t: Title; root: string | null; art: number; size: number }) {
  if (t.art.icon) {
    return <img className="icon" src={artUrl(root, t.key, "icon", art)} alt="" width={size} height={size} />;
  }
  return (
    <span
      className={`icon initials ${t.kind}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {initials(t.title)}
    </span>
  );
}

const CAPSULE_SIZES = { small: 132, medium: 170, large: 220 } as const;
type CapsuleSize = keyof typeof CAPSULE_SIZES;

function savedCapsuleSize(): CapsuleSize {
  try {
    const saved = localStorage.getItem("exordium.gridSize");
    if (saved === "small" || saved === "medium" || saved === "large") return saved;
  } catch {
    // Storage unavailable: the default size.
  }
  return "medium";
}

/**
 * The library as Steam shows it in grid view: the whole main area, a shelf per group, a 2:3 capsule
 * per title. The portrait art when a title has one; otherwise its icon and name over its banner,
 * dimmed (a wide banner cropped to 2:3 is usually just sky). Click opens the title's page; Play is on the capsule; right-click is the title's menu.
 */
function LibraryGrid(
  { shelves, root, art, running, favorites, starting, onOpen, onPlay, onMenu }: {
    shelves: { label: string; titles: Title[] }[];
    root: string | null;
    art: number;
    running: Set<string>;
    favorites: Set<string>;
    starting: string | null;
    onOpen: (key: string) => void;
    onPlay: (t: Title) => void;
    onMenu: (x: number, y: number, t: Title) => void;
  },
) {
  const [size, setSize] = React.useState<CapsuleSize>(savedCapsuleSize);
  function changeSize(next: CapsuleSize) {
    setSize(next);
    try {
      localStorage.setItem("exordium.gridSize", next);
    } catch {
      // Not remembered; still applied.
    }
  }
  const total = shelves.reduce((n, s) => n + s.titles.length, 0);

  return (
    <div className="library-grid" style={{ "--capsule": `${CAPSULE_SIZES[size]}px` } as React.CSSProperties}>
      <div className="grid-head">
        <h1>Library</h1>
        <div className="grow" />
        <div className="segmented" role="group" aria-label="Card size">
          {(Object.keys(CAPSULE_SIZES) as CapsuleSize[]).map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={size === s}
              className={size === s ? "on" : ""}
              onClick={() => changeSize(s)}
            >
              {s[0]!.toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {total === 0 && <p className="muted">Nothing matches these filters.</p>}
      {shelves.filter((shelf) => shelf.titles.length > 0).map((shelf) => (
        <section key={shelf.label} className="shelf">
          <h2 className="eyebrow">
            {shelf.label} <span className="muted">({shelf.titles.length})</span>
          </h2>
          <div className="capsules">
            {shelf.titles.map((t) => {
              const live = running.has(t.key);
              const errors = t.problems.some((p) => p.level === "error");
              return (
                <div
                  key={t.key}
                  className={live ? "capsule live" : "capsule"}
                  role="button"
                  tabIndex={0}
                  title={t.title}
                  onClick={() => onOpen(t.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(t.key);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onMenu(event.clientX, event.clientY, t);
                  }}
                >
                  <div className="capsule-art">
                    {t.art.portrait
                      ? <img src={artUrl(root, t.key, "portrait", art)} alt="" loading="lazy" />
                      : (
                        <div className={`capsule-fallback ${t.kind}`}>
                          {t.art.banner && (
                            <img
                              className="capsule-backdrop"
                              src={artUrl(root, t.key, "banner", art)}
                              alt=""
                              loading="lazy"
                            />
                          )}
                          <TitleIcon t={t} root={root} art={art} size={Math.round(CAPSULE_SIZES[size] * 0.38)} />
                          <span>{t.title}</span>
                        </div>
                      )}
                    {favorites.has(t.key) && (
                      <span className="capsule-badge favorite" aria-label="Favorite">
                        <HeartIcon filled />
                      </span>
                    )}
                    {live && <span className="capsule-badge live">PLAYING</span>}
                    {!errors && (
                      <button
                        type="button"
                        className="capsule-play"
                        aria-label={`Play ${t.title}`}
                        disabled={starting === t.key}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPlay(t);
                        }}
                      >
                        <PlayIcon />
                      </button>
                    )}
                  </div>
                  <div className="capsule-name">{t.title}</div>
                  <div className="capsule-sub">
                    {t.kind === "core" ? `Core · ${t.core ?? ""}` : `Mod · ${t.core ?? "?"}`}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TitlePage(
  {
    t,
    root,
    art,
    tab,
    onTab,
    playedAt,
    playtime,
    running,
    favorite,
    starting,
    onPlay,
    onFavorite,
    onProperties,
    onBack,
  }: {
    t: Title;
    root: string;
    art: number;
    tab: Tab;
    onTab: (tab: Tab) => void;
    playedAt: string | null;
    playtime: Playtime | null;
    /** How many copies of this title are running; Play starts another. */
    running: number;
    favorite: boolean;
    starting: boolean;
    onPlay: () => void;
    onFavorite: () => void;
    onProperties: () => void;
    /** In grid view: back to the library grid. */
    onBack?: (() => void) | undefined;
  },
) {
  const errors = t.problems.filter((p) => p.level === "error");
  const [characters, setCharacters] = React.useState<Character[] | null>(null);
  const [screenshots, setScreenshots] = React.useState<Screenshot[] | null>(null);
  React.useEffect(() => {
    setCharacters(null);
    void (async () => {
      const response = await fetch(`/api/characters?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`);
      if (response.ok) setCharacters((await response.json()).characters);
    })();
  }, [root, t.key]);
  React.useEffect(() => {
    setScreenshots(null);
    if (tab !== "screenshots") return;
    void (async () => {
      const response = await fetch(
        `/api/screenshots?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`,
      );
      if (response.ok) setScreenshots((await response.json()).screenshots);
    })();
  }, [root, t.key, tab]);

  // The action bar sticks to the top of the page; once the header has scrolled past, it slims down and
  // names the title beside Play, as Steam's does. The marker sits just above the bar, so the bar's own
  // change of height never moves the point where it changes.
  const marker = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const node = marker.current;
    const scroller = node?.closest(".main");
    if (!node || !scroller) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry!.isIntersecting), { root: scroller });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [gallery, setGallery] = React.useState<number | null>(null);

  return (
    <>
      <section className={t.art.banner === "png" ? "hero art" : "hero"}>
        {onBack && (
          <button type="button" className="page-back" onClick={onBack}>
            ‹ Library
          </button>
        )}
        {t.art.banner === "png" && <img className="hero-art" src={artUrl(root, t.key, "banner", art)} alt="" />}
        {t.art.banner === "d2se" && (
          <div className="plate">
            <img src={artUrl(root, t.key, "banner", art)} alt={`${t.title} banner`} />
          </div>
        )}
        <div className="hero-text">
          <div className={t.author ? "eyebrow accent" : "eyebrow accent unknown"}>
            {t.author ? `BY ${t.author.toUpperCase()}` : "AUTHOR UNKNOWN"}
          </div>
          <h1>{t.title}</h1>
          <div className="hero-sub">
            {t.kind === "core" ? `D2SE CORE · VANILLA ${t.core}` : `MOD · CORE ${t.core ?? "?"}`}
            {t.version ? ` · V${t.version}` : ""}
          </div>
        </div>
      </section>

      <div ref={marker} className="actionbar-marker" />
      <div className={stuck ? "actionbar stuck" : "actionbar"}>
        <button
          type="button"
          className="play"
          disabled={starting || errors.length > 0}
          title={running > 0 ? `${running} running — start another copy` : undefined}
          onClick={onPlay}
        >
          {starting ? "STARTING…" : (
            <>
              <PlayIcon /> PLAY
              {running > 0 && <span className="play-count" aria-label={`${running} running`}>{running}</span>}
            </>
          )}
        </button>
        <div className="actionbar-title">
          <TitleIcon t={t} root={root} art={art} size={28} />
          <span>{t.title}</span>
        </div>
        <Stat label="LAST PLAYED" value={playedAt ? relative(playedAt) : "Never"} />
        <Stat label="PLAY TIME" value={playtime ? playTime(playtime.seconds) : "—"} />
        <Stat
          label="RENDERER"
          value={t.settings
            ? `${RENDERERS[t.settings.renderer] ?? t.settings.renderer}${t.settings.windowed ? " · windowed" : ""}`
            : "—"}
        />
        <Stat label="CHARACTERS" value={characters === null ? "…" : String(characters.length)} />
        {running > 0 && <Stat label="RUNNING" value={running === 1 ? "1 copy" : `${running} copies`} />}
        <div className="grow" />
        <button
          type="button"
          className={favorite ? "square favorite on" : "square favorite"}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
          onClick={onFavorite}
        >
          <HeartIcon filled={favorite} />
        </button>
        <button type="button" className="square" aria-label="Properties" onClick={onProperties}>
          <GearIcon />
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {(["overview", "documentation", "changelogs", "screenshots", "backups", "logs"] as const).map((name) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === name}
            key={name}
            className={tab === name ? "tab on" : "tab"}
            onClick={() => onTab(name)}
          >
            {name[0]!.toUpperCase() + name.slice(1)}
            {name === "screenshots" && t.screenshots > 0 ? ` · ${t.screenshots}` : ""}
            {name === "documentation" && t.docs.length > 0 ? ` · ${t.docs.length}` : ""}
            {name === "changelogs" && t.changelogs.length > 0 ? ` · ${t.changelogs.length}` : ""}
          </button>
        ))}
      </nav>

      <div className="page">
        {tab === "overview" && (
          <div className="overview">
            <div className="overview-main">
              <section className="characters">
                <div className="section-head">
                  <h2 className="eyebrow">CHARACTERS</h2>
                  <span className="muted small">
                    from {t.kind === "core" ? "the core's" : "the mod's"} own save folder
                  </span>
                </div>
                {characters === null && <p className="muted">Reading saves…</p>}
                {characters?.length === 0 && <p className="muted">No characters yet.</p>}
                <div className="char-grid">
                  {characters?.map((c) => (
                    <div className="char" key={c.name}>
                      <span className="char-name">{c.name}</span>
                      <span className="char-meta">Level {c.level} {c.className}</span>
                      <span className="char-tags">
                        {c.expansion
                          ? <span className="good-text">Expansion</span>
                          : <span className="muted">Classic</span>}
                        {c.hardcore && (
                          <span className={c.dead ? "bad-text" : "warn-text"}>
                            {c.dead ? "Hardcore · dead" : "Hardcore"}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              {t.description && (
                <section className="about-mod">
                  <h2 className="eyebrow">ABOUT THIS MOD</h2>
                  <p>{t.description}</p>
                </section>
              )}
              <ScreenshotStrip root={root} t={t} />
              <WhatsNew t={t} onOpen={() => onTab("changelogs")} />
              <ActivityFeed root={root} t={t} running={running} />
            </div>
            <aside className="side">
              <section className="card">
                <h2 className="eyebrow">DETAILS</h2>
                <dl className="kv">
                  <dt>Version</dt>
                  <dd>{t.version ?? "—"}</dd>
                  <dt>Core</dt>
                  <dd>{t.core ?? "—"}</dd>
                  <dt>Author</dt>
                  <dd>{t.author ?? "Unknown"}</dd>
                  <dt>Sessions</dt>
                  <dd>{playtime?.runs ?? 0}</dd>
                </dl>
              </section>
              <section className="card">
                <h2 className="eyebrow">LINKS</h2>
                {t.links.length === 0
                  ? <p className="muted small">None yet. Add a website or Discord in Properties.</p>
                  : (
                    <ul className="links">
                      {t.links.map((link) => (
                        <li key={link.url}>
                          <a
                            href={link.url}
                            className="link-text"
                            title={link.url}
                            onClick={(e) => {
                              e.preventDefault();
                              void openLink(link.url);
                            }}
                          >
                            {link.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
              </section>
              <section className="card">
                <h2 className="eyebrow">HOW IT LAUNCHES</h2>
                {t.settings
                  ? (
                    <dl className="kv">
                      <dt>Renderer</dt>
                      <dd>{RENDERERS[t.settings.renderer] ?? t.settings.renderer}</dd>
                      <dt>Window</dt>
                      <dd>{t.settings.windowed ? "Windowed" : "Fullscreen"}</dd>
                      <dt>Data</dt>
                      <dd>
                        {[t.settings.direct && "-direct", t.settings.txt && "-txt"].filter(Boolean).join(" ") ||
                          "MPQs only"}
                      </dd>
                      <dt>Options</dt>
                      <dd>
                        {[
                          t.settings.noSound && "-ns",
                          t.settings.skipToBNet && "-skiptobnet",
                          t.settings.startAct && `-act${t.settings.startAct}`,
                          t.settings.seed && `-seed ${t.settings.seed}`,
                        ].filter(Boolean).join(" ") || "Default"}
                      </dd>
                      <dt>Language</dt>
                      <dd>{t.settings.language ?? "MOD"}</dd>
                    </dl>
                  )
                  : <p className="muted">No D2SE_SETUP.ini.</p>}
              </section>
              <section className="card">
                <h2 className="eyebrow">PLUGINS</h2>
                {t.plugins.length === 0 ? <p className="muted">None.</p> : (
                  <div className="pills">
                    {t.plugins.map((p) => <span className="pill" key={p.path}>{p.path.replace(/\.dll$/i, "")}</span>)}
                  </div>
                )}
              </section>
              <section className="card readiness">
                {t.problems.length === 0
                  ? (
                    <p>
                      <span className="dot good" /> Ready to play. No problems found.
                    </p>
                  )
                  : (
                    <ul className="problems">
                      {t.problems.map((p, i) => <li key={i} className={p.level}>{p.message}</li>)}
                    </ul>
                  )}
              </section>
            </aside>
          </div>
        )}

        {tab === "documentation" && (
          <DocPanel
            titleKey={t.key}
            entries={t.docs}
            empty="This mod ships no documentation: no readme, and no HTML pages in its folder."
          />
        )}

        {tab === "changelogs" && (
          <DocPanel titleKey={t.key} entries={t.changelogs} empty="No changelog found in the mod's folder." />
        )}

        {tab === "screenshots" && (
          <section className="screenshots">
            <div className="section-head">
              <h2 className="eyebrow">SCREENSHOTS</h2>
              <span className="muted small">
                from {t.kind === "core" ? "the core's" : "the mod's"} Screenshots folder
              </span>
            </div>
            {screenshots === null && <p className="muted">Reading screenshots…</p>}
            {screenshots?.length === 0 && <p className="muted">No screenshots found.</p>}
            <div className="screenshot-grid">
              {screenshots?.map((shot, i) => (
                <button
                  type="button"
                  className="screenshot"
                  key={shot.name}
                  title={shot.name}
                  onClick={() => setGallery(i)}
                >
                  <img src={screenshotUrl(root, t.key, shot.name)} alt={shot.name} loading="lazy" />
                  <span>{shot.name}</span>
                </button>
              ))}
            </div>
            {gallery !== null && screenshots && (
              <Lightbox
                images={screenshots.map((shot) => ({
                  src: screenshotUrl(root, t.key, shot.name),
                  caption: shot.name,
                }))}
                start={gallery}
                onClose={() => setGallery(null)}
              />
            )}
          </section>
        )}

        {tab === "backups" && <Backups root={root} titleKey={t.key} running={running} />}
        {tab === "logs" && <Logs root={root} titleKey={t.key} />}
      </div>
    </>
  );
}

interface LogFile {
  name: string;
  size: number;
  modifiedAt: string | null;
}

/**
 * What the last runs wrote: the game's trace, plugin logs, Crashdump, the loader log. They are in the
 * title's box, not the mod folder, so a log sitting in the mod folder is whatever the mod shipped.
 */
function Logs({ root, titleKey }: { root: string; titleKey: string }) {
  const query = `root=${encodeURIComponent(root)}&key=${encodeURIComponent(titleKey)}`;
  const [list, setList] = React.useState<{ folder: string; logs: LogFile[] } | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [text, setText] = React.useState<{ body: string; truncated: boolean } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const viewer = React.useRef<HTMLPreElement>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch(`/api/logs?${query}`);
    const body = await response.json();
    setList(body);
    setSelected((current) =>
      current && body.logs.some((log: LogFile) => log.name === current) ? current : body.logs[0]?.name ?? null
    );
  }, [query]);

  React.useEffect(() => {
    setList(null);
    setSelected(null);
    void refresh();
  }, [refresh]);

  const show = React.useCallback(async (name: string) => {
    setText(null);
    const response = await fetch(`/api/logs?${query}&name=${encodeURIComponent(name)}`);
    if (!response.ok) {
      setText({ body: "", truncated: false });
      return;
    }
    setText({ body: await response.text(), truncated: response.headers.get("x-log-truncated") === "1" });
  }, [query]);

  React.useEffect(() => {
    if (selected) void show(selected);
    else setText(null);
  }, [selected, show, list]);

  // A crash is at the end of a log, so open each one scrolled to the bottom.
  React.useEffect(() => {
    if (viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight;
  }, [text]);

  async function openFolder() {
    setError(null);
    const response = await fetch(`/api/logs?${query}`, { method: "POST" });
    if (!response.ok) setError((await response.json()).error ?? "Could not open the folder.");
  }

  return (
    <section className="logs">
      <div className="section-head">
        <h2 className="eyebrow">LOGS</h2>
        <span className="muted small">what the last runs wrote, in this title's box</span>
        <div className="grow" />
        <button type="button" className="ghost" onClick={() => void refresh()}>Refresh</button>
        <button type="button" className="ghost" onClick={() => void openFolder()}>Open folder</button>
      </div>
      {error && <p className="bad-text small">{error}</p>}
      {list === null && <p className="muted">Reading logs…</p>}
      {list?.logs.length === 0 && (
        <p className="muted">No logs yet. They appear here after the title has been played.</p>
      )}
      {list && list.logs.length > 0 && (
        <div className="logs-body">
          <ul className="log-list">
            {list.logs.map((log) => (
              <li key={log.name}>
                <button
                  type="button"
                  className={log.name === selected ? "log-item on" : "log-item"}
                  onClick={() => setSelected(log.name)}
                >
                  <span className="log-name">{log.name}</span>
                  <span className="muted small">
                    {formatSize(log.size)}
                    {log.modifiedAt ? ` · ${new Date(log.modifiedAt).toLocaleString()}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="log-view">
            {text?.truncated && <p className="muted small">Showing the last 512 KB.</p>}
            <pre ref={viewer} className="log-text">{text === null ? "Reading…" : text.body || "(empty)"}</pre>
          </div>
        </div>
      )}
    </section>
  );
}

interface BackupCharacter {
  name: string;
  className: string;
  level: number;
  hardcore: boolean;
  dead: boolean;
}

interface BackupEntry {
  id: string;
  createdAt: string;
  reason: "closed" | "manual" | "before-restore" | "before-rebuild";
  files: number;
  bytes: number;
  characters: BackupCharacter[];
}

interface BackupSettings {
  auto: boolean;
  keep: number;
  folder: string;
  custom: boolean;
}

const BACKUP_REASONS: Record<BackupEntry["reason"], string> = {
  closed: "Automatic",
  manual: "Manual",
  "before-restore": "Before restore",
  "before-rebuild": "Before rebuild",
};

/**
 * Copies of the title's save folder (backups.ts): taken when the last copy closes, by hand, and
 * before every restore. Restoring writes a backup's files back and deletes nothing.
 */
function Backups({ root, titleKey, running }: { root: string; titleKey: string; running: number }) {
  const [list, setList] = React.useState<{ folder: string; settings: BackupSettings; backups: BackupEntry[] } | null>(
    null,
  );
  const [confirming, setConfirming] = React.useState<{ id: string; action: "restore" | "delete" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; bad: boolean } | null>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch(`/api/backups?root=${encodeURIComponent(root)}&key=${encodeURIComponent(titleKey)}`);
    const body = await response.json();
    if (!response.ok) {
      setMessage({ text: body.error ?? "Could not read the backups.", bad: true });
      return;
    }
    setList(body);
  }, [root, titleKey]);

  React.useEffect(() => {
    setList(null);
    setMessage(null);
    setConfirming(null);
    void refresh();
  }, [refresh]);

  // A backup is taken as the last copy closes, before the page hears the game has ended.
  React.useEffect(() => {
    if (running === 0) void refresh();
  }, [running, refresh]);

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root, key: titleKey, ...body }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ text: result.error ?? "That did not work.", bad: true });
        return null;
      }
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const result = await post({ action: "create" });
    if (result) setMessage({ text: "Backed up.", bad: false });
    await refresh();
  }

  async function confirm() {
    if (!confirming) return;
    const { id, action } = confirming;
    setConfirming(null);
    const result = await post({ action, id });
    if (result && action === "restore") {
      const restored = Number(result.restored);
      setMessage({
        text: restored === 0
          ? "The save folder already matches this backup; nothing was changed."
          : `Restored ${restored} ${restored === 1 ? "file" : "files"}.` +
            (result.before ? " What was there before is in the newest backup, marked Before restore." : ""),
        bad: false,
      });
    }
    await refresh();
  }

  const settings = list?.settings;
  const closeFirst = running > 0;

  return (
    <section className="backups">
      <div className="section-head">
        <h2 className="eyebrow">BACKUPS</h2>
        <span className="muted small">copies of this title's save folder</span>
        <div className="grow" />
        <button
          type="button"
          className="ghost"
          disabled={busy || closeFirst}
          title={closeFirst ? "Close the game first" : undefined}
          onClick={() => void create()}
        >
          Back up now
        </button>
        <button type="button" className="ghost" onClick={() => void post({ action: "open" })}>Open folder</button>
      </div>
      {message && <p className={message.bad ? "bad-text small" : "muted small"}>{message.text}</p>}
      {closeFirst && <p className="muted small">The game is running. Backing up and restoring wait until it closes.</p>}
      {list === null && <p className="muted">Reading backups…</p>}
      {list?.backups.length === 0 && (
        <p className="muted">
          No backups yet. {settings?.auto ? "One is taken each time the game closes with characters saved." : ""}
        </p>
      )}

      {list && list.backups.length > 0 && (
        <ul className="backup-list">
          {list.backups.map((backup) => (
            <li key={backup.id} className="backup-row">
              <div className="backup-when">
                <strong>{new Date(backup.createdAt).toLocaleString()}</strong>
                <span className="muted small">
                  {relative(backup.createdAt)} · {formatSize(backup.bytes)} · {backup.files}{" "}
                  {backup.files === 1 ? "file" : "files"}
                </span>
              </div>
              <span className={`pill backup-reason ${backup.reason}`}>{BACKUP_REASONS[backup.reason]}</span>
              <div className="backup-characters">
                {backup.characters.length === 0
                  ? <span className="muted small">No characters</span>
                  : backup.characters.map((c) => (
                    <span key={c.name} className="small">
                      {c.name}{" "}
                      <span className="muted">
                        · {c.level} {c.className}
                        {c.hardcore ? " · HC" : ""}
                        {c.dead ? " · dead" : ""}
                      </span>
                    </span>
                  ))}
              </div>
              <div className="backup-actions">
                {confirming?.id === backup.id
                  ? (
                    <>
                      <button
                        type="button"
                        className={confirming.action === "delete" ? "ghost danger" : "ghost primary"}
                        disabled={busy}
                        onClick={() => void confirm()}
                      >
                        {confirming.action === "delete" ? "Delete it" : "Restore it"}
                      </button>
                      <button type="button" className="ghost" onClick={() => setConfirming(null)}>Cancel</button>
                    </>
                  )
                  : (
                    <>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy || closeFirst}
                        title={closeFirst
                          ? "Close the game first"
                          : "Writes these files back; characters made since stay"}
                        onClick={() => setConfirming({ id: backup.id, action: "restore" })}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => setConfirming({ id: backup.id, action: "delete" })}
                      >
                        Delete
                      </button>
                    </>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small backup-note">
        Automatic backups, how many are kept, and where they go are set in Settings → Backups, for every title.
      </p>
    </section>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function openLink(url: string) {
  await fetch("/api/open-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => {});
}

async function openAppFolder(path: string) {
  await fetch("/api/app-settings/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => {});
}

function docUrl(key: string, path: string): string {
  return `/api/docs/${encodeURIComponent(key)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Old mod text is often Windows-1252, not UTF-8: try UTF-8 strictly, then fall back. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Readable text from RTF: control words and groups dropped, paragraphs kept. Enough for changelogs. */
function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\(par|line)\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Documentation or changelogs from the mod's folder: a list, and the selected one beside it. HTML is
 * shown in a sandboxed frame, with no scripts (the server's CSP says the same); text as text.
 */
function shotSeed(key: string): number {
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomShots(shots: Screenshot[], key: string): Screenshot[] {
  const picked = [...shots];
  let seed = shotSeed(`${key}:${shots.length}`);
  for (let i = picked.length - 1; i > 0; i--) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const j = seed % (i + 1);
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  return picked.slice(0, 8);
}

/** The overview's screenshots: only a compact random strip, each opening the gallery. */
function ScreenshotStrip({ root, t }: { root: string; t: Title }) {
  const [shots, setShots] = React.useState<Screenshot[] | null>(null);
  const [open, setOpen] = React.useState<number | null>(null);
  React.useEffect(() => {
    setShots(null);
    setOpen(null);
    void (async () => {
      const response = await fetch(
        `/api/screenshots?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`,
      );
      if (!response.ok) return setShots([]);
      const list = (await response.json()).screenshots as Screenshot[];
      setShots(randomShots(list, t.key));
    })();
  }, [root, t.key]);
  if (!shots || shots.length === 0) return null;
  return (
    <section className="showcase-strip-section">
      <div className="section-head">
        <h2 className="eyebrow">SCREENSHOTS</h2>
        <span className="muted small">random picks from {t.screenshots} found</span>
      </div>
      <div className="overview-shot-strip">
        {shots.map((shot, i) => (
          <button type="button" key={shot.name} title={shot.name} onClick={() => setOpen(i)}>
            <img src={screenshotUrl(root, t.key, shot.name)} alt={shot.name} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && (
        <Lightbox
          images={shots.map((shot) => ({ src: screenshotUrl(root, t.key, shot.name), caption: shot.name }))}
          start={open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function changelogDateScore(entry: DocEntry): number {
  const text = `${entry.path} ${entry.label}`;
  const ymd = /(?:^|[^\d])((?:19|20)\d{2})[-_. ]([01]?\d)[-_. ]([0-3]?\d)(?:[^\d]|$)/.exec(text);
  if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const mdy = /(?:^|[^\d])([01]?\d)[-_. ]([0-3]?\d)[-_. ]((?:19|20)\d{2})(?:[^\d]|$)/.exec(text);
  if (mdy) return Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
  return 0;
}

function newestChangelog(entries: DocEntry[]): DocEntry | null {
  return [...entries].sort((a, b) => changelogDateScore(b) - changelogDateScore(a))[0] ?? null;
}

function excerptOf(text: string, max: number): string {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** The newest changelog we can infer from filenames, as a short excerpt. */
function WhatsNew({ t, onOpen }: { t: Title; onOpen: () => void }) {
  const entry = React.useMemo(() => newestChangelog(t.changelogs), [t.changelogs]);
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => {
    setText(null);
    if (!entry || entry.kind === "html") return;
    void (async () => {
      const response = await fetch(docUrl(t.key, entry.path));
      if (!response.ok) return;
      const raw = decodeText(await response.arrayBuffer());
      setText(entry.kind === "rtf" ? rtfToText(raw) : raw);
    })();
  }, [t.key, entry]);
  if (!entry) return null;
  return (
    <section className="news-card">
      <div className="section-head">
        <h2 className="eyebrow">WHAT'S NEW</h2>
        <span className="muted small">{entry.label}</span>
      </div>
      {entry.kind === "html"
        ? <p className="muted">This changelog is a web page.</p>
        : <pre className="news-excerpt">{text === null ? "Reading…" : excerptOf(text, 700)}</pre>}
      <button type="button" className="link-button" onClick={onOpen}>Read the full changelog ›</button>
    </section>
  );
}

interface FeedItem {
  at: string;
  text: string;
  detail: string;
  bad: boolean;
}

/** Recent activity: the title's runs (the play ledger) and backups, newest first. */
function ActivityFeed({ root, t, running }: { root: string; t: Title; running: number }) {
  const [items, setItems] = React.useState<FeedItem[] | null>(null);
  React.useEffect(() => {
    // Re-read when a run ends (running drops), so the new session shows up.
    if (running > 0) return;
    void (async () => {
      const [runsResponse, backupsResponse] = await Promise.all([
        fetch(`/api/activity?key=${encodeURIComponent(t.key)}`),
        fetch(`/api/backups?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`),
      ]);
      const runs = runsResponse.ok
        ? (await runsResponse.json()).runs as { startedAt: string; seconds: number; state: string }[]
        : [];
      const backups = backupsResponse.ok ? (await backupsResponse.json()).backups as BackupEntry[] : [];
      const feed: FeedItem[] = [
        ...runs.map((run) => ({
          at: run.startedAt,
          text: run.state === "crashed" ? "Played — the game crashed" : "Played",
          detail: playTime(run.seconds),
          bad: run.state === "crashed",
        })),
        ...backups.map((backup) => ({
          at: backup.createdAt,
          text: backup.reason === "manual"
            ? "Backed up by hand"
            : backup.reason === "before-restore"
            ? "Backed up before a restore"
            : backup.reason === "before-rebuild"
            ? "Backed up before a box rebuild"
            : "Characters backed up",
          detail: backup.characters.map((c) => c.name).join(", ") || `${backup.files} files`,
          bad: false,
        })),
      ];
      setItems(feed.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8));
    })();
  }, [root, t.key, running]);
  if (!items || items.length === 0) return null;
  return (
    <section className="activity">
      <h2 className="eyebrow">RECENT ACTIVITY</h2>
      <ol className="activity-list">
        {items.map((item, i) => (
          <li key={`${item.at}-${i}`} className={item.bad ? "bad" : ""}>
            <span className="activity-dot" />
            <span className="activity-text">{item.text}</span>
            <span className="muted small">{item.detail}</span>
            <time className="muted small" dateTime={item.at} title={new Date(item.at).toLocaleString()}>
              {relative(item.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DocPanel({ titleKey, entries, empty }: { titleKey: string; entries: DocEntry[]; empty: string }) {
  const [selected, setSelected] = React.useState<string | null>(entries[0]?.path ?? null);
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => setSelected(entries[0]?.path ?? null), [titleKey, entries]);
  const entry = entries.find((e) => e.path === selected) ?? null;

  React.useEffect(() => {
    setText(null);
    if (!entry || entry.kind === "html") return;
    void (async () => {
      const response = await fetch(docUrl(titleKey, entry.path));
      if (!response.ok) return setText("Could not read this file.");
      const raw = decodeText(await response.arrayBuffer());
      setText(entry.kind === "rtf" ? rtfToText(raw) : raw);
    })();
  }, [titleKey, entry]);

  if (entries.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="docs">
      {entries.length > 1 && (
        <ul className="doc-list">
          {entries.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                className={e.path === selected ? "log-item on" : "log-item"}
                onClick={() => setSelected(e.path)}
              >
                <span className="log-name">{e.label}</span>
                <span className="muted small">{e.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="doc-view">
        {entry?.kind === "html"
          ? <iframe className="doc-frame" sandbox="" src={docUrl(titleKey, entry.path)} title={entry.label} />
          : <pre className="log-text doc-text">{text ?? "Reading…"}</pre>}
      </div>
    </div>
  );
}

/** "Synthesis is running", or "Synthesis ×2 are running" for copies, joined per title. */
function runningSummary(runs: Running[]): string {
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.title, (counts.get(run.title) ?? 0) + 1);
  return [...counts].map(([title, n]) => n === 1 ? `${title} is running` : `${title} ×${n} are running`).join(" · ");
}

/** "42 min", "3.4 h", as Steam counts play time. */
function playTime(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${hours < 100 ? hours.toFixed(1) : Math.round(hours)} h`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Properties(
  { t, root, page, art, onPage, onClose, onArtChanged }: {
    t: Title;
    root: string;
    page: DialogPage;
    art: number;
    onPage: (page: DialogPage) => void;
    onClose: () => void;
    onArtChanged: () => Promise<void>;
  },
) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={`${t.title} properties`}>
        <div className="dialog-head">
          <h1>{t.title}</h1>
          <span className="muted">Properties</span>
          <div className="grow" />
          <button type="button" className="square" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="dialog-body">
          <nav className="dialog-nav">
            <button type="button" className={page === "about" ? "on" : ""} onClick={() => onPage("about")}>
              About
            </button>
            <button type="button" className={page === "general" ? "on" : ""} onClick={() => onPage("general")}>
              General
            </button>
            <button type="button" className={page === "updates" ? "on" : ""} onClick={() => onPage("updates")}>
              Updates
            </button>
            <button type="button" className={page === "files" ? "on" : ""} onClick={() => onPage("files")}>
              Installed Files
            </button>
            <button type="button" className={page === "artwork" ? "on" : ""} onClick={() => onPage("artwork")}>
              Customization
            </button>
          </nav>
          <div className="dialog-page">
            {page === "general" && <GeneralPage t={t} root={root} onChanged={onArtChanged} />}
            {page === "about" && <AboutPage t={t} root={root} onChanged={onArtChanged} />}
            {page === "updates" && <UpdatesPage t={t} root={root} onChanged={onArtChanged} />}
            {page === "files" && <FilesPage t={t} root={root} />}
            {page === "artwork" && <ArtworkPage t={t} root={root} art={art} onChanged={onArtChanged} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Who made the title and where to find it: shown on its page, never used to launch. Saved with the
 * title's other options, so the whole set is sent back.
 */
function AboutPage({ t, root, onChanged }: { t: Title; root: string; onChanged: () => Promise<void> }) {
  const [name, setName] = React.useState(t.options.title ?? "");
  const [author, setAuthor] = React.useState(t.options.author ?? "");
  const [links, setLinks] = React.useState(t.options.links ?? []);
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  React.useEffect(() => {
    setName(t.options.title ?? "");
    setAuthor(t.options.author ?? "");
    setLinks(t.options.links ?? []);
    setProblem(null);
  }, [t.key, t.options]);
  const changed = name !== (t.options.title ?? "") ||
    author !== (t.options.author ?? "") ||
    JSON.stringify(links) !== JSON.stringify(t.options.links ?? []);
  const own = t.links.filter((link) => !(t.options.links ?? []).some((mine) => mine.url === link.url));

  async function apply() {
    setSaving(true);
    setProblem(null);
    try {
      const response = await fetch("/api/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root,
          ...(t.kind === "core" ? { core: t.folder } : { folder: t.folder }),
          options: { ...t.options, title: name.trim() || null, author, links: links.filter((link) => link.url.trim()) },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save.");
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-with-footer">
      <div className="stack">
        <section className="option-section">
          <h2 className="eyebrow">NAME</h2>
          <p className="muted small">
            What the library shows for this mod. Leave blank to use the mod's own name
            {t.kind === "mod" ? ` (${t.folder})` : ""}.
          </p>
          <input
            type="text"
            value={name}
            disabled={saving}
            placeholder={t.title}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </section>
        <section className="option-section">
          <h2 className="eyebrow">AUTHOR</h2>
          <input
            type="text"
            value={author}
            disabled={saving}
            placeholder="Who made this mod"
            onChange={(e) => setAuthor(e.currentTarget.value)}
          />
        </section>
        <section className="option-section">
          <h2 className="eyebrow">LINKS</h2>
          {own.length > 0 && (
            <p className="muted small">
              From the mod itself: {own.map((link) => link.label).join(", ")}. Those always show; add your own below.
            </p>
          )}
          {links.map((link, i) => (
            <div className="link-row" key={i}>
              <input
                type="text"
                value={link.label}
                placeholder="Label (Discord, Website…)"
                disabled={saving}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, label: e.currentTarget.value } : l)))}
              />
              <input
                type="text"
                value={link.url}
                placeholder="https://…"
                disabled={saving}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, url: e.currentTarget.value } : l)))}
              />
              <button
                type="button"
                className="ghost"
                disabled={saving}
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ghost add-link"
            disabled={saving}
            onClick={() => setLinks([...links, { label: "", url: "" }])}
          >
            Add link
          </button>
        </section>
        <section className="option-section">
          <h2 className="eyebrow">REALMS</h2>
          {t.realm
            ? (
              <dl className="realm-grid">
                {t.realm.gatewayName && (
                  <>
                    <dt>Name</dt>
                    <dd>{t.realm.gatewayName}</dd>
                  </>
                )}
                {t.realm.gateway && (
                  <>
                    <dt>Gateway</dt>
                    <dd>{t.realm.gateway}{t.realm.port ? `:${t.realm.port}` : ""}</dd>
                  </>
                )}
                {t.realm.selected && (
                  <>
                    <dt>Selected</dt>
                    <dd>{t.realm.selected}</dd>
                  </>
                )}
                {t.realm.timezone && (
                  <>
                    <dt>Timezone</dt>
                    <dd>{t.realm.timezone}</dd>
                  </>
                )}
              </dl>
            )
            : <p className="muted small">This mod sets no private realm; it uses Battle.net's own gateway list.</p>}
        </section>
      </div>
      <footer className="dialog-footer">
        <span className={problem ? "error" : "muted small"}>{problem ?? (changed ? "Unsaved changes" : "Saved")}</span>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            disabled={!changed || saving}
            onClick={() => {
              setName(t.options.title ?? "");
              setAuthor(t.options.author ?? "");
              setLinks(t.options.links ?? []);
            }}
          >
            Reset
          </button>
          <button type="button" className="ghost primary" disabled={!changed || saving} onClick={() => void apply()}>
            Apply
          </button>
        </div>
      </footer>
    </div>
  );
}

function GeneralPage({ t, root, onChanged }: { t: Title; root: string; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = React.useState<TitleOptions>(t.options);
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const s = { ...(t.settings ?? {}), ...draft } as NonNullable<Title["settings"]> & TitleOptions;
  const changed = JSON.stringify(draft) !== JSON.stringify(t.options);

  React.useEffect(() => {
    setDraft(t.options);
    setProblem(null);
  }, [t.key, t.options]);

  function update(next: TitleOptions) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function apply() {
    setSaving(true);
    setProblem(null);
    try {
      const response = await fetch("/api/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root,
          ...(t.kind === "core" ? { core: t.folder } : { folder: t.folder }),
          options: draft,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save options.");
      setDraft(body.options ?? draft);
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-with-footer">
      <div className="stack">
        {!t.settings && <p className="muted">This title has no D2SE_SETUP.ini to launch from.</p>}
        {t.settings && (
          <>
            <section className="option-section">
              <div className="section-head">
                <h2 className="eyebrow">LANGUAGE</h2>
                <span className="muted small">{t.languages.length ? `${t.languages.length} available` : "MOD"}</span>
              </div>
              <select
                value={s.language ?? "MOD"}
                disabled={saving}
                onChange={(e) => update({ language: e.currentTarget.value })}
              >
                <option value="MOD">MOD</option>
                {t.languages.map((language) => <option key={language} value={language}>{language}</option>)}
              </select>
            </section>
            <fieldset disabled={saving} className="option-section">
              <legend className="eyebrow">RENDER MODE</legend>
              <div className="radio-grid">
                {Object.entries(RENDERERS).map(([id, label]) => (
                  <label key={id} className={s.renderer === id ? "radio on" : "radio"}>
                    <input
                      type="radio"
                      name="renderer"
                      checked={s.renderer === id}
                      onChange={() =>
                        update({ renderer: id })}
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={saving} className="checks option-section">
              <legend className="eyebrow">LAUNCH OPTIONS</legend>
              <label>
                <input
                  type="checkbox"
                  checked={s.windowed}
                  onChange={(e) => update({ windowed: e.currentTarget.checked })}
                />{" "}
                Windowed
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.noSound}
                  onChange={(e) => update({ noSound: e.currentTarget.checked })}
                />{" "}
                No sound
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.hardcore}
                  onChange={(e) => update({ hardcore: e.currentTarget.checked })}
                />{" "}
                Allow hardcore characters
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.skipToBNet ?? false}
                  onChange={(e) => update({ skipToBNet: e.currentTarget.checked })}
                />{" "}
                Skip to Battle.net
              </label>
              <label>
                <input type="checkbox" checked={s.plugY} onChange={(e) => update({ plugY: e.currentTarget.checked })} />
                {" "}
                PlugY
              </label>
              <label>
                Seed{" "}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={s.seed ?? ""}
                  placeholder="None"
                  onChange={(e) => update({ seed: e.currentTarget.value.replace(/\D/g, "") || null })}
                />
              </label>
              <label>
                Start act{" "}
                <select
                  value={s.startAct ?? ""}
                  onChange={(e) =>
                    update({
                      startAct: e.currentTarget.value ? Number(e.currentTarget.value) as 1 | 2 | 3 | 4 | 5 : null,
                    })}
                >
                  <option value="">Normal</option>
                  <option value="1">Act I</option>
                  <option value="2">Act II</option>
                  <option value="3">Act III</option>
                  <option value="4">Act IV</option>
                  <option value="5">Act V</option>
                </select>
              </label>
            </fieldset>
            <fieldset disabled={saving} className="checks option-section">
              <legend className="eyebrow">MODDING</legend>
              <label>
                <input
                  type="checkbox"
                  checked={s.direct}
                  onChange={(e) => update({ direct: e.currentTarget.checked })}
                />{" "}
                Read loose data files (-direct)
              </label>
              <label>
                <input type="checkbox" checked={s.txt} onChange={(e) => update({ txt: e.currentTarget.checked })} />
                {" "}
                Compile .txt tables (-txt)
              </label>
            </fieldset>
          </>
        )}
      </div>
      <footer className="dialog-footer">
        <span className={problem ? "error" : "muted small"}>{problem ?? (changed ? "Unsaved changes" : "Saved")}</span>
        <div className="row-actions">
          <button type="button" className="ghost" disabled={!changed || saving} onClick={() => setDraft(t.options)}>
            Reset
          </button>
          <button type="button" className="ghost primary" disabled={!changed || saving} onClick={() => void apply()}>
            {saving ? "Applying…" : "Apply"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function UpdatesPage({ t, root, onChanged }: { t: Title; root: string; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = React.useState<TitleUpdateSettings>(t.updateSettings);
  const [check, setCheck] = React.useState<TitleUpdateCheck | null>(t.updateCheck);
  const [busy, setBusy] = React.useState<"save" | "check" | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(t.updateSettings);

  React.useEffect(() => {
    setDraft(t.updateSettings);
    setCheck(t.updateCheck);
    setProblem(null);
  }, [t.key, t.updateSettings, t.updateCheck]);

  function update(next: Partial<TitleUpdateSettings>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function post(action: "save" | "check") {
    setBusy(action);
    setProblem(null);
    try {
      const response = await fetch("/api/title-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root,
          ...(t.kind === "core" ? { core: t.folder } : { folder: t.folder }),
          action,
          version: t.version,
          settings: draft,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update settings.");
      setDraft(body.settings ?? draft);
      setCheck(body.check ?? check);
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const checkedAt = check?.checkedAt ? new Date(check.checkedAt).toLocaleString() : null;

  return (
    <div className="page-with-footer">
      <div className="stack">
        <fieldset disabled={busy !== null} className="checks option-section">
          <legend className="eyebrow">AUTOMATIC UPDATES</legend>
          <label>
            <input
              type="checkbox"
              checked={draft.automatic}
              onChange={(e) => update({ automatic: e.currentTarget.checked })}
            />{" "}
            Automatic updates
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.background}
              onChange={(e) => update({ background: e.currentTarget.checked })}
            />{" "}
            Allow background downloads
          </label>
        </fieldset>
        <section className="option-section">
          <div className="section-head">
            <h2 className="eyebrow">ENDPOINT</h2>
            <span className="muted small">{t.update ? "D2SE metadata found" : "Exordium manifest"}</span>
          </div>
          <label className="field compact-field">
            Manifest URL or file
            <input
              type="text"
              value={draft.endpoint ?? ""}
              disabled={busy !== null}
              placeholder="updates.json, https://example.com/mod.json"
              onChange={(e) => update({ endpoint: e.currentTarget.value || null })}
            />
          </label>
          <label className="field compact-field">
            Channel
            <select
              value={draft.channel}
              disabled={busy !== null}
              onChange={(e) => update({ channel: e.currentTarget.value as TitleUpdateSettings["channel"] })}
            >
              <option value="stable">Stable</option>
              <option value="testing">Testing</option>
              <option value="local">Local files only</option>
            </select>
          </label>
          <dl className="kv wide">
            <dt>D2SE file</dt>
            <dd>{t.update?.file || "—"}</dd>
            <dt>D2SE mirrors</dt>
            <dd>{t.update?.mirrors.length ? t.update.mirrors.join(", ") : "—"}</dd>
          </dl>
        </section>
        <section className="option-section">
          <div className="section-head">
            <h2 className="eyebrow">LATEST CHECK</h2>
            <span className={check?.available ? "warn-text small" : check?.error ? "bad-text small" : "muted small"}>
              {check ? checkedAt : "Never checked"}
            </span>
          </div>
          <dl className="kv wide">
            <dt>Status</dt>
            <dd>
              {check?.error
                ? check.error
                : check?.available
                ? `Update available: ${check.latestVersion}`
                : check
                ? "No update found"
                : "—"}
            </dd>
            <dt>Installed</dt>
            <dd>{check?.currentVersion || t.version || "—"}</dd>
            <dt>Latest</dt>
            <dd>{check?.latestVersion || "—"}</dd>
            <dt>Downloads</dt>
            <dd>{check ? String(check.downloadCount) : "—"}</dd>
          </dl>
          {check?.notes && <p className="muted small">{check.notes}</p>}
          {check?.page && (
            <button type="button" className="ghost fit" onClick={() => void openLink(check.page!)}>
              Open release page
            </button>
          )}
        </section>
      </div>
      <footer className="dialog-footer">
        <span className={problem ? "error" : "muted small"}>{problem ?? (changed ? "Unsaved changes" : "Saved")}</span>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            disabled={busy !== null || (!changed && !draft.endpoint)}
            onClick={() => void post("check")}
          >
            {busy === "check" ? "Checking…" : "Check now"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!changed || busy !== null}
            onClick={() => setDraft(t.updateSettings)}
          >
            Reset
          </button>
          <button
            type="button"
            className="ghost primary"
            disabled={!changed || busy !== null}
            onClick={() => void post("save")}
          >
            {busy === "save" ? "Applying…" : "Apply"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function installLocation(root: string, t: Title): string {
  return t.kind === "core" ? `${root}\\D2SE\\CORES\\${t.folder}` : `${root}\\MODS\\${t.folder}`;
}

function FilesPage({ t, root }: { t: Title; root: string }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);

  async function openFolder() {
    const response = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, key: t.key }),
    });
    if (!response.ok) setResult((await response.json()).error ?? "Could not open the folder.");
  }

  async function build(action: "rebuild" | "verify") {
    const settings = action === "rebuild"
      ? await fetch("/api/app-settings").then((r) => r.json()).then((body) => body.settings as AppPreferences)
        .catch(() => null)
      : null;
    if (
      action === "rebuild" && settings?.boxes.confirmRebuild !== false &&
      !confirm(`Rebuild ${t.title}'s box? Its links and copied files are brought up to date; saves are not touched.`)
    ) return;
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch("/api/build-box", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(t.kind === "core" ? { root, core: t.folder, action } : { root, folder: t.folder, action }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? (action === "verify" ? "Could not verify the box." : "Could not build the box."));
      }
      if (action === "verify") {
        const issues = body.issues ?? [];
        setResult(
          body.ok
            ? `Integrity OK: ${body.checkedFiles} files checked (${body.checkedHashes} hashes) in ${body.folder}`
            : `Integrity found ${issues.length} issue${issues.length === 1 ? "" : "s"}: ${
              issues.slice(0, 4).map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`)
                .join("; ")
            }${issues.length > 4 ? "; ..." : ""}`,
        );
      } else {
        setResult(`${body.files} files ready in ${body.folder}`);
      }
    } catch (error) {
      setResult((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <section className="option-section">
        <h2 className="eyebrow">INSTALLATION LOCATION</h2>
        <div className="path-row">
          <code className="path-box">{installLocation(root, t)}</code>
          <button type="button" className="ghost" onClick={() => void openFolder()}>
            <FolderIcon /> Open folder
          </button>
        </div>
      </section>
      <section className="option-section">
        <h2 className="eyebrow">ARCHIVES</h2>
        <p className="muted small">{t.files} files of its own · archives load in this order, highest priority last.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Kind</th>
              <th>Archive</th>
            </tr>
          </thead>
          <tbody>
            {t.archives.map((a) => (
              <tr key={`${a.priority}-${a.path}`}>
                <td>{a.priority}</td>
                <td>{a.kind}</td>
                <td>{a.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="option-section">
        <h2 className="eyebrow">ACTIONS</h2>
        <div className="row-actions">
          <button type="button" className="ghost" disabled>
            Create Backup
          </button>
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => void build("rebuild")}>
            {busy === "rebuild" ? "Rebuilding…" : "Rebuild Box"}
          </button>
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => void build("verify")}>
            {busy === "verify" ? "Verifying…" : "Verify Integrity"}
          </button>
        </div>
        {result && <p className="muted small">{result}</p>}
      </section>
    </div>
  );
}

const ART_SLOTS: { kind: ArtKind; label: string; hint: string }[] = [
  { kind: "banner", label: "BANNER", hint: "The title's page header. PNG, 1920×500 or larger." },
  { kind: "icon", label: "ICON", hint: "The library list and Game.exe in the taskbar. PNG, 256×256." },
  { kind: "portrait", label: "PORTRAIT", hint: "For the grid view, later. PNG, 600×900." },
];

function ArtworkPage(
  { t, root, art, onChanged }: { t: Title; root: string; art: number; onChanged: () => Promise<void> },
) {
  const [busy, setBusy] = React.useState<ArtKind | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  async function upload(kind: ArtKind, file: File) {
    setBusy(kind);
    setProblem(null);
    try {
      const response = await fetch(`/api/art?key=${encodeURIComponent(t.key)}&kind=${kind}`, {
        method: "POST",
        body: await file.arrayBuffer(),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not save that image.");
      await onChanged();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reset(kind: ArtKind) {
    setBusy(kind);
    await fetch(`/api/art?key=${encodeURIComponent(t.key)}&kind=${kind}`, { method: "DELETE" });
    await onChanged();
    setBusy(null);
  }

  const has = (kind: ArtKind) => kind === "banner" ? t.art.banner === "png" : t.art[kind];
  return (
    <div className="stack">
      {problem && <div className="banner-error" role="alert">{problem}</div>}
      {ART_SLOTS.map(({ kind, label, hint }) => (
        <section key={kind} className="art-slot">
          <div className="section-head">
            <h2 className="eyebrow">{label}</h2>
            <span className="muted small">{hint}</span>
          </div>
          <div className={`art-preview ${kind}`}>
            {has(kind) || (kind === "banner" && t.art.banner === "d2se")
              ? <img src={artUrl(root, t.key, kind, art)} alt="" />
              : kind === "icon"
              ? <TitleIcon t={t} root={root} art={art} size={72} />
              : <span className="muted small">None</span>}
          </div>
          <p className="muted small">
            {kind === "banner" && t.art.banner === "d2se" &&
              "Showing the D2SE banner from the mod's folder until one is set here."}
            {kind === "icon" && !t.art.icon && "No icon: the list shows the title's initials."}
          </p>
          <div className="row-actions">
            <label className={busy === kind ? "ghost disabled" : "ghost"}>
              {busy === kind ? "Saving…" : "Choose PNG…"}
              <input
                type="file"
                accept="image/png"
                hidden
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void upload(kind, file);
                }}
              />
            </label>
            {has(kind) && (
              <button
                type="button"
                className="ghost"
                disabled={busy !== null}
                onClick={() => void reset(kind)}
              >
                Remove
              </button>
            )}
          </div>
        </section>
      ))}
      <p className="muted small">
        Artwork is kept in Exordium's library; the mod's folder is never changed. The icon reaches Game.exe the next
        time the title starts.
      </p>
    </div>
  );
}

function relative(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString();
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4l13 8-13 8z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 7h6l2 2h10v10H3z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 4.5 7 4.5c2.1 0 3.7 1.2 5 3 1.3-1.8 2.9-3 5-3 3.6 0 5.5 3.7 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function WindowControls({ maximized, onToggleMaximize }: { maximized: boolean; onToggleMaximize: () => void }) {
  const post = (path: string) => void fetch(path, { method: "POST" }).catch(() => {});
  return (
    <div className="window-controls">
      <button type="button" className="window-control" title="Minimize" onClick={() => post("/api/window/minimize")}>
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control"
        title={maximized ? "Restore" : "Maximize"}
        onClick={onToggleMaximize}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /> : <path d="M.5.5h9v9h-9z" />}
        </svg>
      </button>
      <button
        type="button"
        className="window-control close"
        title="Close"
        onClick={() => post("/api/window/close")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}

/** The window has no OS border to grab, so thin bands along the edges start the resize instead. */
function ResizeHandles() {
  const start = (edge: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    document.body.classList.add("resizing-window");
    const stop = () => {
      document.body.classList.remove("resizing-window");
      globalThis.removeEventListener("pointerup", stop);
      globalThis.removeEventListener("mouseup", stop);
      globalThis.removeEventListener("blur", stop);
    };
    globalThis.addEventListener("pointerup", stop);
    globalThis.addEventListener("mouseup", stop);
    globalThis.addEventListener("blur", stop);
    void fetch(`/api/window/resize?edge=${edge}`, { method: "POST" }).catch(stop);
  };
  return (
    <div className="resize-handles">
      {["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((edge) => (
        <div key={edge} className={`resize resize-${edge}`} onPointerDown={start(edge)} />
      ))}
    </div>
  );
}
