import { formatDateTime, plural, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { CloseIcon, FilterIcon, RefreshIcon, SearchIcon } from "../../components/icons.tsx";
import type { Incoming } from "../../lib/incoming.ts";
import { readStored, writeStored } from "../../lib/util.ts";
import { Cores } from "./Cores.tsx";
import { Downloads } from "./Downloads.tsx";
import { InstallModModal } from "./InstallModModal.tsx";
import { ModCard } from "./ModCard.tsx";
import { ModDbCard } from "./ModDbCard.tsx";
import { ModDetails } from "./ModDetails.tsx";
import {
  ACTIVE,
  ARCHIVE_SORTS,
  catalogEntries,
  installableModDbUrl,
  modDbAddress,
  PAGE,
  post,
  titleFromUrl,
  titleKey,
} from "./browse-util.ts";
import type { ArchiveSort, BrowseView, Details, Group, Item, Job, ModDbItem, Source, Throughput } from "./types.ts";

/**
 * Archive and ModDB are providers for one catalog, not separate pages. Exact normalized-title
 * matches share one card; each provider keeps its own download path and safety rules behind it.
 */
/**
 * The catalog's sort and filters, kept while Exordium runs: Browse unmounts when another tab opens,
 * and coming back finds them as they were (the search itself is kept by the app).
 */
let remembered: { sort: ArchiveSort; selected: string[]; hideInstalled: boolean } = {
  sort: "all",
  selected: [],
  hideInstalled: false,
};

/** Below this width the filters float over the list instead of sitting beside it (see styles.css). */
const FLOATING_FILTERS = "(max-width: 1180px)";

export function Browse(
  {
    view,
    detailsKey,
    onDetailsKey: setDetailsKey,
    search,
    onSearch: setSearch,
    installed,
    root,
    downloads,
    onCancelDownload,
    onInstalled,
    onCoreStarted,
    onDownloadStarted,
    onExpectDraft,
  }: {
    view: BrowseView;
    /** The entry whose details page is open, by catalog key (kept by the app, for back and forward). */
    detailsKey: string | null;
    onDetailsKey: (key: string | null) => void;
    /** The search, kept by the app so it survives leaving Browse (and set by a Latest uploads card). */
    search: string;
    onSearch: (search: string) => void;
    installed: Set<string>;
    root: string | null;
    downloads: Incoming[];
    onCancelDownload: (item: Incoming) => void;
    onInstalled: (name: string) => void;
    onCoreStarted: () => void;
    onDownloadStarted: () => void;
    onExpectDraft: (key: string) => void;
  },
) {
  const [data, setData] = React.useState<
    { sources: Source[]; groups: Group[]; items: Item[]; details?: Record<string, Details> } | null
  >(null);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = React.useState(false);
  const [modDb, setModDb] = React.useState<{ items: ModDbItem[]; fetchedAt: string | null } | null>(null);
  const [modDbError, setModDbError] = React.useState<string | null>(null);
  const [modDbLoading, setModDbLoading] = React.useState(false);
  const [sort, setSort] = React.useState<ArchiveSort>(remembered.sort);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(remembered.selected));
  const [hideInstalled, setHideInstalled] = React.useState(remembered.hideInstalled);
  React.useEffect(() => {
    remembered = { sort, selected: [...selected], hideInstalled };
  }, [sort, selected, hideInstalled]);
  const [shown, setShown] = React.useState(PAGE);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [rates, setRates] = React.useState<Throughput | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [extraKeywords, setExtraKeywords] = React.useState<Record<string, string[]>>({});
  // The filters are a panel pinned beside the list (on narrow windows, floating over it); the FILTERS
  // button shows or hides it, remembered.
  const [filterOpen, setFilterOpenState] = React.useState(() => readStored<boolean>("exordium.browseFilters", true));
  const setFilterOpen = (update: boolean | ((open: boolean) => boolean)) =>
    setFilterOpenState((open) => {
      const next = typeof update === "function" ? update(open) : update;
      writeStored("exordium.browseFilters", next);
      return next;
    });
  const [linkAddress, setLinkAddress] = React.useState("");
  const [urlJobs, setUrlJobs] = React.useState<Record<string, string>>({});
  const filterMenu = React.useRef<HTMLDivElement>(null);
  const filterPanel = React.useRef<HTMLElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const [installRequest, setInstallRequest] = React.useState<
    {
      item: Item | null;
      mode: "archive" | "downloaded" | "url";
      id: string;
      file: string;
      title: string;
      url?: string;
      itemKey?: string;
    } | null
  >(null);

  // A list being fetched again behind an answer (stale cache) is asked for once more, waiting for it
  // (`?wait=1`), and swapped in quietly: no spinner, the cached cards stay until then.
  const loadArchive = React.useCallback(async (refresh = false) => {
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const response = await fetch(`/api/browse${refresh ? "?refresh=1" : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? tr("Could not reach the sources."));
      setData(body);
      if (body.refreshing) {
        void fetch("/api/browse?wait=1")
          .then((fresh) => (fresh.ok ? fresh.json() : null))
          .then((fresh) => fresh && setData(fresh))
          .catch(() => {});
      }
    } catch (error) {
      setArchiveError((error as Error).message);
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  const loadModDb = React.useCallback(async (refresh = false) => {
    setModDbLoading(true);
    setModDbError(null);
    try {
      const response = await fetch(`/api/browse/moddb${refresh ? "?refresh=1" : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? tr("Could not read ModDB."));
      setModDb({ items: body.items ?? [], fetchedAt: body.fetchedAt ?? null });
      if (body.refreshing) {
        void fetch("/api/browse/moddb?wait=1")
          .then((fresh) => (fresh.ok ? fresh.json() : null))
          .then((fresh) => fresh && setModDb({ items: fresh.items ?? [], fetchedAt: fresh.fetchedAt ?? null }))
          .catch(() => {});
      }
    } catch (error) {
      setModDbError((error as Error).message);
    } finally {
      setModDbLoading(false);
    }
  }, []);

  const refreshJobs = React.useCallback(async () => {
    const response = await fetch("/api/browse/downloads");
    if (!response.ok) return;
    const body = await response.json();
    setJobs(body.jobs);
    setRates(body);
  }, []);

  React.useEffect(() => void refreshJobs(), [refreshJobs]);
  React.useEffect(() => {
    if (view !== "catalog") return;
    if (!data && !archiveLoading && !archiveError) void loadArchive();
    if (!modDb && !modDbLoading && !modDbError) void loadModDb();
  }, [view, data, archiveLoading, archiveError, loadArchive, modDb, modDbLoading, modDbError, loadModDb]);

  // Archive contents add core, language and loader tags after the lightweight list has appeared.
  const [reading, setReading] = React.useState<{ done: number; total: number } | null>(null);
  React.useEffect(() => {
    if (!data) return;
    let stopped = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch("/api/browse/keywords");
        if (!response.ok || stopped) return;
        const body = await response.json() as { keywords: Record<string, string[]>; done: number; total: number };
        setExtraKeywords((known) => ({ ...known, ...body.keywords }));
        setReading({ done: body.done, total: body.total });
        if (body.done < body.total) timer = setTimeout(poll, 4000);
      } catch {
        // Cards still add their own tags when they enter view.
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [data]);

  const busy = jobs.some((job) => ACTIVE.includes(job.state));
  React.useEffect(() => {
    if (!busy && view !== "downloads") return;
    const timer = setInterval(() => void refreshJobs(), 1000);
    return () => clearInterval(timer);
  }, [busy, view, refreshJobs]);

  React.useEffect(() => setShown(PAGE), [view, sort, search, selected, hideInstalled]);
  React.useEffect(() => {
    if (!filterOpen) return;
    const close = (event: Event) => {
      if (!globalThis.matchMedia(FLOATING_FILTERS).matches) return;
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      const target = event.target as Node;
      if (filterMenu.current?.contains(target) || filterPanel.current?.contains(target)) return;
      setFilterOpenState(false);
    };
    globalThis.addEventListener("mousedown", close);
    globalThis.addEventListener("keydown", close);
    return () => {
      globalThis.removeEventListener("mousedown", close);
      globalThis.removeEventListener("keydown", close);
    };
  }, [filterOpen]);

  const keywordsOf = React.useCallback(
    (item: Item) => [...new Set([...item.keywords, ...(extraKeywords[item.id] ?? [])])],
    [extraKeywords],
  );
  const catalog = React.useMemo(() => catalogEntries(data?.items ?? [], modDb?.items ?? []), [data, modDb]);
  const entryKeywords = React.useCallback(
    (entry: (typeof catalog)[number]) => [
      ...new Set([
        ...(entry.archive ? keywordsOf(entry.archive) : []),
        ...entry.moddbVariants.flatMap((item) => item.keywords),
      ]),
    ],
    [keywordsOf],
  );
  const entryInstalled = React.useCallback(
    (entry: (typeof catalog)[number]) => installed.has(titleKey(entry.title)),
    [installed],
  );
  const matches = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog.filter((entry) => {
      const words = [
        entry.title,
        entry.archive?.description,
        entry.archive?.creator,
        ...entry.moddbVariants.flatMap((item) => [item.title, item.description]),
      ]
        .filter(Boolean).join("\n").toLowerCase();
      if (needle && !words.includes(needle)) return false;
      if (hideInstalled && entryInstalled(entry)) return false;
      const keywords = entryKeywords(entry);
      for (const keyword of selected) if (!keywords.includes(keyword)) return false;
      return true;
    });
  }, [catalog, search, hideInstalled, entryInstalled, entryKeywords, selected]);
  const sorted = React.useMemo(() => {
    const entries = [...matches];
    if (sort === "popular") {
      entries.sort((a, b) => (b.archive?.downloads ?? 0) - (a.archive?.downloads ?? 0));
    } else if (sort === "recent") {
      const newest = (entry: (typeof entries)[number]) =>
        [entry.archive?.addedAt, ...entry.moddbVariants.map((item) => item.addedAt)].filter(Boolean).sort().at(-1) ??
          "";
      entries.sort((a, b) => newest(b).localeCompare(newest(a)));
    } else entries.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    return entries;
  }, [matches, sort]);
  const counts = React.useMemo(() => {
    const result = new Map<string, number>();
    for (const keywords of matches.map(entryKeywords)) {
      for (const keyword of keywords) result.set(keyword, (result.get(keyword) ?? 0) + 1);
    }
    return result;
  }, [matches, entryKeywords]);
  React.useEffect(() => {
    const sentinel = loadMoreRef.current;
    const root = listRef.current;
    if (!sentinel || !root || shown >= sorted.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setShown((count) => Math.min(count + PAGE, sorted.length));
    }, { root, rootMargin: "0px 0px 600px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [shown, sorted.length]);
  const labels = new Map(data?.groups.flatMap((group) => group.keywords.map((k) => [k.id, k.label] as const)) ?? []);
  const archiveFetchedAt = data?.sources.find((source) => source.id === "archive")?.fetchedAt ?? null;

  const toggle = (keyword: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
    listRef.current?.scrollTo({ top: 0 });
  };
  const openPlace = (body: unknown) => void post("/api/browse/open", body).catch(() => {});
  const linkUrl = modDbAddress(linkAddress);
  const linkOk = linkUrl ? installableModDbUrl(linkUrl) : false;

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
    if (request.itemKey && typeof body.id === "string") {
      setUrlJobs((current) => ({ ...current, [request.itemKey!]: body.id }));
    }
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

  async function startInstall(
    request: NonNullable<typeof installRequest>,
    installRoot: string,
    importMetadata: boolean,
  ) {
    localStorage.setItem("exordium.installRoot", installRoot);
    await (request.mode === "url"
      ? installUrl(request, installRoot, importMetadata)
      : install(request, installRoot, importMetadata));
    setInstallRequest(null);
  }

  const coverOf = (job: Job) =>
    data?.items.find((item) => item.id === job.id)?.cover ??
      modDb?.items.find((item) => urlJobs[`moddb:${item.kind}:${item.id}`] === job.id)?.cover ??
      null;

  if (view === "cores") {
    return (
      <div className="browse browse-standalone-page">
        <section className="browse-main browse-centered-page">
          <Cores root={root} onStarted={onCoreStarted} />
        </section>
      </div>
    );
  }
  if (view === "downloads") {
    return (
      <div className="browse browse-standalone-page">
        <section className="browse-main browse-centered-page">
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
        </section>
      </div>
    );
  }

  const refreshing = archiveLoading || modDbLoading;
  const detailsEntry = detailsKey ? catalog.find((entry) => entry.key === detailsKey) ?? null : null;
  // The details page takes the whole catalog width: the filters step aside while it is open.
  const showFilters = filterOpen && !detailsEntry;
  const closeDetails = () => setDetailsKey(null);
  return (
    <div className={showFilters ? "browse browse-catalog filters-open" : "browse browse-catalog"}>
      {installRequest && (
        <InstallModModal
          request={installRequest}
          defaultRoot={root ?? ""}
          onClose={() => setInstallRequest(null)}
          onInstall={(installRoot, importMetadata) => startInstall(installRequest, installRoot, importMetadata)}
        />
      )}
      {showFilters && (
        <aside id="browse-filter-menu" className="browse-filter-menu browse-filter-panel" ref={filterPanel}>
          <div className="browse-filter-menu-head">
            <strong>{tr("Filters")}</strong>
            {(selected.size > 0 || hideInstalled) && (
              <button
                type="button"
                className="small-button"
                onClick={() => {
                  setSelected(new Set());
                  setHideInstalled(false);
                }}
              >
                {tr("Clear")}
              </button>
            )}
          </div>
          <p className="muted small">{plural(matches.length, "{count} match", "{count} matches")}</p>
          {data?.groups.map((group) => (
            <section key={group.id} className="filter-group">
              <h3>{group.label}</h3>
              {group.keywords.map((keyword) => {
                const count = counts.get(keyword.id) ?? 0;
                const on = selected.has(keyword.id);
                if (!on && count === 0) return null;
                return (
                  <label key={keyword.id} className="browse-filter-check">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(keyword.id)}
                    />
                    <span>{keyword.label}</span>
                    <small>{count}</small>
                  </label>
                );
              })}
            </section>
          ))}
          <section className="filter-group">
            <h3>{tr("PREFERENCES")}</h3>
            <label className="browse-filter-check">
              <input
                type="checkbox"
                checked={hideInstalled}
                onChange={(event) =>
                  setHideInstalled(event.currentTarget.checked)}
              />
              <span>{tr("Hide installed mods")}</span>
            </label>
          </section>
          <section className="filter-group">
            <h3>{tr("FROM A LINK")}</h3>
            <form
              className="link-install"
              onSubmit={(event) => {
                event.preventDefault();
                if (!linkUrl || !linkOk) {
                  return;
                }
                queueUrlInstall(linkUrl, titleFromUrl(linkUrl));
                setLinkAddress("");
              }}
            >
              <input
                value={linkAddress}
                onChange={(event) =>
                  setLinkAddress(event.currentTarget.value)}
                placeholder={tr("ModDB page or archive link")}
                aria-label={tr("Download address")}
              />
              <button type="submit" className="ghost primary action-install compact" disabled={!linkOk || !root}>
                {tr("Install")}
              </button>
            </form>
            {linkAddress.trim() && !linkOk && (
              <p className="warn-text small">
                {tr("Use a ModDB mod, addon or download page, or a link to an archive.")}
              </p>
            )}
          </section>
        </aside>
      )}
      <section className="browse-main browse-catalog-shell">
        <nav className="browse-tabs browse-catalog-toolbar">
          <div className="browse-sort-tabs">
            {ARCHIVE_SORTS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={sort === entry.id ? "browse-tab on" : "browse-tab"}
                onClick={() => setSort(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="browse-filter-holder" ref={filterMenu}>
            <button
              type="button"
              className={filterOpen || selected.size > 0 || hideInstalled
                ? "browse-filter-button on"
                : "browse-filter-button"}
              aria-label={tr("Filters")}
              data-tooltip={tr("Filters")}
              aria-expanded={filterOpen}
              aria-controls="browse-filter-menu"
              onClick={() => setFilterOpen((open) => !open)}
            >
              <FilterIcon />
              <span>{tr("FILTERS")}</span>
              {(selected.size > 0 || hideInstalled) && <small>{selected.size + Number(hideInstalled)}</small>}
            </button>
          </div>
          <div className="search browse-search">
            <SearchIcon />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setDetailsKey(null);
              }}
              placeholder={tr("Search by name…")}
              aria-label={tr("Search mods")}
            />
            {search && (
              <button
                type="button"
                className="search-clear-button"
                aria-label={tr("Clear")}
                data-tooltip={tr("Clear")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setSearch("")}
              >
                <CloseIcon />
              </button>
            )}
          </div>
          <button
            type="button"
            className={`browse-refresh ${refreshing ? "loading" : ""}`}
            disabled={refreshing}
            data-tooltip={tr("Refresh sources")}
            aria-label={tr("Refresh sources")}
            onClick={() => void Promise.all([loadArchive(true), loadModDb(true)])}
          >
            <RefreshIcon />
          </button>
        </nav>

        {detailsEntry && (
          <ModDetails
            key={detailsEntry.key}
            entry={detailsEntry}
            cached={detailsEntry.archive ? data?.details?.[detailsEntry.archive.id] ?? null : null}
            labels={labels}
            keywords={entryKeywords(detailsEntry)}
            installed={entryInstalled(detailsEntry)}
            jobs={detailsEntry.archive
              ? jobs.filter((job) => job.id === detailsEntry.archive!.id)
              : jobs.filter((job) => job.source === "url" && job.id === urlJobs[detailsEntry.key])}
            root={root}
            onBack={closeDetails}
            onDetails={(details) =>
              setExtraKeywords((known) => known[details.id] ? known : { ...known, [details.id]: details.keywords })}
            onInstallArchive={(item, file, fromDisk) => queueInstall(item, item.id, file, item.title, fromDisk)}
            onInstallUrl={(url, title) => queueUrlInstall(url, title, detailsEntry.key)}
            onInstalled={onInstalled}
            onOpenArchive={(what, file) => openPlace({ what, id: detailsEntry.archive?.id, file })}
            onOpenJob={(what, job) => openPlace({ what, id: job.id, file: job.file })}
            onKeyword={(keyword) => {
              closeDetails();
              toggle(keyword);
            }}
          />
        )}
        <div ref={listRef} className="browse-list browse-catalog-list" hidden={detailsEntry !== null}>
          {(selected.size > 0 || hideInstalled) && (
            <div className="active-filters browse-active-filters">
              {[...selected].map((keyword) => (
                <button
                  type="button"
                  key={keyword}
                  className="active-filter"
                  onClick={() => toggle(keyword)}
                >
                  x {labels.get(keyword) ?? keyword}
                </button>
              ))}
              {hideInstalled && (
                <button
                  type="button"
                  className="active-filter"
                  onClick={() => setHideInstalled(false)}
                >
                  x {tr("Hide installed mods")}
                </button>
              )}
            </div>
          )}
          <p className="muted small browse-catalog-notice">
            {tr(
              "Installers (.exe) are never run for you: open their page and install them yourself if you trust them.",
            )}
            <br />
            {tr("Tags, game versions and other details are inferred from each upload and may be wrong.")}
            {(archiveFetchedAt || modDb?.fetchedAt) && (
              <>
                <br />
                {[
                  archiveFetchedAt ? `Internet Archive: ${formatDateTime(archiveFetchedAt)}` : null,
                  modDb?.fetchedAt ? `ModDB: ${formatDateTime(modDb.fetchedAt)}` : null,
                ].filter(Boolean).join(" · ")}
              </>
            )}
            {reading && reading.done < reading.total && tr(" · reading archives {done} of {total}", reading)}
          </p>
          {archiveError && <div className="banner-error" role="alert">Internet Archive: {archiveError}</div>}
          {modDbError && <div className="banner-error" role="alert">ModDB: {modDbError}</div>}
          {!data && !modDb && !archiveError && !modDbError && <p className="muted pad">{tr("Reading sources…")}</p>}
          {(data || modDb) && sorted.length === 0 && <p className="muted pad">{tr("Nothing matches these filters.")}
          </p>}
          {sorted.slice(0, shown).map((entry) => {
            if (entry.archive) {
              const item = entry.archive;
              return (
                <ModCard
                  key={entry.key}
                  item={item}
                  modDb={entry.moddb}
                  cached={data?.details?.[item.id] ?? null}
                  labels={labels}
                  keywords={entryKeywords(entry)}
                  installed={entryInstalled(entry)}
                  expanded={open[entry.key] ?? false}
                  onExpand={() => setOpen((current) => ({ ...current, [entry.key]: !current[entry.key] }))}
                  jobs={jobs.filter((job) => job.id === item.id)}
                  root={root}
                  onDetails={(details) =>
                    setExtraKeywords((known) => known[item.id] ? known : { ...known, [item.id]: details.keywords })}
                  onInstall={(file, fromDisk) => queueInstall(item, item.id, file, item.title, fromDisk)}
                  onInstalled={onInstalled}
                  onOpen={(what, file) => openPlace({ what, id: item.id, file })}
                  onKeyword={toggle}
                  onOpenDetails={() => setDetailsKey(entry.key)}
                />
              );
            }
            const item = entry.moddb!;
            return (
              <ModDbCard
                key={entry.key}
                item={item}
                variants={entry.moddbVariants}
                labels={labels}
                installed={entryInstalled(entry)}
                expanded={open[entry.key] ?? false}
                onExpand={() => setOpen((current) => ({ ...current, [entry.key]: !current[entry.key] }))}
                jobs={jobs.filter((job) => job.source === "url" && job.id === urlJobs[entry.key])}
                root={root}
                onInstall={(url) => queueUrlInstall(url, item.title, entry.key)}
                onInstalled={onInstalled}
                onOpen={(what, job) => openPlace({ what, id: job.id, file: job.file })}
                onKeyword={toggle}
                onOpenDetails={() => setDetailsKey(entry.key)}
              />
            );
          })}
          {sorted.length > shown && <div ref={loadMoreRef} className="browse-load-sentinel" aria-hidden="true" />}
        </div>
      </section>
    </div>
  );
}
