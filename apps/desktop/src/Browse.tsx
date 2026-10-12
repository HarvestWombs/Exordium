import * as React from "react";
import { Cores } from "./Cores.tsx";
import { Lightbox } from "./Lightbox.tsx";

/**
 * The mod browser: every source's entries in one list, filtered by common keywords, laid out like a
 * store page. The server (browse.ts) does the fetching; this page only asks for what is on screen.
 * Installing is one step: download, unpack with progress, move into MODS, delete the archive.
 */

interface Keyword {
  id: string;
  label: string;
}

interface Group {
  id: string;
  label: string;
  keywords: Keyword[];
}

interface Source {
  id: string;
  name: string;
  count?: number;
  fetchedAt?: string;
  external?: boolean;
  url?: string;
}

interface Item {
  source: "archive";
  id: string;
  title: string;
  description: string;
  creator: string | null;
  addedAt: string | null;
  downloads: number;
  size: number;
  keywords: string[];
  page: string;
  cover: string;
}

interface ModDbItem {
  source: "moddb";
  kind: ModDbKind;
  sourceLabel: string;
  id: string;
  title: string;
  description: string;
  addedAt: string | null;
  page: string;
  installPage: string;
  cover: string;
  keywords: string[];
}

type ModDbKind = "file" | "addon" | "mod";

/** One ModDB entry's own page, read when its card comes on screen (browse.ts modDbDetails). */
interface ModDbDetails {
  page: string;
  description: string;
  creator: string | null;
  addedAt: string | null;
  updatedAt: string | null;
  size: number | null;
  downloads: number | null;
  filename: string | null;
  screenshots: { full: string; thumb: string }[];
  files: { page: string; name: string; size: number | null; category: string | null }[];
  links: { label: string; url: string }[];
}

type Shot = { full: string; thumb: string };

interface Details {
  id: string;
  description: string;
  descriptionSource: string | null;
  archives: { name: string; size: number }[];
  screenshots: { full: string; thumb: string }[];
  links: { label: string; url: string }[];
  keywords: string[];
  unpackedSize: number;
}

interface InstallResult {
  installed: { name: string; path: string; files: number }[];
  unpacked: string | null;
  skipped: { name: string; reason: string }[];
}

type JobState = "downloading" | "extracting" | "installing" | "installed" | "downloaded" | "failed";

interface Job {
  source: "archive" | "url";
  id: string;
  title: string;
  file: string;
  path: string;
  state: JobState;
  received: number;
  total: number;
  extracted: number;
  unpackedSize: number;
  installing: string | null;
  result: InstallResult | null;
  error?: string;
  startedAt: string;
  endedAt?: string;
}

interface Throughput {
  history: { t: number; net: number; disk: number }[];
  peakNet: number;
  peakDisk: number;
  totalNet: number;
  totalDisk: number;
}

type BrowseView = "archive" | "moddb" | "cores" | "downloads";
type ArchiveSort = "all" | "popular" | "recent";

const ARCHIVE_SORTS: { id: ArchiveSort; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "popular", label: "MOST DOWNLOADED" },
  { id: "recent", label: "RECENTLY ADDED" },
];

const PAGE = 20;
const ACTIVE: JobState[] = ["downloading", "extracting", "installing"];
const MODDB_KINDS: { id: "all" | ModDbKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "file", label: "Files" },
  { id: "addon", label: "Addons" },
  { id: "mod", label: "Mods" },
];
const DOWNLOAD_URL = /\.(zip|rar|7z|tar|tgz|gz|bz2|xz)(?:[?#].*)?$/i;

/** Titles compared without case, spaces or punctuation: "The Black Soul" is "theblacksoul". */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const baseName = (file: string) => file.split("/").pop() ?? file;

function modDbAddress(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://www.moddb.com/${raw.replace(/^\/+/, "")}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return String(url);
  } catch {
    return null;
  }
}

function installableModDbUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return DOWNLOAD_URL.test(parsed.pathname) ||
      /(^|\.)moddb\.com$/i.test(parsed.hostname) &&
        (/\/downloads(?:\/|$)/i.test(parsed.pathname) || /\/addons\/[^/]+$/i.test(parsed.pathname));
  } catch {
    return false;
  }
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    return last ? decodeURIComponent(last).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") : "ModDB download";
  } catch {
    return "ModDB download";
  }
}

function post(path: string, body: unknown) {
  return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function openLink(url: string) {
  void post("/api/open-link", { url }).catch(() => {});
}

/** Where a job is, as a fraction 0..1, or null when it cannot be measured (unpacking an unknown size). */
function jobProgress(job: Job): number | null {
  if (job.state === "downloading") return job.total ? job.received / job.total : null;
  if (job.state === "extracting") return job.unpackedSize ? Math.min(1, job.extracted / job.unpackedSize) : null;
  if (job.state === "installing" || job.state === "installed") return 1;
  return null;
}

function jobLabel(job: Job): string {
  const progress = jobProgress(job);
  const percent = progress === null ? "" : ` ${Math.floor(progress * 100)}%`;
  switch (job.state) {
    case "downloading":
      return `DOWNLOADING${percent}`;
    case "extracting":
      return `UNPACKING${percent}`;
    case "installing":
      return "INSTALLING…";
    case "installed":
      return "INSTALLED";
    case "downloaded":
      return "INSTALL";
    case "failed":
      return "RETRY";
  }
}

export function Browse(
  { initialView, installed, root, onInstalled, onCoreInstalled }: {
    /** The tab to open on: setup sends players without cores straight to Cores. */
    initialView?: "archive" | "cores";
    installed: Set<string>;
    /** The D2SE install mods are installed into (its MODS folder). */
    root: string | null;
    /** A mod was installed as MODS\<name>: rescan and show it. */
    onInstalled: (name: string) => void;
    /** A core was installed into the library's cores folder: rescan and show it. */
    onCoreInstalled: (core: string) => void;
  },
) {
  const [data, setData] = React.useState<{ sources: Source[]; groups: Group[]; items: Item[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [view, setView] = React.useState<BrowseView>(initialView ?? "archive");
  const [archiveSort, setArchiveSort] = React.useState<ArchiveSort>("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [hideInstalled, setHideInstalled] = React.useState(false);
  const [shown, setShown] = React.useState(PAGE);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [rates, setRates] = React.useState<Throughput | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [extraKeywords, setExtraKeywords] = React.useState<Record<string, string[]>>({});
  const [installRequest, setInstallRequest] = React.useState<
    {
      item: Item | null;
      mode: "archive" | "downloaded" | "local" | "url";
      id: string;
      file: string;
      title: string;
      url?: string;
      /** The ModDB card the download was started from, so it can show the job. */
      itemKey?: string;
    } | null
  >(null);
  const [metadataJobs, setMetadataJobs] = React.useState<Set<string>>(new Set());
  const importedJobs = React.useRef(new Set<string>());
  const [modDb, setModDb] = React.useState<{ items: ModDbItem[]; fetchedAt: string | null } | null>(null);
  const [modDbLoading, setModDbLoading] = React.useState(false);
  const [modDbError, setModDbError] = React.useState<string | null>(null);
  const [modDbKind, setModDbKind] = React.useState<"all" | ModDbKind>("all");
  const [linkAddress, setLinkAddress] = React.useState("");
  /** ModDB card -> the id of the link download started from it. */
  const [urlJobs, setUrlJobs] = React.useState<Record<string, string>>({});

  const loadModDb = React.useCallback(async (refresh = false) => {
    setModDbLoading(true);
    setModDbError(null);
    try {
      const response = await fetch(`/api/browse/moddb${refresh ? "?refresh=1" : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not read ModDB.");
      setModDb({ items: body.items ?? [], fetchedAt: body.fetchedAt ?? null });
    } catch (err) {
      setModDbError((err as Error).message);
    } finally {
      setModDbLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (view === "moddb" && !modDb && !modDbLoading && !modDbError) void loadModDb();
  }, [view, modDb, modDbLoading, modDbError, loadModDb]);

  const load = React.useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/browse${refresh ? "?refresh=1" : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not reach the sources.");
      setData(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshJobs = React.useCallback(async () => {
    const response = await fetch("/api/browse/downloads");
    if (!response.ok) return;
    const body = await response.json();
    setJobs(body.jobs);
    setRates(body);
  }, []);

  React.useEffect(() => {
    void load();
    void refreshJobs();
  }, [load, refreshJobs]);

  // Follow jobs while any runs, and the graph while the downloads page is open.
  const busy = jobs.some((job) => ACTIVE.includes(job.state));
  React.useEffect(() => {
    if (!busy && view !== "downloads") return;
    const timer = setInterval(() => void refreshJobs(), 1000);
    return () => clearInterval(timer);
  }, [busy, view, refreshJobs]);

  React.useEffect(() => setShown(PAGE), [view, archiveSort, modDbKind, search, selected, hideInstalled]);

  const isInstalled = React.useCallback((item: Item) => installed.has(titleKey(item.title)), [installed]);
  const keywordsOf = React.useCallback(
    (item: Item) => [...new Set([...item.keywords, ...(extraKeywords[item.id] ?? [])])],
    [extraKeywords],
  );

  const matches = React.useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (needle && !`${item.title}\n${item.description}\n${item.creator ?? ""}`.toLowerCase().includes(needle)) {
        return false;
      }
      if (hideInstalled && isInstalled(item)) return false;
      const keywords = keywordsOf(item);
      for (const keyword of selected) if (!keywords.includes(keyword)) return false;
      return true;
    });
  }, [data, search, hideInstalled, isInstalled, selected, keywordsOf]);

  const sorted = React.useMemo(() => {
    const list = [...matches];
    if (archiveSort === "popular") list.sort((a, b) => b.downloads - a.downloads);
    else if (archiveSort === "recent") list.sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
    else list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    return list;
  }, [matches, archiveSort]);

  // ModDB lists a mod's page and its download separately; "All" shows one, the download first.
  const modDbMatches = React.useMemo(() => {
    if (!modDb) return [];
    const needle = search.trim().toLowerCase();
    const rank: Record<ModDbKind, number> = { file: 0, addon: 1, mod: 2 };
    const first = new Map<string, ModDbItem>();
    if (modDbKind === "all") {
      for (const item of modDb.items) {
        const key = titleKey(item.title);
        const kept = first.get(key);
        if (!kept || rank[item.kind] < rank[kept.kind]) first.set(key, item);
      }
    }
    return modDb.items.filter((item) => {
      if (modDbKind === "all" ? first.get(titleKey(item.title)) !== item : item.kind !== modDbKind) return false;
      if (needle && !`${item.title}\n${item.description}`.toLowerCase().includes(needle)) return false;
      if (hideInstalled && installed.has(titleKey(item.title))) return false;
      for (const keyword of selected) if (!item.keywords.includes(keyword)) return false;
      return true;
    });
  }, [modDb, modDbKind, search, hideInstalled, installed, selected]);

  // How many of the current matches each keyword would keep: the numbers beside the filters.
  const counts = React.useMemo(() => {
    const result = new Map<string, number>();
    const lists: string[][] = view === "moddb"
      ? modDbMatches.map((item) => item.keywords)
      : matches.map((item) => keywordsOf(item));
    for (const keywords of lists) {
      for (const keyword of keywords) result.set(keyword, (result.get(keyword) ?? 0) + 1);
    }
    return result;
  }, [view, matches, modDbMatches, keywordsOf]);
  const modDbCounts = React.useMemo(() => {
    const kinds = new Map<"all" | ModDbKind, number>([["file", 0], ["addon", 0], ["mod", 0]]);
    for (const item of modDb?.items ?? []) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
    kinds.set("all", new Set(modDb?.items.map((item) => titleKey(item.title)) ?? []).size);
    return kinds;
  }, [modDb]);

  const toggle = (keyword: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });

  const labels = new Map(data?.groups.flatMap((group) => group.keywords.map((k) => [k.id, k.label] as const)) ?? []);
  const openPlace = (body: unknown) => void post("/api/browse/open", body).catch(() => {});

  React.useEffect(() => {
    if (!root || metadataJobs.size === 0) return;
    for (const job of jobs) {
      const key = `${job.id}/${job.file}`;
      if (!metadataJobs.has(key) || importedJobs.current.has(key) || job.state !== "installed") continue;
      const folders = job.result?.installed.map((mod) => mod.name) ?? [];
      if (folders.length === 0) continue;
      importedJobs.current.add(key);
      void post("/api/import-d2se-metadata", { root, folders }).finally(() => {
        setMetadataJobs((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      });
    }
  }, [jobs, metadataJobs, root]);

  async function install(request: NonNullable<typeof installRequest>, installRoot: string, importMetadata: boolean) {
    const response = await post(request.mode === "downloaded" ? "/api/browse/install" : "/api/browse/download", {
      id: request.id,
      file: request.file,
      root: installRoot,
      title: request.item?.title ?? request.title,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "It did not start.");
    if (importMetadata) {
      const key = `${request.id}/${request.file}`;
      setMetadataJobs((current) => new Set(current).add(key));
    }
    await refreshJobs();
  }

  async function installUrl(request: NonNullable<typeof installRequest>, installRoot: string, importMetadata: boolean) {
    const response = await post("/api/browse/url-download", {
      url: request.url ?? request.file,
      root: installRoot,
      title: request.title,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "It did not start.");
    const itemKey = request.itemKey;
    if (itemKey && typeof body.id === "string") setUrlJobs((current) => ({ ...current, [itemKey]: body.id }));
    if (importMetadata) {
      const key = `${body.id ?? request.id}/${body.file ?? request.file}`;
      setMetadataJobs((current) => new Set(current).add(key));
    }
    await refreshJobs();
  }

  async function pickArchive(startPath: string): Promise<string | null> {
    const params = new URLSearchParams({
      title: "Import local mod archive",
      multiple: "false",
      extensions: JSON.stringify([{ label: "Mod archives", extensions: ["zip", "7z", "rar", "tar", "tgz"] }]),
    });
    if (startPath) params.set("path", startPath);
    const response = await fetch(`/api/pick-open-files?${params}`);
    if (!response.ok) return null;
    const body = await response.json();
    return body.paths?.[0] ?? null;
  }

  async function installLocal(archive: string, installRoot: string, importMetadata: boolean) {
    const response = await post("/api/install-local-archive", {
      archive,
      root: installRoot,
      importMetadata,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not install the archive.");
    const first = body.result?.installed?.[0]?.name;
    if (first) onInstalled(first);
  }

  function queueInstall(item: Item | null, id: string, file: string, title: string, fromDisk: boolean) {
    setInstallRequest({ item, id, file, title, mode: fromDisk ? "downloaded" : "archive" });
  }

  function queueUrlInstall(url: string, title: string, itemKey?: string) {
    setInstallRequest({
      item: null,
      id: `url-${Date.now()}`,
      file: url,
      url,
      title: title.trim() || "ModDB download",
      mode: "url",
      ...(itemKey ? { itemKey } : {}),
    });
  }

  const linkUrl = modDbAddress(linkAddress);
  const linkOk = linkUrl ? installableModDbUrl(linkUrl) : false;

  async function startInstall(
    request: NonNullable<typeof installRequest>,
    installRoot: string,
    importMetadata: boolean,
  ) {
    localStorage.setItem("exordium.installRoot", installRoot);
    await install(request, installRoot, importMetadata);
    setInstallRequest(null);
  }

  async function importFromDisk() {
    const archive = await pickArchive(root ?? localStorage.getItem("exordium.installRoot") ?? "");
    if (!archive) return;
    setInstallRequest({
      item: null,
      id: `local-${Date.now()}`,
      file: archive,
      title: baseName(archive),
      mode: "local",
    });
  }

  async function installQueuedLocal(installRoot: string, importMetadata: boolean) {
    if (!installRequest) return;
    localStorage.setItem("exordium.installRoot", installRoot);
    await installLocal(installRequest.file, installRoot, importMetadata);
    setInstallRequest(null);
    await refreshJobs();
  }

  async function installQueuedUrl(installRoot: string, importMetadata: boolean) {
    if (!installRequest) return;
    localStorage.setItem("exordium.installRoot", installRoot);
    await installUrl(installRequest, installRoot, importMetadata);
    setInstallRequest(null);
  }

  return (
    <div className="browse">
      {installRequest && (
        <InstallModModal
          request={installRequest}
          defaultRoot={root ?? ""}
          onClose={() => setInstallRequest(null)}
          onInstall={(installRoot, importMetadata) =>
            installRequest.mode === "local"
              ? installQueuedLocal(installRoot, importMetadata)
              : installRequest.mode === "url"
              ? installQueuedUrl(installRoot, importMetadata)
              : startInstall(installRequest, installRoot, importMetadata)}
        />
      )}
      <aside className="browse-filters">
        <button type="button" className="import-local" onClick={() => void importFromDisk()}>
          <span aria-hidden="true">+</span>
          Import local archive
        </button>

        <section className="source-switch">
          <h2 className="filters-title">SOURCES</h2>
          <button
            type="button"
            className={view === "archive" ? "source-card on" : "source-card"}
            onClick={() => setView("archive")}
          >
            <span>Internet Archive</span>
            <small>{data ? `${data.items.length} indexed mods` : loading ? "Reading…" : "Archive catalog"}</small>
          </button>
          <button
            type="button"
            className={view === "moddb" ? "source-card on" : "source-card"}
            onClick={() => setView("moddb")}
          >
            <span>ModDB</span>
            <small>Files, addons, and mods</small>
          </button>
          <button
            type="button"
            className={view === "cores" ? "source-card on" : "source-card"}
            onClick={() => setView("cores")}
          >
            <span>Cores</span>
            <small>Install game versions</small>
          </button>
          <button
            type="button"
            className={view === "downloads" ? "source-card on" : "source-card"}
            onClick={() => setView("downloads")}
          >
            <span>Downloads{busy ? " · active" : ""}</span>
            <small>Queue and installs</small>
          </button>
        </section>

        {(view === "archive" || view === "moddb") && (
          <>
            <h2 className="filters-title filters-title-secondary">FILTERS</h2>
            {selected.size > 0 && (
              <div className="active-filters">
                {[...selected].map((keyword) => (
                  <button
                    type="button"
                    key={keyword}
                    className="active-filter"
                    onClick={() => toggle(keyword)}
                  >
                    × {labels.get(keyword) ?? keyword}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small">
              {view === "moddb"
                ? modDb ? `${modDbMatches.length} matches` : modDbLoading ? "Reading ModDB…" : ""
                : data
                ? `${matches.length} matches`
                : loading
                ? "Reading sources…"
                : ""}
            </p>

            {data?.groups.map((group) => (
              <section key={group.id} className="filter-group">
                <h3>{group.label}</h3>
                {group.keywords.map((keyword) => {
                  const n = counts.get(keyword.id) ?? 0;
                  const on = selected.has(keyword.id);
                  if (!on && n === 0) return null;
                  return (
                    <button
                      type="button"
                      key={keyword.id}
                      className={on ? "filter-row on" : "filter-row"}
                      onClick={() => toggle(keyword.id)}
                    >
                      <span>{keyword.label}</span>
                      <span className="count">{n}</span>
                    </button>
                  );
                })}
              </section>
            ))}

            <section className="filter-group">
              <h3>PREFERENCES</h3>
              <button
                type="button"
                className={hideInstalled ? "filter-row on" : "filter-row"}
                onClick={() => setHideInstalled((v) => !v)}
              >
                <span>Hide mods in my library</span>
              </button>
              {view === "moddb"
                ? (
                  <button
                    type="button"
                    className="filter-row"
                    disabled={modDbLoading}
                    onClick={() => void loadModDb(true)}
                  >
                    <span>{modDbLoading ? "Refreshing…" : "Refresh source"}</span>
                  </button>
                )
                : (
                  <button type="button" className="filter-row" disabled={loading} onClick={() => void load(true)}>
                    <span>{loading ? "Refreshing…" : "Refresh source"}</span>
                  </button>
                )}
              {view === "moddb" && (
                <button
                  type="button"
                  className="filter-row"
                  onClick={() => openPlace({ what: "moddb" })}
                >
                  <span>Open ModDB ↗</span>
                </button>
              )}
            </section>

            {view === "moddb" && (
              <section className="filter-group">
                <h3>FROM A LINK</h3>
                <form
                  className="link-install"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!linkUrl || !linkOk) return;
                    queueUrlInstall(linkUrl, titleFromUrl(linkUrl));
                    setLinkAddress("");
                  }}
                >
                  <input
                    value={linkAddress}
                    onChange={(event) => setLinkAddress(event.currentTarget.value)}
                    placeholder="ModDB page or archive link"
                    aria-label="Download address"
                  />
                  <button type="submit" className="ghost primary compact" disabled={!linkOk || !root}>
                    Install
                  </button>
                </form>
                {linkAddress.trim() && !linkOk && (
                  <p className="warn-text small">Use a ModDB mod, addon or download page, or a link to an archive.</p>
                )}
              </section>
            )}
          </>
        )}
      </aside>

      <section className="browse-main">
        <nav className="browse-tabs">
          {view === "archive" && ARCHIVE_SORTS.map((t) => (
            <button
              type="button"
              key={t.id}
              className={archiveSort === t.id ? "browse-tab on" : "browse-tab"}
              onClick={() => setArchiveSort(t.id)}
            >
              {t.label}
            </button>
          ))}
          {view === "moddb" && MODDB_KINDS.map((t) => (
            <button
              type="button"
              key={t.id}
              className={modDbKind === t.id ? "browse-tab on" : "browse-tab"}
              onClick={() => setModDbKind(t.id)}
            >
              {t.label.toUpperCase()}
              {modDb && <span className="tab-count">{modDbCounts.get(t.id) ?? 0}</span>}
            </button>
          ))}
          {view === "cores" && <span className="browse-context">CORES</span>}
          {view === "downloads" && <span className="browse-context">DOWNLOADS</span>}
          <div className="grow" />
          {(view === "archive" || view === "moddb") && (
            <label className="search browse-search">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="Search by name…"
                aria-label="Search mods"
              />
            </label>
          )}
        </nav>

        {view === "cores" && <Cores root={root} onInstalled={onCoreInstalled} />}
        {view === "moddb" && (
          <div className="browse-list">
            {modDbError && <div className="banner-error" role="alert">{modDbError}</div>}
            {!modDb && !modDbError && <p className="muted pad">Reading ModDB…</p>}
            {modDb && modDbMatches.length === 0 && <p className="muted pad">Nothing matches these filters.</p>}
            {modDbMatches.slice(0, shown).map((item) => {
              const key = `moddb:${item.kind}:${item.id}`;
              return (
                <ModDbCard
                  key={key}
                  item={item}
                  labels={labels}
                  installed={installed.has(titleKey(item.title))}
                  expanded={open[key] ?? false}
                  onExpand={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                  jobs={jobs.filter((job) => job.source === "url" && job.id === urlJobs[key])}
                  root={root}
                  onInstall={(url) => queueUrlInstall(url, item.title, key)}
                  onInstalled={onInstalled}
                  onOpen={(what, job) => openPlace({ what, id: job.id, file: job.file })}
                  onKeyword={toggle}
                />
              );
            })}
            {modDbMatches.length > shown && (
              <button
                type="button"
                className="ghost more"
                onClick={() => setShown((n) => n + PAGE)}
              >
                Show more ({modDbMatches.length - shown} left)
              </button>
            )}
            {modDb && (
              <p className="muted small pad">
                Installers (.exe) are never run for you: open their page and install them yourself if you trust them.
                {modDb.fetchedAt && ` ModDB read ${new Date(modDb.fetchedAt).toLocaleString()}.`}
              </p>
            )}
          </div>
        )}
        {view === "cores" || view === "moddb" ? null : view === "downloads"
          ? (
            <Downloads
              jobs={jobs}
              rates={rates}
              root={root}
              onInstall={(job) => queueInstall(null, job.id, job.file, job.title, job.state === "downloaded")}
              onInstalled={onInstalled}
              onOpen={openPlace}
            />
          )
          : (
            <div className="browse-list">
              {error && <div className="banner-error" role="alert">{error}</div>}
              {!data && !error && <p className="muted pad">Reading sources…</p>}
              {data && sorted.length === 0 && <p className="muted pad">Nothing matches these filters.</p>}
              {sorted.slice(0, shown).map((item) => (
                <ModCard
                  key={`${item.source}:${item.id}`}
                  item={item}
                  labels={labels}
                  keywords={keywordsOf(item)}
                  installed={isInstalled(item)}
                  expanded={open[item.id] ?? false}
                  onExpand={() => setOpen((o) => ({ ...o, [item.id]: !o[item.id] }))}
                  jobs={jobs.filter((job) => job.id === item.id)}
                  root={root}
                  onDetails={(d) => setExtraKeywords((k) => (k[item.id] ? k : { ...k, [item.id]: d.keywords }))}
                  onInstall={(file, fromDisk) => queueInstall(item, item.id, file, item.title, fromDisk)}
                  onInstalled={onInstalled}
                  onOpen={(what, file) => openPlace({ what, id: item.id, file })}
                  onKeyword={toggle}
                />
              ))}
              {sorted.length > shown && (
                <button
                  type="button"
                  className="ghost more"
                  onClick={() => setShown((n) => n + PAGE)}
                >
                  Show more ({sorted.length - shown} left)
                </button>
              )}
            </div>
          )}
      </section>
    </div>
  );
}

function InstallModModal(
  { request, defaultRoot, onInstall, onClose }: {
    request: { file: string; title: string; mode: "archive" | "downloaded" | "local" | "url"; url?: string };
    /** Exordium's library: every install goes into it. */
    defaultRoot: string;
    onInstall: (root: string, importMetadata: boolean) => Promise<void>;
    onClose: () => void;
  },
) {
  const folder = defaultRoot.replaceAll("/", "\\");
  const [importMetadata, setImportMetadata] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ready = folder.trim().length > 0;
  const target = folder.trim().replace(/[\\/]+$/, "").replaceAll("/", "\\");
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !busy && onClose();
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  async function run() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onInstall(folder.trim(), importMetadata);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const what = request.mode === "local"
    ? `Unpacks ${baseName(request.file)}`
    : request.mode === "url"
    ? "Downloads the archive, unpacks it,"
    : request.mode === "downloaded"
    ? `Unpacks ${baseName(request.file)}`
    : `Downloads ${baseName(request.file)}, unpacks it,`;
  return (
    <div className="scrim" role="presentation" onMouseDown={() => !busy && onClose()}>
      <form
        className="install-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Install ${request.title}`}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <h2>Install {request.title}</h2>
        <p className="muted">
          {what} and adds it to the Diablo II install below. Existing mod folders are never overwritten.
        </p>
        {target && <p className="muted small">Installs into {target}\mods</p>}
        <label className="confirm-check">
          <input
            type="checkbox"
            checked={importMetadata}
            disabled={busy}
            onChange={(event) => setImportMetadata(event.currentTarget.checked)}
          />
          Draft an exordium.mod.json from its D2SE_SETUP.ini
        </label>
        {error && <p className="bad-text small" role="alert">{error}</p>}
        <div className="row-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="ghost primary" disabled={busy || !ready}>
            {busy ? "Starting…" : "Install"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** A card's screenshots: the one shown large, a strip of four, and the full gallery on click. */
function ShotGallery({ shots, empty }: { shots: Shot[]; empty: string }) {
  const [shot, setShot] = React.useState(0);
  const [gallery, setGallery] = React.useState(false);
  return (
    <div className="mod-shots">
      {shots.length > 0
        ? (
          <>
            <button
              type="button"
              className="shot-main-button"
              title="Open the gallery"
              onClick={() => setGallery(true)}
            >
              <img className="shot-main" src={shots[shot]?.full} alt="" onError={smallerModDbImage} />
            </button>
            <div className="shot-strip">
              {shots.slice(0, 4).map((s, i) => (
                <button
                  type="button"
                  key={s.thumb}
                  className={i === shot ? "shot on" : "shot"}
                  onClick={() => setShot(i)}
                >
                  <img src={s.thumb} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )
        : <div className="shot-empty muted small">{empty}</div>}
      {gallery && (
        <Lightbox
          images={shots.map((s) => ({ src: s.full, thumb: s.thumb }))}
          start={shot}
          onClose={() => setGallery(false)}
        />
      )}
    </div>
  );
}

/** A large ModDB picture its cache does not have: fall back to the listing's crop, which it always has. */
function smallerModDbImage(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  const smaller = img.src.replace("/thumb_620x2000/", "/crop_120x90/");
  if (smaller !== img.src) img.src = smaller;
}

const INSTALLER_FILE = /\.(exe|msi|bat|cmd|com|scr)$/i;

/**
 * A ModDB entry, laid out as an archive.org card. The listing gives a title, a blurb and a picture;
 * the entry's own page (read once the card nears the screen) adds the full description, who made
 * it, its downloads, screenshots and, for a mod, its files to choose from.
 */
function ModDbCard(
  { item, labels, installed, expanded, onExpand, jobs, root, onInstall, onInstalled, onOpen, onKeyword }: {
    item: ModDbItem;
    labels: Map<string, string>;
    installed: boolean;
    expanded: boolean;
    onExpand: () => void;
    jobs: Job[];
    root: string | null;
    onInstall: (url: string) => void;
    onInstalled: (name: string) => void;
    onOpen: (what: "file" | "unpacked", job: Job) => void;
    onKeyword: (keyword: string) => void;
  },
) {
  const ref = React.useRef<HTMLElement>(null);
  const [details, setDetails] = React.useState<ModDbDetails | null>(null);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState("");

  React.useEffect(() => {
    const node = ref.current;
    if (!node || details) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const response = await fetch(`/api/browse/moddb-item?page=${encodeURIComponent(item.page)}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return setDetailsError(body.error ?? "Could not read this page.");
        setDetails(body);
        setFile(body.files?.[0]?.page ?? "");
        for (const s of body.screenshots as Shot[]) new Image().src = s.full;
      })();
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.page, details]);

  const job = jobs[0];
  const progress = job ? jobProgress(job) : null;
  const running = job ? ACTIVE.includes(job.state) : false;
  const description = details?.description || item.description;
  const shots = details?.screenshots ?? [];
  const isMod = item.kind === "mod";
  const chosen = isMod ? details?.files.find((f) => f.page === file) ?? null : null;
  const size = isMod ? chosen?.size ?? null : details?.size ?? null;
  const installer = !isMod && INSTALLER_FILE.test(details?.filename ?? "");
  const target = isMod ? chosen?.page ?? item.installPage : item.installPage || item.page;

  return (
    <article ref={ref} className="mod-card">
      <div className="mod-cover">
        <img src={shots[0]?.full ?? item.cover} alt="" loading="lazy" onError={smallerModDbImage} />
        {installed && <span className="ribbon">IN LIBRARY</span>}
      </div>

      <div className="mod-info">
        <h2 className="mod-title">{item.title}</h2>
        <p className={expanded ? "mod-description open" : "mod-description"}>
          {description || (details ? "The author gave no description." : "…")}
        </p>
        <div className="mod-under">
          {description.length > 280 && (
            <button type="button" className="link-button" onClick={onExpand}>{expanded ? "Less" : "More"}</button>
          )}
          {details?.links.map((link) => (
            <button
              type="button"
              key={link.url}
              className="link-button"
              title={link.url}
              onClick={() => openLink(link.url)}
            >
              {link.label} ↗
            </button>
          ))}
        </div>
        {item.keywords.length > 0 && (
          <div className="mod-tags">
            <span className="eyebrow">TAGS</span>
            {item.keywords.map((keyword) => (
              <button
                type="button"
                key={keyword}
                className="mod-tag"
                onClick={() => onKeyword(keyword)}
              >
                {labels.get(keyword) ?? keyword}
              </button>
            ))}
          </div>
        )}
        <dl className="mod-facts">
          <dt>ADDED</dt>
          <dd>
            {(details?.addedAt ?? item.addedAt)
              ? new Date(details?.addedAt ?? item.addedAt!).toLocaleDateString()
              : "—"}
          </dd>
          <dt>BY</dt>
          <dd>{details?.creator ?? "—"}</dd>
          {details?.updatedAt
            ? (
              <>
                <dt>UPDATED</dt>
                <dd>{new Date(details.updatedAt).toLocaleDateString()}</dd>
              </>
            )
            : null}
          {isMod
            ? (
              <>
                <dt>FILES</dt>
                <dd>{details ? details.files.length : "—"}</dd>
              </>
            )
            : (
              <>
                <dt>DOWNLOADS</dt>
                <dd>{details?.downloads != null ? details.downloads.toLocaleString() : "—"}</dd>
              </>
            )}
        </dl>
      </div>

      <ShotGallery shots={shots} empty={details ? "No screenshots" : detailsError ?? "…"} />

      <div className="mod-bar">
        <span className="source-badge">ModDB · {item.sourceLabel}</span>
        <button type="button" className="link-button" onClick={() => openLink(item.page)}>Page ↗</button>
        <div className="grow" />
        {detailsError && <span className="bad-text small">{detailsError}</span>}
        {job && <JobResult job={job} onInstalled={onInstalled} onOpen={(what) => onOpen(what, job)} />}
        {running && progress !== null && (
          <span className="progress">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
        {isMod && details && details.files.length > 1 && !running && (
          <select
            value={file}
            onChange={(e) => setFile(e.currentTarget.value)}
            aria-label="File to install"
          >
            {details.files.map((f) => (
              <option key={f.page} value={f.page}>
                {f.name}
                {f.size ? ` (${formatBytes(f.size)})` : ""}
              </option>
            ))}
          </select>
        )}
        {size !== null && <span className="mod-size">{formatBytes(size)}</span>}
        {installer
          ? (
            <button
              type="button"
              className="download"
              title="An installer: Exordium never runs one for you. Open its page and install it yourself."
              onClick={() => openLink(item.page)}
            >
              INSTALLER ↗
            </button>
          )
          : (
            <button
              type="button"
              className="download"
              disabled={!details || !root || running || job?.state === "installed" ||
                (isMod && !chosen && details.files.length > 0)}
              title={root ? undefined : "Choose the Diablo II install first"}
              onClick={() => onInstall(target)}
            >
              {job ? jobLabel(job) : "INSTALL"}
            </button>
          )}
      </div>
    </article>
  );
}

function ModCard(
  {
    item,
    labels,
    keywords,
    installed,
    expanded,
    onExpand,
    jobs,
    root,
    onDetails,
    onInstall,
    onInstalled,
    onOpen,
    onKeyword,
  }: {
    item: Item;
    labels: Map<string, string>;
    keywords: string[];
    installed: boolean;
    expanded: boolean;
    onExpand: () => void;
    jobs: Job[];
    root: string | null;
    onDetails: (details: Details) => void;
    onInstall: (file: string, fromDisk: boolean) => void;
    onInstalled: (name: string) => void;
    onOpen: (what: "page" | "file" | "unpacked", file?: string) => void;
    onKeyword: (keyword: string) => void;
  },
) {
  const ref = React.useRef<HTMLElement>(null);
  const [details, setDetails] = React.useState<Details | null>(null);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<string>("");

  // Details (screenshots, files, the archive's own readme) are asked for once the card is near the
  // screen; the full screenshots are then preloaded, so switching between them is instant.
  React.useEffect(() => {
    const node = ref.current;
    if (!node || details) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const response = await fetch(`/api/browse/item?id=${encodeURIComponent(item.id)}`);
        const body = await response.json();
        if (!response.ok) return setDetailsError(body.error ?? "Could not read this item.");
        setDetails(body);
        setFile([...body.archives].sort((a: { size: number }, b: { size: number }) => b.size - a.size)[0]?.name ?? "");
        onDetails(body);
        for (const s of body.screenshots as Details["screenshots"]) new Image().src = s.full;
      })();
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.id, details, onDetails]);

  const job = jobs.find((j) => baseName(j.file) === baseName(file)) ?? jobs[0];
  const description = details?.description ?? "";
  const shots = details?.screenshots ?? [];
  const progress = job ? jobProgress(job) : null;
  const running = job ? ACTIVE.includes(job.state) : false;

  return (
    <article ref={ref} className="mod-card">
      <div className="mod-cover">
        {
          /* The uploader's first screenshot when there is one: archive.org's own tile is a generic logo for
            most items. */
        }
        <img src={shots[0]?.thumb ?? item.cover} alt="" loading="lazy" />
        {installed && <span className="ribbon">IN LIBRARY</span>}
      </div>

      <div className="mod-info">
        <h2 className="mod-title">{item.title}</h2>
        <p className={expanded ? "mod-description open" : "mod-description"}>
          {details === null
            ? "…"
            : description || "The uploader gave no description, and none was found in the archive."}
        </p>
        <div className="mod-under">
          {details?.descriptionSource && description && (
            <span className="muted small">From {details.descriptionSource}</span>
          )}
          {description.length > 280 && (
            <button type="button" className="link-button" onClick={onExpand}>{expanded ? "Less" : "More"}</button>
          )}
          {details?.links.map((link) => (
            <button
              type="button"
              key={link.url}
              className="link-button"
              title={link.url}
              onClick={() => openLink(link.url)}
            >
              {link.label} ↗
            </button>
          ))}
        </div>
        {keywords.length > 0 && (
          <div className="mod-tags">
            <span className="eyebrow">TAGS</span>
            {keywords.map((keyword) => (
              <button
                type="button"
                key={keyword}
                className="mod-tag"
                onClick={() => onKeyword(keyword)}
              >
                {labels.get(keyword) ?? keyword}
              </button>
            ))}
          </div>
        )}
        <dl className="mod-facts">
          <dt>ADDED</dt>
          <dd>{item.addedAt ? new Date(item.addedAt).toLocaleDateString() : "—"}</dd>
          <dt>BY</dt>
          <dd>{item.creator ?? "—"}</dd>
          <dt>DOWNLOADS</dt>
          <dd>{item.downloads.toLocaleString()}</dd>
        </dl>
      </div>

      <ShotGallery shots={shots} empty={details ? "No screenshots" : detailsError ?? "…"} />

      <div className="mod-bar">
        <span className="source-badge">Internet Archive</span>
        <button type="button" className="link-button" onClick={() => onOpen("page")}>Page ↗</button>
        <div className="grow" />
        {detailsError && <span className="bad-text small">{detailsError}</span>}
        <JobResult job={job} onInstalled={onInstalled} onOpen={(what) => onOpen(what, job?.file)} />
        {running && progress !== null && (
          <span className="progress">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
        {details && details.archives.length > 1 && !running && (
          <select
            value={file}
            onChange={(e) => setFile(e.currentTarget.value)}
            aria-label="File to install"
          >
            {details.archives.map((a) => <option key={a.name} value={a.name}>{a.name} ({formatBytes(a.size)})</option>)}
          </select>
        )}
        <span className="mod-size">
          {formatBytes(details?.archives.find((a) => a.name === file)?.size ?? item.size)}
        </span>
        <button
          type="button"
          className="download"
          disabled={!details || !file || !root || running || job?.state === "installed"}
          title={root ? undefined : "Choose the Diablo II install first"}
          onClick={() => onInstall(file, job?.state === "downloaded")}
        >
          {job ? jobLabel(job) : details && !file ? "NO FILES" : "INSTALL"}
        </button>
      </div>
    </article>
  );
}

/** What a finished or failed job left: the installed mod, a reason, or files to look at. */
function JobResult(
  { job, onInstalled, onOpen }: {
    job: Job | undefined;
    onInstalled: (name: string) => void;
    onOpen: (what: "file" | "unpacked") => void;
  },
) {
  if (!job) return null;
  if (job.state === "failed") {
    return (
      <span className="bad-text small">
        {job.error}
        {job.path && (
          <>
            {" · "}
            <button type="button" className="link-button" onClick={() => onOpen("file")}>Show archive</button>
          </>
        )}
      </span>
    );
  }
  if (job.state !== "installed" || !job.result) return null;
  return (
    <>
      {job.result.installed.map((mod) => (
        <span key={mod.name} className="good-text small">
          Installed as MODS\{mod.name} ·{" "}
          <button type="button" className="link-button" onClick={() => onInstalled(mod.name)}>Open in library</button>
        </span>
      ))}
      {job.result.skipped.map((mod) => <span key={mod.name} className="warn-text small">{mod.reason}</span>)}
      {job.result.installed.length === 0 && job.result.skipped.length === 0 && (
        <span className="warn-text small">
          No D2SE mod inside (no D2SE_SETUP.ini) · files unpacked ·{" "}
          <button type="button" className="link-button" onClick={() => onOpen("unpacked")}>Show files</button>
        </span>
      )}
    </>
  );
}

/**
 * The downloads page, after Steam's: a graph of network and disk throughput over the last minutes,
 * the numbers beside it, the job running now, then everything finished this session.
 */
function Downloads(
  { jobs, rates, root, onInstall, onInstalled, onOpen }: {
    jobs: Job[];
    rates: Throughput | null;
    root: string | null;
    onInstall: (job: Job) => void;
    onInstalled: (name: string) => void;
    onOpen: (body: unknown) => void;
  },
) {
  const history = rates?.history ?? [];
  const current = history[history.length - 1] ?? { net: 0, disk: 0 };
  const active = jobs.filter((job) => ACTIVE.includes(job.state));
  const waiting = jobs.filter((job) => job.state === "downloaded" || job.state === "failed");
  const done = jobs.filter((job) => job.state === "installed").sort((a, b) =>
    (b.endedAt ?? "").localeCompare(a.endedAt ?? "")
  );

  return (
    <div className="downloads">
      <section className="dl-graph-card">
        <ThroughputGraph history={history} />
        <dl className="dl-stats">
          <div>
            <dt>
              <span className="swatch net" /> NETWORK
            </dt>
            <dd>{formatRate(current.net)}</dd>
            <span className="muted small">peak {formatRate(rates?.peakNet ?? 0)}</span>
          </div>
          <div>
            <dt>TOTAL DOWNLOADED</dt>
            <dd>{formatBytes(rates?.totalNet ?? 0) || "0 KB"}</dd>
            <span className="muted small">this session</span>
          </div>
          <div>
            <dt>
              <span className="swatch disk" /> DISK USAGE
            </dt>
            <dd>{formatRate(current.disk)}</dd>
            <span className="muted small">peak {formatRate(rates?.peakDisk ?? 0)}</span>
          </div>
          <div>
            <dt>TOTAL WRITTEN</dt>
            <dd>{formatBytes(rates?.totalDisk ?? 0) || "0 KB"}</dd>
            <span className="muted small">downloads and unpacking</span>
          </div>
        </dl>
      </section>

      <div className="dl-head">
        <h2 className="eyebrow">{active.length ? `IN PROGRESS (${active.length})` : "NOTHING IN PROGRESS"}</h2>
        <button type="button" className="link-button" onClick={() => onOpen({ what: "downloads" })}>
          Open downloads folder
        </button>
      </div>
      {active.map((job) => (
        <DownloadRow
          key={job.id + job.file}
          job={job}
          rate={job.state === "downloading" ? current.net : current.disk}
        />
      ))}

      {waiting.length > 0 && (
        <>
          <h2 className="eyebrow dl-section">WAITING</h2>
          {waiting.map((job) => (
            <div className="dl-row" key={job.id + job.file}>
              <div className="dl-main">
                <span className="dl-title">{job.title}</span>
                <span className="muted small">
                  {baseName(job.file)} · {formatBytes(job.total)} ·{" "}
                  {job.state === "failed" ? job.error : "downloaded, not installed"}
                </span>
              </div>
              <button type="button" className="download" disabled={!root} onClick={() => onInstall(job)}>
                {job.state === "failed" && !job.path ? "RETRY" : "INSTALL"}
              </button>
            </div>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <h2 className="eyebrow dl-section">COMPLETED</h2>
          {done.map((job) => (
            <div className="dl-row" key={job.id + job.file}>
              <div className="dl-main">
                <span className="dl-title">{job.title}</span>
                <span className="muted small">
                  {formatBytes(job.total)} downloaded
                  {job.unpackedSize ? ` · ${formatBytes(job.unpackedSize)} unpacked` : ""}
                  {job.endedAt ? ` · ${new Date(job.endedAt).toLocaleTimeString()}` : ""}
                </span>
              </div>
              <JobResult
                job={job}
                onInstalled={onInstalled}
                onOpen={(what) => onOpen({ what, id: job.id, file: job.file })}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DownloadRow({ job, rate }: { job: Job; rate: number }) {
  const progress = jobProgress(job);
  const phase = job.state === "downloading"
    ? `${formatBytes(job.received)} of ${formatBytes(job.total)}`
    : job.state === "extracting"
    ? job.unpackedSize ? `${formatBytes(job.extracted)} of ${formatBytes(job.unpackedSize)} unpacked` : "Unpacking…"
    : `Moving ${job.installing ?? "the mod"} into the library`;
  const left = job.state === "downloading" && rate > 0 ? (job.total - job.received) / rate : null;
  return (
    <div className="dl-row active">
      <div className="dl-main">
        <span className="dl-title">{job.title}</span>
        <span className="muted small">
          {jobLabel(job)} · {phase}
          {left !== null ? ` · ${formatDuration(left)} left` : ""}
        </span>
        <span className="progress wide">
          <span
            className={progress === null ? "indeterminate" : undefined}
            style={{ width: `${Math.round((progress ?? 1) * 100)}%` }}
          />
        </span>
      </div>
      <span className="dl-rate">{formatRate(rate)}</span>
    </div>
  );
}

/** Two areas over time, network and disk, scaled to the larger peak; newest on the right. */
function ThroughputGraph({ history }: { history: Throughput["history"] }) {
  const width = 600;
  const height = 120;
  const points = history.slice(-120);
  const max = Math.max(1, ...points.map((p) => Math.max(p.net, p.disk)));
  const x = (i: number) => width - (points.length - 1 - i) * (width / 119);
  const y = (value: number) => height - (value / max) * (height - 8);
  const area = (key: "net" | "disk") =>
    points.length < 2
      ? ""
      : `M${x(0)},${height} ${points.map((p, i) => `L${x(i)},${y(p[key])}`).join(" ")} L${
        x(points.length - 1)
      },${height} Z`;
  return (
    <svg
      className="dl-graph"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Throughput"
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={width}
          y1={height * f}
          y2={height * f}
          className="grid"
        />
      ))}
      <path d={area("disk")} className="disk" />
      <path d={area("net")} className="net" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
