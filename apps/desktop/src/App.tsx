import { plural, tr } from "./lib/i18n.ts";
import * as React from "react";
import { Browse } from "./pages/browse/Browse.tsx";
import { titleKey } from "./pages/browse/browse-util.ts";
import { StatusBar } from "./components/StatusBar.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { TooltipLayer } from "./components/TooltipLayer.tsx";
import { ConfirmDialog, NameDialog } from "./components/dialogs.tsx";
import { TitleMenu } from "./components/menus.tsx";
import { SectionMenu } from "./components/SectionMenu.tsx";
import { TitleRow } from "./components/sidebar.tsx";
import { type AppView, type LibraryPage, TopBar } from "./components/TopBar.tsx";
import { ResizeHandles } from "./components/WindowChrome.tsx";
import { useAppWindow, usePageHousekeeping } from "./hooks/useAppWindow.ts";
import { useCollections } from "./hooks/useCollections.ts";
import { useConversions } from "./hooks/useConversions.ts";
import { useCoreDownloads } from "./hooks/useCoreDownloads.ts";
import { useDownloads } from "./hooks/useDownloads.ts";
import { useImports } from "./hooks/useImports.ts";
import { useSidebarLayout } from "./hooks/useSidebarLayout.ts";
import { useTitleActions } from "./hooks/useTitleActions.ts";
import { useToasts } from "./hooks/useToasts.ts";
import { loadUploads } from "./lib/latest-uploads.ts";
import { libraryView } from "./lib/library-view.ts";
import { runningSummary } from "./lib/util.ts";
import { D2SEConverter } from "./pages/D2SEConverter.tsx";
import { HelpPage, type HelpPageId } from "./pages/help/Help.tsx";
import { ImportDialog } from "./pages/ImportDialog.tsx";
import { LatestUploads, pendingUpdates } from "./pages/library/LatestUploads.tsx";
import { LibraryGrid } from "./pages/library/LibraryGrid.tsx";
import { Sidebar, type SidebarAppearance } from "./pages/library/Sidebar.tsx";
import { Properties } from "./pages/properties/Properties.tsx";
import { AppSettings } from "./pages/settings/Settings.tsx";
import { SetupPage } from "./pages/Setup.tsx";
import { ImportPage } from "./pages/title/ImportPage.tsx";
import { TitlePage } from "./pages/title/TitlePage.tsx";
import { applyUpdate } from "./pages/Updates.tsx";
import type { Incoming } from "./lib/incoming.ts";
import type { BrowseView } from "./pages/browse/types.ts";
import type {
  Collection,
  ConfirmRequest,
  DialogPage,
  Filter,
  NameRequest,
  Scan,
  SettingsSection,
  SidebarSection,
  Status,
  Tab,
  Title,
} from "./types.ts";

function preparationSummary(progress: Status["preparing"][number] | undefined): string | null {
  if (!progress) return null;
  if (progress.phase === "checking") {
    return progress.current !== null && progress.total
      ? tr("Checking {title}'s files — {percent}%", {
        title: progress.title,
        percent: Math.min(100, Math.round((progress.current / progress.total) * 100)),
      })
      : tr("Checking {title}'s files…", { title: progress.title });
  }
  if (progress.phase === "building") {
    return progress.current !== null && progress.total !== null
      ? tr("Building {title}'s box — {current} of {total}", {
        title: progress.title,
        current: progress.current,
        total: progress.total,
      })
      : tr("Building {title}'s box…", { title: progress.title });
  }
  if (progress.phase === "registry") return tr("Preparing {title}'s settings…", { title: progress.title });
  if (progress.phase === "loader") return tr("Preparing {title}'s loader…", { title: progress.title });
  return tr("Starting {title}…", { title: progress.title });
}

/**
 * Exordium's page: the top bar and its four views (Library, Browse, Settings, Help), first-launch
 * setup, and the dialogs any view can open. What the library shows is worked out in libraryView; the
 * collections, imports, title actions and window are hooks of their own.
 */
export function App() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [root, setRoot] = React.useState<string | null>(null);
  const [scan, setScan] = React.useState<Scan | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [view, setView] = React.useState<AppView>("library");
  // The main area is the library's home, a grid of every title, until one is opened.
  const [gridHome, setGridHome] = React.useState(true);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<Set<Filter>>(() => new Set());
  const [sidebarSearch, setSidebarSearch] = React.useState("");
  const [homeSearch, setHomeSearch] = React.useState("");
  // The one sidebar section shown alone (View only), if any.
  const [solo, setSolo] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [dialog, setDialog] = React.useState<DialogPage | null>(null);
  const [starting, setStarting] = React.useState<string | null>(null);
  // A short line in the status bar for what Exordium is doing right now (e.g. a launch in progress),
  // since Play only turns to "Starting" and the box build that follows can take many seconds.
  const [activity, setActivity] = React.useState<string | null>(null);
  const { toasts, toast, dismissToast } = useToasts();
  // The D2SE reminder, closed with ×: back next time Exordium opens.
  const [reminderClosed, setReminderClosed] = React.useState(false);
  const [updateLater, setUpdateLater] = React.useState<string | null>(null);
  const [browsePage, setBrowsePage] = React.useState<BrowseView>("archive");
  const [libraryPage, setLibraryPage] = React.useState<LibraryPage>("home");
  const [settingsSection, setSettingsSection] = React.useState<SettingsSection>("library");
  const [helpPage, setHelpPage] = React.useState<HelpPageId>("start");
  // What Browse opens filtered to: a Latest uploads card opens its upload.
  const [browseSearch, setBrowseSearch] = React.useState("");
  const [converterOpen, setConverterOpen] = React.useState(false);
  // The converter is a page of the library: left for another page, it stays open behind it.
  const [reviewShown, setReviewShown] = React.useState(false);
  // The import whose page is open, until the mod's own page can replace it.
  const [importPage, setImportPage] = React.useState<string | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  // The title menu, and the collection it was opened in (its row there), which it can be removed from.
  const [menu, setMenu] = React.useState<{ x: number; y: number; t: Title; from?: Collection } | null>(null);
  const [sectionMenu, setSectionMenu] = React.useState<{ x: number; y: number; section: SidebarSection } | null>(null);
  const [confirmBox, setConfirmBox] = React.useState<ConfirmRequest | null>(null);
  const [nameDialog, setNameDialog] = React.useState<NameRequest | null>(null);
  const [artVersion, setArtVersion] = React.useState(0);

  const { desktop, maximized, setMaximized, systemLight, toggleMaximize } = useAppWindow();
  usePageHousekeeping();
  const { collapsed, rail, fold, toggleSection, toggleRail } = useSidebarLayout();

  const titles = React.useMemo(() => [...(scan?.mods ?? []), ...(scan?.cores ?? [])], [scan]);
  const selected = titles.find((t) => t.key === selectedKey) ?? null;
  const runningKeys = new Set(status?.running.map((r) => r.key) ?? []);

  const refreshStatus = React.useCallback(async () => {
    const next = await (await fetch("/api/status")).json() as Status;
    setStatus(next);
    return next;
  }, []);

  const load = React.useCallback(async (installRoot: string): Promise<boolean> => {
    setScanning(true);
    try {
      const response = await fetch(`/api/scan-d2se?root=${encodeURIComponent(installRoot)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? tr("Could not read that install."));
      setScan(body);
      await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: installRoot }),
      });
      return true;
    } catch (err) {
      toast((err as Error).message);
      return false;
    } finally {
      setScanning(false);
    }
  }, [toast]);

  // Start where the player left off: the saved library, and the title played last.
  React.useEffect(() => {
    void (async () => {
      const first = await refreshStatus();
      // Latest uploads, asked for now rather than when the home screen first draws, so they are ready.
      const settings = first.appSettings.settings;
      if (settings.library.showLatestUploads !== false && !settings.privacy.localOnly) void loadUploads();
      setRoot(first.root);
      if (first.lastPlayed) setSelectedKey(first.lastPlayed);
      // "Scan on startup" off: the library waits for Read library (or a change that reads it).
      if (first.root && first.appSettings.settings.library.autoScanOnStartup && !await load(first.root)) {
        setRoot(null);
      }
    })();
  }, [load, refreshStatus]);

  // Nothing played yet: open on the first title.
  React.useEffect(() => {
    if (!selectedKey && titles[0]) setSelectedKey(titles[0].key);
  }, [selectedKey, titles]);

  // The server says when a game starts or ends, including one started for a desktop shortcut rather
  // than from this page. EventSource reconnects by itself if the stream drops.
  React.useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("status", () => void refreshStatus());
    return () => source.close();
  }, [refreshStatus]);

  const reportError = (err: unknown) => toast((err as Error).message);

  const say = (message: string) => toast(message, "good");

  function openTitle(key: string) {
    setSelectedKey(key);
    setGridHome(false);
    setReviewShown(false);
    setImportPage(null);
  }

  async function play(title: Title) {
    if (!root) return;
    setStarting(title.key);
    setActivity(tr("Checking {title}'s files…", { title: title.title }));
    try {
      const response = await fetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(title.kind === "core" ? { root, core: title.folder } : { root, folder: title.folder }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? tr("The game did not start."));
      const next = await refreshStatus();
      if (next.appSettings.settings.launch.minimizeOnLaunch) void fetch("/api/window/minimize").catch(() => {});
      const launched = tr("{title} launched", { title: title.title });
      setActivity(launched);
      setTimeout(() => setActivity((current) => (current === launched ? null : current)), 4000);
    } catch (err) {
      reportError(err);
      setActivity(null);
      if (status?.appSettings.settings.launch.showLogsOnFailure) {
        openTitle(title.key);
        setTab("logs");
      }
    } finally {
      setStarting(null);
    }
  }

  const sidebarView = libraryView({
    titles,
    status,
    scan,
    filters,
    search: sidebarSearch,
    solo,
  });
  const homeView = libraryView({
    titles,
    status,
    scan,
    filters: new Set<Filter>(),
    search: homeSearch,
    solo: null,
  });
  const { favorites, hidden, collections, soloSection, missingCore } = sidebarView;
  const sidebarSections = sidebarView.shownSections;
  const homeSections = homeView.shownSections;
  const { collectionAction, setMember, headDnd, rowDnd, newCollection, renameCollection } = useCollections({
    collections,
    setStatus,
    refreshStatus,
    reportError,
    setNameDialog,
  });
  function deleteCollection(collection: Collection) {
    setConfirmBox({
      title: tr("Delete {name}?", { name: collection.name }),
      body: tr("The collection goes; the titles in it stay in your library."),
      action: tr("Delete"),
      danger: true,
      run: () => collectionAction({ action: "delete", id: collection.id }),
    });
  }
  const { folderImport, setFolderImport, importArchive, importFolder, installCore } = useImports({
    root,
    load,
    openTitle,
    say,
    reportError,
    onCoreStarted: () => void refreshCores(),
  });
  // An open page follows its mod: on to the real page as it lands, back to the library if it doesn't.
  const openImportPage = React.useRef(importPage);
  openImportPage.current = importPage;
  function incomingSettled(key: string, titleKey: string | null) {
    if (openImportPage.current !== key) return;
    setImportPage(null);
    if (titleKey) setSelectedKey(titleKey);
    setGridHome(titleKey === null);
  }
  const { conversions, incoming: imports, add: addConversion, forgetSettled } = useConversions({
    root,
    load,
    say,
    reportError,
    onSettled: incomingSettled,
  });
  const { incoming: downloads, refresh: refreshDownloads, expectDraft } = useDownloads({
    root,
    load,
    say,
    reportError,
    onSettled: incomingSettled,
  });
  const { incoming: cores, jobs: coreJobs, refresh: refreshCores } = useCoreDownloads({
    root,
    load,
    say,
    reportError,
    onSettled: incomingSettled,
  });
  const incoming = [...imports, ...downloads, ...cores];
  const downloading = [...downloads, ...cores];
  const measured = downloading.flatMap((item) => item.percent === null ? [] : [item.percent]);
  const overall = measured.length ? Math.floor(measured.reduce((sum, each) => sum + each) / measured.length) : null;
  const downloadStatus = downloading.length === 0 ? null : {
    text: downloading.length === 1
      ? `${downloading[0]!.title} · ${downloading[0]!.status}`
      : plural(downloading.length, "{count} download", "{count} downloads") +
        (overall === null ? "" : ` · ${overall}%`),
    percent: overall,
  };
  const reviewMods = folderImport ?? (converterOpen ? scan?.importableMods ?? null : null);
  React.useEffect(() => {
    if (folderImport) setReviewShown(true);
  }, [folderImport]);
  function openReview() {
    setFolderImport(null);
    setConverterOpen(true);
    setReviewShown(true);
    setImportPage(null);
  }
  function openImport(key: string) {
    setReviewShown(false);
    setImportPage(key);
  }
  function askCancel(item: Incoming) {
    const download = item.kind === "download";
    setConfirmBox({
      title: download
        ? tr("Cancel the download of {title}?", { title: item.title })
        : tr("Cancel the import of {title}?", { title: item.title }),
      body: download
        ? tr("What was downloaded so far is removed.")
        : tr("What was copied so far is removed. Your Diablo II install isn't changed."),
      action: download ? tr("Cancel download") : tr("Cancel import"),
      dismiss: download ? tr("Keep downloading") : tr("Keep importing"),
      danger: true,
      run: item.cancel,
    });
  }
  const viewedItem = incoming.find((item) => item.key === importPage);
  React.useEffect(() => {
    if (!importPage || viewedItem) return;
    setImportPage(null);
    setGridHome(true);
  }, [importPage, viewedItem]);
  const titleAction = useTitleActions({
    root,
    favorites,
    selectedKey,
    setSelectedKey,
    setStatus,
    refreshStatus,
    load,
    say,
    reportError,
    confirm: setConfirmBox,
    onProperties: (t) => {
      setSelectedKey(t.key);
      setView("library");
      setDialog("general");
    },
    onPlay: (t) => void play(t),
  });

  const row = (t: Title, prefix: string, collection: Collection | null, appearance: SidebarAppearance) => (
    <TitleRow
      key={prefix + t.key}
      t={t}
      root={root}
      art={artVersion}
      selected={t.key === selectedKey && !gridHome && !reviewShown && !importPage}
      running={runningKeys.has(t.key)}
      favorite={favorites.has(t.key)}
      iconSize={appearance.iconSize}
      showStatus={appearance.showStatus}
      rail={appearance.rail}
      onSelect={openTitle}
      onMenu={(x, y) => setMenu(collection ? { x, y, t, from: collection } : { x, y, t })}
      dnd={rowDnd(t, collection)}
    />
  );

  const visibleForFilters = titles.filter((t) =>
    !hidden.has(t.key) &&
    !(status?.appSettings.settings.library.hideUnsupported && t.problems.some((problem) => problem.level === "error"))
  );
  const filterCounts: Record<Filter, number> & { all: number } = {
    all: visibleForFilters.length,
    mods: visibleForFilters.filter((t) => t.kind === "mod").length,
    cores: visibleForFilters.filter((t) => t.kind === "core").length,
    favorites: visibleForFilters.filter((t) => favorites.has(t.key)).length,
    recent: visibleForFilters.filter((t) => status?.playedAt[t.key]).length,
    updates: visibleForFilters.filter((t) => t.updateCheck?.available).length,
    issues: titles.filter((t) => t.problems.length > 0 && !hidden.has(t.key)).length,
    hidden: hidden.size,
  };

  function showView(next: AppView) {
    // From a title's page, Library goes back to the library home; Browse opens unfiltered.
    if (next === "library") {
      setGridHome(true);
      setReviewShown(false);
      setImportPage(null);
    }
    setView(next);
  }

  async function setLatestUploads(show: boolean) {
    const response = await fetch("/api/app-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ library: { showLatestUploads: show } }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? tr("Could not save app settings."));
    await refreshStatus();
  }
  function openLibrary(page: LibraryPage) {
    setLibraryPage(page);
    showView("library");
  }
  function openBrowse(page: BrowseView) {
    setBrowsePage(page);
    setBrowseSearch("");
    showView("browse");
  }
  function openSettings(section: SettingsSection) {
    setSettingsSection(section);
    showView("settings");
  }
  function openHelp(page: HelpPageId) {
    setHelpPage(page);
    showView("help");
  }

  const readyUpdate = status?.update.phase === "ready" && status.update.version &&
      updateLater !== status.update.version
    ? { version: status.update.version, current: status.version }
    : null;

  const appearance = status?.appSettings.settings.appearance;
  const resolvedTheme = appearance?.theme === "system" ? (systemLight ? "light" : "dark") : appearance?.theme ?? "dark";
  const appClass = [
    "app",
    desktop ? "desktop" : "",
    `theme-${resolvedTheme}`,
    appearance?.reduceMotion ? "reduce-motion" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={appClass}>
      <TooltipLayer />
      {desktop && !maximized && <ResizeHandles />}
      <TopBar
        view={view}
        libraryPage={libraryPage}
        browsePage={browsePage}
        settingsSection={settingsSection}
        helpPage={helpPage}
        libraryReady={root !== null}
        desktop={desktop}
        maximized={maximized}
        onLibrary={openLibrary}
        onBrowse={openBrowse}
        onSettings={openSettings}
        onHelp={openHelp}
        onMaximized={setMaximized}
        onToggleMaximize={() => void toggleMaximize()}
      />

      {importOpen && root && (
        <ImportDialog
          installMods={scan?.importableMods.length ?? 0}
          onClose={() => setImportOpen(false)}
          onInstall={() => {
            setImportOpen(false);
            openReview();
          }}
          onFolder={() => {
            setImportOpen(false);
            void importFolder();
          }}
          onArchive={async () => {
            if (await importArchive()) setImportOpen(false);
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
          collections={collections}
          from={menu.from ?? null}
          onAction={(action) => {
            setMenu(null);
            void titleAction(action, menu.t);
          }}
          onCollection={(id, on) => {
            setMenu(null);
            setMember(id, menu.t.key, on);
          }}
          onNewCollection={() => {
            setMenu(null);
            newCollection(menu.t.key);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {sectionMenu && (
        <SectionMenu
          x={sectionMenu.x}
          y={sectionMenu.y}
          section={sectionMenu.section}
          solo={solo}
          collapsed={collapsed.has(sectionMenu.section.id)}
          hasCollections={sidebarSections.some((section) => section.isCollection)}
          onClose={() => setSectionMenu(null)}
          onSolo={setSolo}
          onToggle={() => toggleSection(sectionMenu.section.id)}
          onFoldCollections={(shut) =>
            fold(sidebarSections.filter((section) => section.isCollection).map((section) => section.id), shut)}
          onRename={renameCollection}
          onNewCollection={() => newCollection()}
          onDelete={deleteCollection}
        />
      )}
      {nameDialog && <NameDialog request={nameDialog} onClose={() => setNameDialog(null)} />}
      {confirmBox && <ConfirmDialog request={confirmBox} onClose={() => setConfirmBox(null)} />}

      {view === "browse" && (
        <Browse
          view={browsePage}
          onView={setBrowsePage}
          downloads={downloading}
          onCancelDownload={askCancel}
          initialSearch={browseSearch}
          installed={new Set(titles.flatMap((t) => [titleKey(t.title), titleKey(t.folder)]))}
          root={root}
          onDownloadStarted={() => void refreshDownloads()}
          onExpectDraft={expectDraft}
          onInstalled={(name) => {
            // A new mod in the library: read it again and open the mod on its page.
            setView("library");
            if (root) void load(root).then(() => openTitle(`mod:${name}`));
          }}
          onCoreStarted={() => void refreshCores()}
        />
      )}
      {view === "settings" && status && (
        <AppSettings
          status={status}
          section={settingsSection}
          onSection={setSettingsSection}
          onChanged={refreshStatus}
        />
      )}
      {view === "help" && <HelpPage version={status?.version ?? null} page={helpPage} onPage={setHelpPage} />}
      {view === "library" && !root && status && (
        <SetupPage
          app={status.appSettings}
          install={status.install}
          onDone={(next) => {
            void (async () => {
              const fresh = await refreshStatus();
              if (fresh.root) {
                setRoot(fresh.root);
                await load(fresh.root);
              }
              if (next === "cores") {
                setBrowsePage("cores");
                setView("browse");
              }
            })();
          }}
        />
      )}
      <div className="body" hidden={view !== "library" || !root}>
        <Sidebar
          rail={rail}
          onToggleRail={toggleRail}
          search={sidebarSearch}
          onSearch={setSidebarSearch}
          scan={scan}
          scanning={scanning}
          filters={filters}
          onFilters={setFilters}
          filterCounts={filterCounts}
          onRead={root ? () => void load(root) : null}
          soloSection={soloSection}
          onClearSolo={() => setSolo(null)}
          sections={sidebarSections}
          collapsed={collapsed}
          onToggleSection={toggleSection}
          onSectionMenu={(x, y, section) => setSectionMenu({ x, y, section })}
          collectionHead={headDnd}
          row={row}
          incoming={incoming}
          importPage={importPage}
          onOpenImport={openImport}
        />

        <main className="main">
          {reviewMods && root && (
            <D2SEConverter
              root={root}
              mods={reviewMods}
              hidden={!reviewShown}
              queued={conversions}
              onQueued={addConversion}
              onClose={() => {
                setConverterOpen(false);
                setFolderImport(null);
                setReviewShown(false);
                setGridHome(true);
                forgetSettled();
              }}
            />
          )}
          {reviewShown ? null : viewedItem
            ? (
              <ImportPage
                item={viewedItem}
                onBack={() => {
                  setImportPage(null);
                  setGridHome(true);
                }}
                onCancel={() => askCancel(viewedItem)}
              />
            )
            : gridHome && scan
            ? (
              <LibraryGrid
                shelves={homeSections.filter((section) => libraryPage === "home" || section.isCollection).map((
                  section,
                ) => ({
                  id: section.id,
                  label: section.label,
                  titles: section.titles,
                  ...(section.collection ? { collection: section.collection } : {}),
                }))}
                before={libraryPage === "home" && homeView.sectionsOn &&
                    status?.appSettings.settings.library.showLatestUploads !== false
                  ? (
                    <LatestUploads
                      updates={pendingUpdates(titles, hidden, root, artVersion)}
                      onOpen={(upload) => {
                        if (upload.source === "update") {
                          if (upload.titleKey) {
                            openTitle(upload.titleKey);
                            setDialog("updates");
                          }
                          return;
                        }
                        setBrowsePage(upload.source);
                        setBrowseSearch(upload.title);
                        setView("browse");
                      }}
                    />
                  )
                  : null}
                search={homeSearch}
                onSearch={setHomeSearch}
                onImport={() => setImportOpen(true)}
                collectionsPage={libraryPage === "collections"}
                onNewCollection={() => newCollection()}
                onRenameCollection={renameCollection}
                onDeleteCollection={deleteCollection}
                showLatestUploads={status?.appSettings.settings.library.showLatestUploads !== false}
                onShowLatestUploads={(show) => setLatestUploads(show).catch(reportError)}
                incoming={libraryPage === "home" ? incoming : []}
                onOpenImport={openImport}
                onCancelImport={askCancel}
                root={root}
                art={artVersion}
                running={runningKeys}
                favorites={favorites}
                playedAt={status?.playedAt ?? {}}
                playtime={status?.playtime ?? {}}
                starting={starting}
                onOpen={openTitle}
                onPlay={(t) => void play(t)}
                onMenu={(x, y, t, from) => setMenu(from ? { x, y, t, from } : { x, y, t })}
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
                onBack={() => setGridHome(true)}
                missingCore={missingCore(selected)}
                coreJob={coreJobs.find((job) => job.core.toLowerCase() === missingCore(selected)?.toLowerCase()) ??
                  null}
                onInstallCore={(core) => void installCore(core)}
              />
            )
            : (
              <div className="empty">
                {scanning
                  ? tr("Reading the install…")
                  : !scan && root
                  ? (
                    <button type="button" className="ghost primary" onClick={() => void load(root)}>
                      {tr("Read library")}
                    </button>
                  )
                  : tr("Nothing to show yet.")}
              </div>
            )}
        </main>
      </div>

      <Toasts
        toasts={toasts}
        size={appearance?.toastSize ?? "large"}
        onDismiss={dismissToast}
        reminder={view === "library" && !reviewMods && !reminderClosed && scan?.root === root &&
            scan && scan.importableMods.length > 0 && status?.appSettings.settings.library.importReminder
          ? {
            count: scan.importableMods.length,
            onImport: openReview,
            onDismiss: () => setReminderClosed(true),
            onNever: () => {
              setReminderClosed(true);
              void fetch("/api/app-settings", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ library: { importReminder: false } }),
              }).then(refreshStatus).catch(reportError);
            },
          }
          : null}
      />
      <StatusBar
        update={readyUpdate}
        download={downloadStatus}
        onDownloads={() => openBrowse("downloads")}
        activity={preparationSummary(status?.preparing[0]) ?? activity ??
          (scanning
            ? tr("Reading the install…")
            : status?.running.length
            ? runningSummary(status.running)
            : tr("Nothing running"))}
        live={Boolean(status?.preparing.length || activity || scanning || status?.running.length)}
        library={scan
          ? tr("Library: {mods}, {cores}", {
            mods: plural(scan.mods.length, "{count} mod", "{count} mods"),
            cores: plural(scan.cores.length, "{count} core", "{count} cores"),
          })
          : tr("Library: not read yet")}
        onRestart={() => void applyUpdate().catch(reportError)}
        onLater={() => setUpdateLater(status?.update.version ?? null)}
      />

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
