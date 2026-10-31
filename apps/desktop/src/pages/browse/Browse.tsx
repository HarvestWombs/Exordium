import { formatDateTime, plural, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { RefreshIcon } from "../../components/icons.tsx";
import { Cores } from "./Cores.tsx";
import { Downloads } from "./Downloads.tsx";
import { InstallModModal } from "./InstallModModal.tsx";
import { ModCard } from "./ModCard.tsx";
import { ModDbCard } from "./ModDbCard.tsx";
import {
  ACTIVE,
  ARCHIVE_SORTS,
  installableModDbUrl,
  MODDB_KINDS,
  modDbAddress,
  PAGE,
  post,
  titleFromUrl,
  titleKey,
} from "./browse-util.ts";
import type { Incoming } from "../../lib/incoming.ts";
import type { ArchiveSort, BrowseView, Group, Item, Job, ModDbItem, ModDbKind, Source, Throughput } from "./types.ts";

/**
 * The mod browser: every source's entries in one list, filtered by common keywords, laid out like a
 * store page. The server (browse.ts) does the fetching; this page only asks for what is on screen.
 * Installing is one step: download, unpack with progress, move into MODS, delete the archive.
 */
export function Browse(
  {
    view,
    onView,
    initialSearch,
    installed,
    root,
    downloads,
    onCancelDownload,
    onInstalled,
    onCoreStarted,
    onDownloadStarted,
    onExpectDraft,
  }: {
    /** The page showing, which the top bar's menus choose too. */
    view: BrowseView;
    onView: (view: BrowseView) => void;
    /** What the search box starts with: a Latest uploads card opens on its upload. */
    initialSearch?: string;
    installed: Set<string>;
    /** The D2SE install mods are installed into (its MODS folder). */
    root: string | null;
    /** Everything on its way in, for Downloads to list. */
    downloads: Incoming[];
    onCancelDownload: (item: Incoming) => void;
    /** A mod was installed as MODS\<name>: rescan and show it. */
    onInstalled: (name: string) => void;
    /** A core's install has started, for the library to follow. */
    onCoreStarted: () => void;
    /** A download has started, for the library to follow. */
    onDownloadStarted: () => void;
    /** Once this download is in, draft its exordium.mod.json. */
    onExpectDraft: (key: string) => void;
  },
) {
  const [data, setData] = React.useState<{ sources: Source[]; groups: Group[]; items: Item[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [archiveSort, setArchiveSort] = React.useState<ArchiveSort>("all");
  const [search, setSearch] = React.useState(initialSearch ?? "");
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
      mode: "archive" | "downloaded" | "url";
      id: string;
      file: string;
      title: string;
      url?: string;
      /** The ModDB card the download was started from, so it can show the job. */
      itemKey?: string;
    } | null
  >(null);
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
      if (!response.ok) throw new Error(body.error ?? tr("Could not read ModDB."));
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
      if (!response.ok) throw new Error(body.error ?? tr("Could not reach the sources."));
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

  async function install(request: NonNullable<typeof installRequest>, installRoot: string, importMetadata: boolean) {
    const response = await post(request.mode === "downloaded" ? "/api/browse/install" : "/api/browse/download", {
      id: request.id,
      file: request.file,
      root: installRoot,
      title: request.item?.title ?? request.title,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? tr("It did not start."));
    if (importMetadata) onExpectDraft(`${request.id}/${request.file}`);
    onDownloadStarted();
    await refreshJobs();
  }

  async function installUrl(request: NonNullable<typeof installRequest>, installRoot: string, importMetadata: boolean) {
    const response = await post("/api/browse/url-download", {
      url: request.url ?? request.file,
      root: installRoot,
      title: request.title,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? tr("It did not start."));
    const itemKey = request.itemKey;
    if (itemKey && typeof body.id === "string") setUrlJobs((current) => ({ ...current, [itemKey]: body.id }));
    if (importMetadata) onExpectDraft(`${body.id ?? request.id}/${body.file ?? request.file}`);
    onDownloadStarted();
    await refreshJobs();
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
      title: title.trim() || tr("ModDB download"),
      mode: "url",
      ...(itemKey ? { itemKey } : {}),
    });
  }

  /** A download's picture, from the listing it was started from. */
  const coverOf = (job: Job) =>
    data?.items.find((item) => item.id === job.id)?.cover ??
      modDb?.items.find((item) => urlJobs[`moddb:${item.kind}:${item.id}`] === job.id)?.cover ??
      null;

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
            installRequest.mode === "url"
              ? installQueuedUrl(installRoot, importMetadata)
              : startInstall(installRequest, installRoot, importMetadata)}
        />
      )}
      <aside className="browse-filters" hidden={view === "downloads"}>
        <section className="source-switch">
          <h2 className="filters-title">{tr("SOURCES")}</h2>
          <button
            type="button"
            className={view === "archive" ? "source-card on" : "source-card"}
            onClick={() => onView("archive")}
          >
            <span>Internet Archive</span>
            <small>
              {data
                ? tr("{count} indexed mods", { count: data.items.length })
                : loading
                ? tr("Reading…")
                : tr("Archive catalog")}
            </small>
          </button>
          <button
            type="button"
            className={view === "moddb" ? "source-card on" : "source-card"}
            onClick={() => onView("moddb")}
          >
            <span>ModDB</span>
            <small>{tr("Files, addons, and mods")}</small>
          </button>
          <button
            type="button"
            className={view === "cores" ? "source-card on" : "source-card"}
            onClick={() => onView("cores")}
          >
            <span>{tr("Cores")}</span>
            <small>{tr("Install game versions")}</small>
          </button>
        </section>

        {(view === "archive" || view === "moddb") && (
          <>
            <h2 className="filters-title filters-title-secondary">{tr("FILTERS")}</h2>
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
                ? modDb
                  ? plural(modDbMatches.length, "{count} match", "{count} matches")
                  : modDbLoading
                  ? tr("Reading ModDB…")
                  : ""
                : data
                ? plural(matches.length, "{count} match", "{count} matches")
                : loading
                ? tr("Reading sources…")
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
              <h3>{tr("PREFERENCES")}</h3>
              <button
                type="button"
                className={hideInstalled ? "filter-row on" : "filter-row"}
                onClick={() => setHideInstalled((v) => !v)}
              >
                <span>{tr("Hide installed mods")}</span>
              </button>
              {view === "moddb" && (
                <button
                  type="button"
                  className="filter-row"
                  onClick={() => openPlace({ what: "moddb" })}
                >
                  <span>{tr("Open ModDB ↗")}</span>
                </button>
              )}
            </section>

            {view === "moddb" && (
              <section className="filter-group">
                <h3>{tr("FROM A LINK")}</h3>
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
                    placeholder={tr("ModDB page or archive link")}
                    aria-label={tr("Download address")}
                  />
                  <button
                    type="submit"
                    className="ghost primary action-install compact"
                    disabled={!linkOk || !root}
                  >
                    {tr("Install")}
                  </button>
                </form>
                {linkAddress.trim() && !linkOk && (
                  <p className="warn-text small">
                    {tr("Use a ModDB mod, addon or download page, or a link to an archive.")}
                  </p>
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
          {view === "cores" && <span className="browse-context">{tr("CORES")}</span>}
          {view === "downloads" && <span className="browse-context">{tr("DOWNLOADS")}</span>}
          <div className="grow" />
          {(view === "archive" || view === "moddb") && (
            <>
              <label className="search browse-search">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  placeholder={tr("Search by name…")}
                  aria-label={tr("Search mods")}
                />
              </label>
              <button
                type="button"
                className={`browse-refresh ${(view === "moddb" ? modDbLoading : loading) ? "loading" : ""}`}
                disabled={view === "moddb" ? modDbLoading : loading}
                title={view === "moddb" ? tr("Refresh ModDB") : tr("Refresh Internet Archive")}
                aria-label={view === "moddb" ? tr("Refresh ModDB") : tr("Refresh Internet Archive")}
                onClick={() => void (view === "moddb" ? loadModDb(true) : load(true))}
              >
                <RefreshIcon />
              </button>
            </>
          )}
        </nav>

        {view === "cores" && <Cores root={root} onStarted={onCoreStarted} />}
        {view === "moddb" && (
          <div className="browse-list">
            {modDbError && <div className="banner-error" role="alert">{modDbError}</div>}
            {!modDb && !modDbError && <p className="muted pad">{tr("Reading ModDB…")}</p>}
            {modDb && modDbMatches.length === 0 && <p className="muted pad">{tr("Nothing matches these filters.")}</p>}
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
                {tr("Show more ({count} left)", { count: modDbMatches.length - shown })}
              </button>
            )}
            {modDb && (
              <p className="muted small pad">
                {tr(
                  "Installers (.exe) are never run for you: open their page and install them yourself if you trust them.",
                )}
                {modDb.fetchedAt &&
                  tr(" ModDB read {date}.", { date: formatDateTime(modDb.fetchedAt) })}
              </p>
            )}
          </div>
        )}
        {view === "cores" || view === "moddb" ? null : view === "downloads"
          ? (
            <Downloads
              downloads={downloads}
              coverOf={coverOf}
              onCancel={onCancelDownload}
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
              {!data && !error && <p className="muted pad">{tr("Reading sources…")}</p>}
              {data && sorted.length === 0 && <p className="muted pad">{tr("Nothing matches these filters.")}</p>}
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
                  {tr("Show more ({count} left)", { count: sorted.length - shown })}
                </button>
              )}
            </div>
          )}
      </section>
    </div>
  );
}
