import { plural, tr } from "./lib/i18n.ts";
import * as React from "react";
import { Browse } from "./pages/browse/Browse.tsx";
import { titleKey } from "./pages/browse/browse-util.ts";
import { Banners } from "./components/Banners.tsx";
import { ConfirmDialog, NameDialog } from "./components/dialogs.tsx";
import { followCopy } from "./components/progress.tsx";
import { TitleMenu } from "./components/menus.tsx";
import { SectionMenu } from "./components/SectionMenu.tsx";
import { TitleRow } from "./components/sidebar.tsx";
import { type AppView, TopBar } from "./components/TopBar.tsx";
import { ResizeHandles } from "./components/WindowChrome.tsx";
import { useAppWindow, usePageHousekeeping } from "./hooks/useAppWindow.ts";
import { useCollections } from "./hooks/useCollections.ts";
import { useImports } from "./hooks/useImports.ts";
import { useSidebarLayout } from "./hooks/useSidebarLayout.ts";
import { useTitleActions } from "./hooks/useTitleActions.ts";
import { loadUploads } from "./lib/latest-uploads.ts";
import { libraryView } from "./lib/library-view.ts";
import { runningSummary } from "./lib/util.ts";
import { D2SEConverter } from "./pages/D2SEConverter.tsx";
import { HelpPage } from "./pages/help/Help.tsx";
import { ImportDialog } from "./pages/ImportDialog.tsx";
import { LatestUploads, pendingUpdates } from "./pages/library/LatestUploads.tsx";
import { LibraryGrid } from "./pages/library/LibraryGrid.tsx";
import { Sidebar } from "./pages/library/Sidebar.tsx";
import { Properties } from "./pages/properties/Properties.tsx";
import { AppSettings } from "./pages/settings/Settings.tsx";
import { SetupPage } from "./pages/Setup.tsx";
import { TitlePage } from "./pages/title/TitlePage.tsx";
import { applyUpdate } from "./pages/Updates.tsx";
import type {
  Collection,
  ConfirmRequest,
  CopyJob,
  DialogPage,
  Filter,
  NameRequest,
  Scan,
  SidebarSection,
  Status,
  Tab,
  Title,
} from "./types.ts";

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
  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");
  // The one sidebar section shown alone (View only), if any.
  const [solo, setSolo] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [dialog, setDialog] = React.useState<DialogPage | null>(null);
  const [starting, setStarting] = React.useState<string | null>(null);
  // A short line in the status bar for what Exordium is doing right now (e.g. a launch in progress),
  // since Play only turns to "Starting" and the box build that follows can take many seconds.
  const [activity, setActivity] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [updateLater, setUpdateLater] = React.useState<string | null>(null);
  const [browseStart, setBrowseStart] = React.useState<"archive" | "moddb" | "cores">("archive");
  // What Browse opens filtered to: a Latest uploads card opens its upload.
  const [browseSearch, setBrowseSearch] = React.useState("");
  const [dismissedImportRoot, setDismissedImportRoot] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem("exordium.convertDismissed");
    } catch {
      return null;
    }
  });
  const [converterOpen, setConverterOpen] = React.useState(false);
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
    setError(null);
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
      setError((err as Error).message);
      return false;
    } finally {
      setScanning(false);
    }
  }, []);

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

  const reportError = (err: unknown) => setError((err as Error).message);

  function say(message: string) {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 6000);
  }

  function openTitle(key: string) {
    setSelectedKey(key);
    setGridHome(false);
  }

  async function play(title: Title) {
    if (!root) return;
    setStarting(title.key);
    setError(null);
    setActivity(tr("Starting {title} — preparing its box…", { title: title.title }));
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

  const { favorites, hidden, collections, sectionsOn, soloSection, shownSections, missingCore } = libraryView({
    titles,
    status,
    scan,
    filter,
    search,
    solo,
  });
  const { collectionAction, setMember, headDnd, rowDnd, newCollection, renameCollection } = useCollections({
    collections,
    setStatus,
    refreshStatus,
    reportError,
    setNameDialog,
  });
  const { folderImport, setFolderImport, coreJob, importArchive, importFolder, installCore } = useImports({
    root,
    load,
    openTitle,
    say,
    reportError,
  });
  const titleAction = useTitleActions({
    root,
    favorites,
    selectedKey,
    setSelectedKey,
    setStatus,
    refreshStatus,
    load,
    say,
    setError,
    confirm: setConfirmBox,
    onProperties: (t) => {
      setSelectedKey(t.key);
      setView("library");
      setDialog("general");
    },
    onPlay: (t) => void play(t),
  });

  const row = (t: Title, prefix: string, collection: Collection | null) => (
    <TitleRow
      key={prefix + t.key}
      t={t}
      root={root}
      art={artVersion}
      selected={t.key === selectedKey && !gridHome}
      running={runningKeys.has(t.key)}
      favorite={favorites.has(t.key)}
      onSelect={openTitle}
      onMenu={(x, y) => setMenu(collection ? { x, y, t, from: collection } : { x, y, t })}
      dnd={rowDnd(t, collection)}
    />
  );

  function showView(next: AppView) {
    // From a title's page, Library goes back to the library home; Browse opens unfiltered.
    if (next === "library") setGridHome(true);
    if (next === "browse") {
      setBrowseStart("archive");
      setBrowseSearch("");
    }
    setView(next);
  }

  const readyUpdate = status?.update.phase === "ready" && status.update.version &&
      updateLater !== status.update.version
    ? { version: status.update.version, current: status.version }
    : null;
  const importCount = view === "library" && root && scan?.root === root && dismissedImportRoot !== root
    ? scan.importableMods.length
    : 0;
  const onConverted = async (message: string) => {
    if (root) await load(root);
    say(message);
  };
  // Imports still copying when the converter closes: followed here, and the library read again as each
  // one lands, as the converter would have.
  function followImports(running: CopyJob[]) {
    for (const job of running) {
      void followCopy(job, () => {}).then((done) => {
        if (done.state === "done") {
          void onConverted(tr("Imported {label} into Exordium's library.", { label: done.label }));
        } else if (done.state === "failed") {
          setError(
            tr("{label} was not imported: {error}.", {
              label: done.label,
              error: done.error ?? tr("the copy stopped"),
            }),
          );
        }
      });
    }
  }

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
      {desktop && !maximized && <ResizeHandles />}
      <TopBar
        view={view}
        libraryReady={root !== null}
        desktop={desktop}
        maximized={maximized}
        onView={showView}
        onMaximized={setMaximized}
        onToggleMaximize={() => void toggleMaximize()}
      />
      <Banners
        error={error}
        notice={notice}
        update={readyUpdate}
        importCount={importCount}
        onDismissError={() => setError(null)}
        onRestart={() => void applyUpdate().catch((e) => setError(e.message))}
        onLater={() => setUpdateLater(status?.update.version ?? null)}
        onImport={() => setConverterOpen(true)}
        onNotNow={() => {
          setDismissedImportRoot(root);
          try {
            if (root) localStorage.setItem("exordium.convertDismissed", root);
          } catch {
            // Storage unavailable: hidden for this session only.
          }
        }}
      />

      {converterOpen && root && scan && (
        <D2SEConverter
          root={root}
          mods={scan.importableMods}
          onClose={(running) => {
            setConverterOpen(false);
            followImports(running);
          }}
          onSaved={onConverted}
        />
      )}
      {folderImport && root && (
        <D2SEConverter
          root={root}
          mods={folderImport}
          onClose={(running) => {
            setFolderImport(null);
            followImports(running);
          }}
          onSaved={onConverted}
        />
      )}
      {importOpen && root && (
        <ImportDialog
          installMods={scan?.importableMods.length ?? 0}
          onClose={() => setImportOpen(false)}
          onInstall={() => {
            setImportOpen(false);
            setConverterOpen(true);
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
          hasCollections={collections.length > 0}
          onClose={() => setSectionMenu(null)}
          onSolo={setSolo}
          onToggle={() => toggleSection(sectionMenu.section.id)}
          onFoldCollections={(shut) => fold(collections.map((c) => `collection:${c.id}`), shut)}
          onRename={renameCollection}
          onNewCollection={() => newCollection()}
          onDelete={(c) =>
            setConfirmBox({
              title: tr("Delete {name}?", { name: c.name }),
              body: tr("The collection goes; the titles in it stay in your library."),
              action: tr("Delete"),
              danger: true,
              run: () => collectionAction({ action: "delete", id: c.id }),
            })}
        />
      )}
      {nameDialog && <NameDialog request={nameDialog} onClose={() => setNameDialog(null)} />}
      {confirmBox && <ConfirmDialog request={confirmBox} onClose={() => setConfirmBox(null)} />}

      {view === "browse" && (
        <Browse
          initialView={browseStart}
          initialSearch={browseSearch}
          installed={new Set(titles.flatMap((t) => [titleKey(t.title), titleKey(t.folder)]))}
          root={root}
          onInstalled={(name) => {
            // A new mod in the library: read it again and open the mod on its page.
            setView("library");
            if (root) void load(root).then(() => openTitle(`mod:${name}`));
          }}
          onCoreInstalled={(core) => {
            // A new core: read the library again so mods built on it can run. The page stays on the
            // Cores tab, where several are often installed in a row.
            if (root && core) void load(root);
          }}
        />
      )}
      {view === "settings" && status && <AppSettings status={status} onChanged={refreshStatus} />}
      {view === "help" && <HelpPage version={status?.version ?? null} />}
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
                setBrowseStart("cores");
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
          search={search}
          onSearch={setSearch}
          scan={scan}
          scanning={scanning}
          filter={filter}
          onFilter={setFilter}
          hiddenCount={hidden.size}
          onRead={root ? () => void load(root) : null}
          soloSection={soloSection}
          onClearSolo={() => setSolo(null)}
          sections={shownSections}
          collapsed={collapsed}
          onToggleSection={toggleSection}
          onSectionMenu={(x, y, section) => setSectionMenu({ x, y, section })}
          collectionHead={headDnd}
          row={row}
        />

        <main className="main">
          {gridHome && scan
            ? (
              <LibraryGrid
                shelves={shownSections.map((section) => ({
                  id: section.id,
                  label: section.label,
                  titles: section.titles,
                }))}
                before={sectionsOn && !soloSection && status?.appSettings.settings.library.showLatestUploads !== false
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
                        setBrowseStart(upload.source);
                        setBrowseSearch(upload.title);
                        setView("browse");
                      }}
                    />
                  )
                  : null}
                onImport={() => setImportOpen(true)}
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
                onBack={() => setGridHome(true)}
                missingCore={missingCore(selected)}
                coreJob={coreJob}
                onInstallCore={(core) => {
                  setError(null);
                  void installCore(core);
                }}
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

      <footer className="statusbar">
        <span className={activity || scanning || status?.running.length ? "dot live" : "dot"} />
        <span>
          {activity ??
            (scanning
              ? tr("Reading the install…")
              : status?.running.length
              ? runningSummary(status.running)
              : tr("Nothing running"))}
        </span>
        <div className="grow" />
        <span>{tr("Registry: private per title")}</span>
        <span>·</span>
        <span>
          {scan
            ? tr("Library: {mods}, {cores}", {
              mods: plural(scan.mods.length, "{count} mod", "{count} mods"),
              cores: plural(scan.cores.length, "{count} core", "{count} cores"),
            })
            : tr("Library: not read yet")}
        </span>
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
