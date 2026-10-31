export interface Keyword {
  id: string;
  label: string;
}

export interface Group {
  id: string;
  label: string;
  keywords: Keyword[];
}

export interface Source {
  id: string;
  name: string;
  count?: number;
  fetchedAt?: string;
  external?: boolean;
  url?: string;
}

export interface Item {
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

export interface ModDbItem {
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

export type ModDbKind = "file" | "addon" | "mod";

/** One ModDB entry's own page, read when its card comes on screen (browse.ts modDbDetails). */
export interface ModDbDetails {
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

export type Shot = { full: string; thumb: string };

export interface Details {
  id: string;
  description: string;
  descriptionSource: string | null;
  archives: { name: string; size: number }[];
  screenshots: { full: string; thumb: string }[];
  links: { label: string; url: string }[];
  keywords: string[];
  unpackedSize: number;
}

export interface InstallResult {
  installed: { name: string; path: string; files: number }[];
  unpacked: string | null;
  skipped: { name: string; reason: string }[];
}

export type JobState = "downloading" | "extracting" | "installing" | "installed" | "downloaded" | "failed";

export interface Job {
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
  paused?: boolean;
  installing: string | null;
  result: InstallResult | null;
  error?: string;
  startedAt: string;
  endedAt?: string;
}

export interface Throughput {
  history: { t: number; net: number; disk: number }[];
  peakNet: number;
  peakDisk: number;
  totalNet: number;
  totalDisk: number;
}

export type BrowseView = "archive" | "moddb" | "cores" | "downloads";

export type ArchiveSort = "all" | "popular" | "recent";
