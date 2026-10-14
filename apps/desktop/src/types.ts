export type Level = "error" | "warning";

export type ArtKind = "banner" | "icon" | "portrait";

export interface Problem {
  level: Level;
  message: string;
}

export interface ArchiveLoad {
  kind: string;
  path: string;
  priority: number;
  required: boolean;
}

export interface PluginLoad {
  kind: string;
  path: string;
  required: boolean;
  init: string | number | null;
  release: string | number | null;
}

export interface TitleOptions {
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

export interface TitleUpdateSettings {
  automatic: boolean;
  background: boolean;
  channel: "stable" | "testing" | "local";
  endpoint: string | null;
}

export interface TitleUpdateCheck {
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

export interface ModLink {
  label: string;
  url: string;
  kind: "discord" | "github" | "moddb" | "youtube" | "reddit" | "forum" | "docs" | "web";
}

export interface DocEntry {
  label: string;
  /** Relative to the mod folder, `/`-separated. */
  path: string;
  kind: "html" | "text" | "rtf";
}

/** A mod, or a D2SE core played on its own. */
export interface Title {
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

export interface Scan {
  root: string;
  cores: Title[];
  mods: Title[];
  /** Mods to import: the install's D2SE mods, or one folder chosen with Import folder (`path`). */
  importableMods: { folder: string; title: string; core: string | null; path?: string }[];
}

export interface Collection {
  id: string;
  name: string;
  keys: string[];
}

/** A one-field dialog: naming a new collection, or renaming one. */
export interface NameRequest {
  title: string;
  action: string;
  initial: string;
  run: (name: string) => Promise<void>;
}

/** A sidebar section: Favorites, a collection, Recent, Mods or Cores, by its id. */
export interface SidebarSection {
  id: string;
  label: string;
  /** As menus name it: "View only Mods". */
  name: string;
  titles: Title[];
  collection?: Collection;
}

/**
 * A card in the library home's Latest uploads row: a recent upload from the browse sources, or a
 * library title with an update waiting (`update`, opening its Updates page).
 */
export interface Upload {
  key: string;
  source: "archive" | "moddb" | "update";
  titleKey?: string;
  title: string;
  addedAt: string;
  cover: string;
  sourceLabel: string;
}

export interface Running {
  key: string;
  copy: number;
  title: string;
  pid: number;
  startedAt: string;
}

/** A title's play time, from the launchers' ledger. */
export interface Playtime {
  seconds: number;
  runs: number;
  lastEndedAt: string | null;
}

export interface Status {
  /** Exordium's own library (library-setup.ts); null until setup has copied the game files. */
  root: string | null;
  /** The player's Diablo II install, read by setup and the mod import only. */
  install: string | null;
  library: string;
  lastPlayed: string | null;
  playedAt: Record<string, string>;
  favorites: string[];
  hidden: string[];
  /** The player's own sidebar groups, in order (server.ts collectionsRoute). */
  collections: Collection[];
  running: Running[];
  playtime: Record<string, Playtime>;
  /** Running as the packaged Exordium.exe, which a desktop shortcut can start. */
  packaged: boolean;
  version: string;
  /** Exordium's own update (updater.ts): "ready" once one is downloaded and checked. */
  update: { phase: UpdatePhase; version: string | null };
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

export type SettingsSection =
  | "library"
  | "launch"
  | "boxes"
  | "backups"
  | "downloads"
  | "updates"
  | "privacy"
  | "diagnostics"
  | "appearance"
  | "discord";

export interface AppPreferences {
  library: {
    autoScanOnStartup: boolean;
    hideUnsupported: boolean;
    /** The Latest uploads row on the library home. */
    showLatestUploads: boolean;
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
  updates: {
    checkOnStartup: boolean;
    includePrereleases: boolean;
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
    reduceMotion: boolean;
  };
}

export interface AppSettingsState {
  settings: AppPreferences;
  paths: Record<"data" | "boxes" | "downloads" | "backups" | "logs" | "art", string>;
}

export interface Character {
  name: string;
  className: string;
  level: number;
  hardcore: boolean;
  dead: boolean;
  expansion: boolean;
  savedAt: string | null;
}

export interface Screenshot {
  name: string;
  size: number;
  modifiedAt: string | null;
}

export type Filter = "all" | "mods" | "cores" | "issues" | "hidden";

export type Tab = "overview" | "documentation" | "changelogs" | "screenshots" | "backups" | "logs";

export type DialogPage = "general" | "about" | "updates" | "files" | "artwork";

export interface InstallCheck {
  install: string;
  gameFiles: { name: string; size: number }[];
  gameBytes: number;
  missing: string[];
  problem: string | null;
  d2se: boolean;
  cores: { version: string; size: number }[];
  mods: string[];
}

export interface CopyJob {
  id: string;
  kind: "game" | "core" | "mod";
  label: string;
  state: "copying" | "done" | "failed";
  copied: number;
  total: number;
  error: string | null;
}

export interface CatalogCore {
  version: string;
  core: string;
  size: number;
  status: "available" | "installed" | "install";
  job: {
    state: "downloading" | "verifying" | "installing" | "installed" | "failed";
    received: number;
    total: number;
    error?: string;
  } | null;
}

export type TitleAction = "play" | "favorite" | "shortcut" | "files" | "hide" | "unhide" | "uninstall" | "properties";

export interface ConfirmRequest {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  /** A checkbox shown ticked; its state is passed to run. */
  checkbox?: string | undefined;
  run: (checked: boolean) => Promise<void>;
}

export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "failed";

export interface UpdateView {
  phase: UpdatePhase;
  current: string;
  repo: string;
  checkedAt: string | null;
  received: number;
  error: string | null;
  packaged: boolean;
  update: {
    version: string;
    name: string;
    notes: string;
    url: string;
    publishedAt: string | null;
    prerelease: boolean;
    asset: { name: string; size: number };
  } | null;
}

export interface LogFile {
  name: string;
  size: number;
  modifiedAt: string | null;
}

export interface BackupCharacter {
  name: string;
  className: string;
  level: number;
  hardcore: boolean;
  dead: boolean;
}

export interface BackupEntry {
  id: string;
  createdAt: string;
  reason: "closed" | "manual" | "before-restore" | "before-rebuild";
  files: number;
  bytes: number;
  characters: BackupCharacter[];
}

export interface BackupSettings {
  auto: boolean;
  keep: number;
  folder: string;
  custom: boolean;
}

export interface FeedItem {
  at: string;
  text: string;
  detail: string;
  bad: boolean;
}
