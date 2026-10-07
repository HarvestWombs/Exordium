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

type BrowseTab = "all" | "popular" | "recent" | "cores" | "downloads";

const TABS: { id: BrowseTab; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "popular", label: "MOST DOWNLOADED" },
  { id: "recent", label: "RECENTLY ADDED" },
  { id: "cores", label: "CORES" },
  { id: "downloads", label: "DOWNLOADS" },
];

const PAGE = 20;
const ACTIVE: JobState[] = ["downloading", "extracting", "installing"];

/** Titles compared without case, spaces or punctuation: "The Black Soul" is "theblacksoul". */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const baseName = (file: string) => file.split("/").pop() ?? file;

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
  { installed, root, onInstalled, onCoreInstalled }: {
    installed: Set<string>;
    /** The D2SE install mods are installed into (its MODS folder). */
    root: string | null;
    /** A mod was installed as MODS\<name>: rescan and show it. */
    onInstalled: (name: string) => void;
    /** A core was installed as D2SE\CORES\<core>: rescan and show it. */
    onCoreInstalled: (core: string) => void;
  },
) {
  const [data, setData] = React.useState<{ sources: Source[]; groups: Group[]; items: Item[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState<BrowseTab>("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [hideInstalled, setHideInstalled] = React.useState(false);
  const [shown, setShown] = React.useState(PAGE);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [rates, setRates] = React.useState<Throughput | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [extraKeywords, setExtraKeywords] = React.useState<Record<string, string[]>>({});

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
    if (!busy && tab !== "downloads") return;
    const timer = setInterval(() => void refreshJobs(), 1000);
    return () => clearInterval(timer);
  }, [busy, tab, refreshJobs]);

  React.useEffect(() => setShown(PAGE), [tab, search, selected, hideInstalled]);

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
    if (tab === "popular") list.sort((a, b) => b.downloads - a.downloads);
    else if (tab === "recent") list.sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
    else list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    return list;
  }, [matches, tab]);

  // How many of the current matches each keyword would keep: the numbers beside the filters.
  const counts = React.useMemo(() => {
    const result = new Map<string, number>();
    for (const item of matches) {
      for (const keyword of keywordsOf(item)) result.set(keyword, (result.get(keyword) ?? 0) + 1);
    }
    return result;
  }, [matches, keywordsOf]);

  const toggle = (keyword: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });

  const labels = new Map(data?.groups.flatMap((group) => group.keywords.map((k) => [k.id, k.label] as const)) ?? []);
  const openPlace = (body: unknown) => void post("/api/browse/open", body).catch(() => {});

  async function install(item: Item | null, id: string, file: string, title: string, fromDisk: boolean) {
    if (!root) return;
    const target = `${root}\\MODS`;
    const what = fromDisk ? `Unpack ${baseName(file)}` : `Download ${baseName(file)}, unpack it,`;
    if (
      !confirm(
        `${what} and install it into ${target}?\n\nThe archive is deleted once unpacked. Existing mod folders are never overwritten.`,
      )
    ) {
      return;
    }
    const response = await post(fromDisk ? "/api/browse/install" : "/api/browse/download", {
      id,
      file,
      root,
      title: item?.title ?? title,
    });
    if (!response.ok) alert((await response.json()).error ?? "It did not start.");
    await refreshJobs();
  }

  return (
    <div className="browse">
      <aside className="browse-filters">
        <h2 className="filters-title">FILTERS</h2>
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
        <p className="muted small">{data ? `${matches.length} matches` : loading ? "Reading sources…" : ""}</p>

        <section className="filter-group">
          <h3>SOURCES</h3>
          {data?.sources.map((source) =>
            source.external
              ? (
                <div key={source.id} className="source-row external">
                  <span>{source.name}</span>
                  <button type="button" className="link-button" onClick={() => openPlace({ what: "moddb" })}>
                    Open ↗
                  </button>
                  <p className="muted small">
                    ModDB does not allow apps to read or download from it. Browse it in your web browser and download
                    from there.
                  </p>
                </div>
              )
              : (
                <div key={source.id} className="source-row">
                  <span>{source.name}</span>
                  <span className="muted small">{source.count}</span>
                </div>
              )
          )}
        </section>

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
          <button type="button" className="filter-row" disabled={loading} onClick={() => void load(true)}>
            <span>{loading ? "Refreshing…" : "Refresh sources"}</span>
          </button>
        </section>
      </aside>

      <section className="browse-main">
        <nav className="browse-tabs">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              className={tab === t.id ? "browse-tab on" : "browse-tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "downloads" && busy ? " ·  ●" : ""}
            </button>
          ))}
          <div className="grow" />
          {tab !== "downloads" && tab !== "cores" && (
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

        {tab === "cores" && <Cores root={root} onInstalled={onCoreInstalled} />}
        {tab === "cores" ? null : tab === "downloads"
          ? (
            <Downloads
              jobs={jobs}
              rates={rates}
              root={root}
              onInstall={(job) => void install(null, job.id, job.file, job.title, job.state === "downloaded")}
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
                  onInstall={(file, fromDisk) => void install(item, item.id, file, item.title, fromDisk)}
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
  const [shot, setShot] = React.useState(0);
  const [gallery, setGallery] = React.useState(false);

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
                <img className="shot-main" src={shots[shot]?.full} alt="" />
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
          : <div className="shot-empty muted small">{details ? "No screenshots" : detailsError ?? "…"}</div>}
        {gallery && (
          <Lightbox
            images={shots.map((s) => ({ src: s.full, thumb: s.thumb }))}
            start={shot}
            onClose={() => setGallery(false)}
          />
        )}
      </div>

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
    : `Moving ${job.installing ?? "the mod"} into MODS`;
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
