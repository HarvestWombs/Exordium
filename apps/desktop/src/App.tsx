import * as React from "react";
import type { ReactNode } from "react";

/** Used until Exordium remembers an install of its own (the first scan saves it). */
const DEFAULT_ROOT = "I:\\Program Files\\Diablo II";

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

/** A mod, or a D2SE core played on its own. */
interface Title {
  kind: "mod" | "core";
  /** `mod:<folder>` or `core:<version>`. */
  key: string;
  folder: string;
  title: string;
  core: string | null;
  version: string | null;
  language: string | null;
  files: number;
  saves: number;
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
  } | null;
}

interface Scan {
  root: string;
  cores: Title[];
  mods: Title[];
}

interface Running {
  key: string;
  title: string;
  pid: number;
  startedAt: string;
}

interface Status {
  root: string | null;
  lastPlayed: string | null;
  playedAt: Record<string, string>;
  running: Running[];
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

type Filter = "all" | "mods" | "cores" | "issues";
type Tab = "overview" | "plugins" | "files";
type DialogPage = "launch" | "artwork";

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
  const [error, setError] = React.useState<string | null>(null);
  const [artVersion, setArtVersion] = React.useState(0);
  const [desktop, setDesktop] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);

  const titles = React.useMemo(() => [...(scan?.mods ?? []), ...(scan?.cores ?? [])], [scan]);
  const selected = titles.find((t) => t.key === selectedKey) ?? null;
  const runningKeys = new Set(status?.running.map((r) => r.key) ?? []);

  const refreshStatus = React.useCallback(async () => {
    const next = await (await fetch("/api/status")).json() as Status;
    setStatus(next);
    return next;
  }, []);

  const load = React.useCallback(async (installRoot: string) => {
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
    } catch (err) {
      setError((err as Error).message);
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
      const installRoot = first.root ?? DEFAULT_ROOT;
      setRoot(installRoot);
      if (first.lastPlayed) setSelectedKey(first.lastPlayed);
      await load(installRoot);
    })();
  }, [load, refreshStatus]);

  // Nothing played yet: open on the first title.
  React.useEffect(() => {
    if (!selectedKey && titles[0]) setSelectedKey(titles[0].key);
  }, [selectedKey, titles]);

  // While a game runs, follow it, so the bar and the Play button update when it exits.
  React.useEffect(() => {
    if (!status?.running.length) return;
    const timer = setInterval(() => void refreshStatus(), 3000);
    return () => clearInterval(timer);
  }, [status?.running.length, refreshStatus]);

  async function play(title: Title) {
    if (!root) return;
    setStarting(title.key);
    setError(null);
    try {
      const response = await fetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(title.kind === "core" ? { root, core: title.folder } : { root, folder: title.folder }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The game did not start.");
      await refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(null);
    }
  }

  const visible = titles.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "mods") return t.kind === "mod";
    if (filter === "cores") return t.kind === "core";
    if (filter === "issues") return t.problems.length > 0;
    return true;
  });
  const recent = titles
    .filter((t) => status?.playedAt[t.key])
    .sort((a, b) => status!.playedAt[b.key]!.localeCompare(status!.playedAt[a.key]!))
    .slice(0, 3);
  const row = (t: Title, prefix = "") => (
    <TitleRow
      key={prefix + t.key}
      t={t}
      root={root}
      art={artVersion}
      selected={t.key === selectedKey}
      running={runningKeys.has(t.key)}
      onSelect={setSelectedKey}
    />
  );

  async function toggleMaximize() {
    const body = await (await fetch("/api/window/maximize", { method: "POST" })).json();
    if (body.ok) setMaximized(body.maximized);
  }

  // The bar's empty space, wordmark included, moves the window; its controls don't.
  const isDragSpace = (e: React.MouseEvent) =>
    desktop && e.button === 0 && !(e.target as HTMLElement).closest("button, input, form");

  return (
    <div className={desktop ? "app desktop" : "app"}>
      {desktop && !maximized && <ResizeHandles />}
      <header
        className="topbar"
        onMouseDown={(e) => {
          if (isDragSpace(e) && e.detail === 1) void fetch("/api/window/drag", { method: "POST" });
        }}
        onDoubleClick={(e) => {
          if (isDragSpace(e)) void toggleMaximize();
        }}
      >
        <div className="wordmark">EXORDIUM</div>
        <nav className="topnav">
          <button type="button" className="topnav-item active">LIBRARY</button>
          <button type="button" className="topnav-item" disabled title="The updater comes later">UPDATES</button>
        </nav>
        <div className="grow" />
        <InstallPath
          root={root}
          scanning={scanning}
          onChange={(next) => {
            setRoot(next);
            void load(next);
          }}
        />
        {desktop && <WindowControls maximized={maximized} onToggleMaximize={() => void toggleMaximize()} />}
      </header>

      {error && <div className="banner-error" role="alert">{error}</div>}

      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-head">
            <div className="view-row">
              <span className="eyebrow">VIEW</span>
              <div className="segmented" role="group" aria-label="View">
                <button type="button" aria-pressed="true" className="on">List</button>
                <button type="button" disabled title="Grid view comes later">Grid</button>
              </div>
            </div>
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
              {(["all", "mods", "cores", "issues"] as const).map((f) => (
                <button
                  type="button"
                  key={f}
                  className={filter === f ? "chip on" : "chip"}
                  onClick={() => setFilter(f)}
                >
                  {f[0]!.toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="list">
            {scanning && !scan && <p className="muted pad">Reading the install…</p>}
            {filter === "all" && !search && recent.length > 0 && (
              <ListSection label="RECENT">{recent.map((t) => row(t, "recent-"))}</ListSection>
            )}
            {filter !== "cores" && (
              <ListSection label={`MODS · ${visible.filter((t) => t.kind === "mod").length}`}>
                {visible.filter((t) => t.kind === "mod").map((t) => row(t))}
              </ListSection>
            )}
            {filter !== "mods" && (
              <ListSection label={`CORES · ${visible.filter((t) => t.kind === "core").length}`}>
                {visible.filter((t) => t.kind === "core").map((t) => row(t))}
              </ListSection>
            )}
          </div>
        </aside>

        <main className="main">
          {selected && root
            ? (
              <TitlePage
                t={selected}
                root={root}
                art={artVersion}
                tab={tab}
                onTab={setTab}
                playedAt={status?.playedAt[selected.key] ?? null}
                running={runningKeys.has(selected.key)}
                starting={starting === selected.key}
                onPlay={() => void play(selected)}
                onProperties={() => setDialog("launch")}
              />
            )
            : <div className="empty">{scanning ? "Reading the install…" : "Nothing to show yet."}</div>}
        </main>
      </div>

      <footer className="statusbar">
        <span className={status?.running.length ? "dot live" : "dot"} />
        <span>
          {status?.running.length ? status.running.map((r) => `${r.title} is running`).join(" · ") : "Nothing running"}
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

function InstallPath(
  { root, scanning, onChange }: { root: string | null; scanning: boolean; onChange: (root: string) => void },
) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(root ?? "");
  React.useEffect(() => setValue(root ?? ""), [root]);
  if (editing) {
    return (
      <form
        className="install-edit"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          if (value.trim()) onChange(value.trim());
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          aria-label="Diablo II install folder"
          autoFocus
        />
        <button type="submit" className="ghost">Read</button>
      </form>
    );
  }
  return (
    <div className="install">
      <button type="button" className="install-path" onClick={() => setEditing(true)} title="Change the install">
        <FolderIcon />
        {root ?? "No install"}
      </button>
      <button type="button" className="ghost" disabled={scanning || !root} onClick={() => root && onChange(root)}>
        {scanning ? "Reading…" : "Rescan"}
      </button>
    </div>
  );
}

function ListSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="list-label">{label}</div>
      {children}
    </section>
  );
}

function TitleRow(
  { t, root, art, selected, running, onSelect }: {
    t: Title;
    root: string | null;
    art: number;
    selected: boolean;
    running: boolean;
    onSelect: (key: string) => void;
  },
) {
  const health = t.problems.some((p) => p.level === "error") ? "bad" : t.problems.length ? "warn" : "good";
  return (
    <button type="button" className={selected ? "row on" : "row"} onClick={() => onSelect(t.key)}>
      <TitleIcon t={t} root={root} art={art} size={24} />
      <span className="row-title">{t.title}</span>
      {running
        ? <span className="row-live">RUNNING</span>
        : <span className={`dot ${health}`} title={health === "good" ? "Ready" : `${t.problems.length} problems`} />}
    </button>
  );
}

function artUrl(root: string | null, key: string, kind: ArtKind, version: number): string {
  return `/api/art?root=${encodeURIComponent(root ?? "")}&key=${encodeURIComponent(key)}&kind=${kind}&v=${version}`;
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

function TitlePage(
  { t, root, art, tab, onTab, playedAt, running, starting, onPlay, onProperties }: {
    t: Title;
    root: string;
    art: number;
    tab: Tab;
    onTab: (tab: Tab) => void;
    playedAt: string | null;
    running: boolean;
    starting: boolean;
    onPlay: () => void;
    onProperties: () => void;
  },
) {
  const errors = t.problems.filter((p) => p.level === "error");
  const [characters, setCharacters] = React.useState<Character[] | null>(null);
  React.useEffect(() => {
    setCharacters(null);
    void (async () => {
      const response = await fetch(`/api/characters?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`);
      if (response.ok) setCharacters((await response.json()).characters);
    })();
  }, [root, t.key]);

  return (
    <>
      <section className={t.art.banner === "png" ? "hero art" : "hero"}>
        {t.art.banner === "png" && <img className="hero-art" src={artUrl(root, t.key, "banner", art)} alt="" />}
        {t.art.banner === "d2se" && (
          <div className="plate">
            <img src={artUrl(root, t.key, "banner", art)} alt={`${t.title} banner`} />
          </div>
        )}
        <div className="hero-text">
          <div className="eyebrow accent">
            {t.kind === "core" ? `D2SE CORE · VANILLA ${t.core}` : `MOD · CORE ${t.core ?? "?"}`}
          </div>
          <h1>{t.title}</h1>
        </div>
      </section>

      <div className="actionbar">
        <button type="button" className="play" disabled={running || starting || errors.length > 0} onClick={onPlay}>
          {running ? "RUNNING" : starting ? "STARTING…" : (
            <>
              <PlayIcon /> PLAY
            </>
          )}
        </button>
        <Stat label="LAST PLAYED" value={playedAt ? relative(playedAt) : "Never"} />
        <Stat
          label="RENDERER"
          value={t.settings
            ? `${RENDERERS[t.settings.renderer] ?? t.settings.renderer}${t.settings.windowed ? " · windowed" : ""}`
            : "—"}
        />
        <Stat label="CHARACTERS" value={characters === null ? "…" : String(characters.length)} />
        <div className="grow" />
        <button type="button" className="square" aria-label="Properties" onClick={onProperties}>
          <GearIcon />
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {(["overview", "plugins", "files"] as const).map((name) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === name}
            key={name}
            className={tab === name ? "tab on" : "tab"}
            onClick={() => onTab(name)}
          >
            {name[0]!.toUpperCase() + name.slice(1)}
          </button>
        ))}
      </nav>

      <div className="page">
        {tab === "overview" && (
          <div className="overview">
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
            <aside className="side">
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

        {tab === "plugins" && (
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>DLL</th>
                <th>Init</th>
                <th>Release</th>
              </tr>
            </thead>
            <tbody>
              {t.plugins.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">This title loads no plugin systems.</td>
                </tr>
              )}
              {t.plugins.map((p) => (
                <tr key={p.path}>
                  <td>{p.kind}</td>
                  <td>{p.path}</td>
                  <td>{p.init ?? "—"}</td>
                  <td>{p.release ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "files" && (
          <>
            <p className="muted">{t.files} files of its own · archives load in this order, highest priority last.</p>
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
          </>
        )}
      </div>
    </>
  );
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
            <button type="button" className={page === "launch" ? "on" : ""} onClick={() => onPage("launch")}>
              Launch
            </button>
            <button type="button" className={page === "artwork" ? "on" : ""} onClick={() => onPage("artwork")}>
              Artwork
            </button>
          </nav>
          <div className="dialog-page">
            {page === "launch" && <LaunchPage t={t} />}
            {page === "artwork" && <ArtworkPage t={t} root={root} art={art} onChanged={onArtChanged} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function LaunchPage({ t }: { t: Title }) {
  if (!t.settings) return <p className="muted">This title has no D2SE_SETUP.ini to launch from.</p>;
  const s = t.settings;
  return (
    <div className="stack">
      <p className="muted small">
        These come from the title's D2SE_SETUP.ini. Changing them for Exordium alone comes next; until then they are
        shown as the game will get them.
      </p>
      <fieldset disabled>
        <legend className="eyebrow">RENDERER</legend>
        <div className="radio-grid">
          {Object.entries(RENDERERS).map(([id, label]) => (
            <label key={id} className={s.renderer === id ? "radio on" : "radio"}>
              <input type="radio" name="renderer" checked={s.renderer === id} readOnly /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled className="checks">
        <legend className="eyebrow">GAME</legend>
        <label>
          <input type="checkbox" checked={s.windowed} readOnly /> Windowed
        </label>
        <label>
          <input type="checkbox" checked={s.noSound} readOnly /> No sound
        </label>
        <label>
          <input type="checkbox" checked={s.hardcore} readOnly /> Allow hardcore characters
        </label>
        <label>
          <input type="checkbox" checked={s.plugY} readOnly /> PlugY
        </label>
      </fieldset>
      <fieldset disabled className="checks">
        <legend className="eyebrow">MODDING</legend>
        <label>
          <input type="checkbox" checked={s.direct} readOnly /> Read loose data files (-direct)
        </label>
        <label>
          <input type="checkbox" checked={s.txt} readOnly /> Compile .txt tables (-txt)
        </label>
        <span className="small">Language: {s.language ?? "MOD"}</span>
      </fieldset>
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
    if (e.button === 0) void fetch(`/api/window/resize?edge=${edge}`, { method: "POST" }).catch(() => {});
  };
  return (
    <div className="resize-handles">
      {["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((edge) => (
        <div key={edge} className={`resize resize-${edge}`} onPointerDown={start(edge)} />
      ))}
    </div>
  );
}
