import { formatDecimal, tr } from "../../lib/i18n.ts";
import type * as React from "react";
import type { ArchiveSort, CatalogEntry, Item, Job, JobState, ModDbItem, ModDbKind } from "./types.ts";

export const ARCHIVE_SORTS: { id: ArchiveSort; label: string }[] = [
  { id: "all", label: tr("ALL") },
  { id: "popular", label: tr("MOST DOWNLOADED") },
  { id: "recent", label: tr("RECENTLY ADDED") },
];

export const PAGE = 20;

export const ACTIVE: JobState[] = ["downloading", "extracting", "installing"];

export const MODDB_KINDS: { id: "all" | ModDbKind; label: string }[] = [
  { id: "all", label: tr("All") },
  { id: "file", label: tr("Files") },
  { id: "addon", label: tr("Addons") },
  { id: "mod", label: tr("Mods") },
];

export const DOWNLOAD_URL = /\.(zip|rar|7z|tar|tgz|gz|bz2|xz)(?:[?#].*)?$/i;

/** Titles compared without case, spaces or punctuation: "The Black Soul" is "theblacksoul". */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** A ModDB project is the stable `/mods/{slug}` portion shared by its profile and every release. */
export function modDbProjectPage(item: ModDbItem): string | null {
  try {
    const url = new URL(item.page);
    const match = /^\/mods\/([^/]+)(?:\/|$)/i.exec(url.pathname);
    return match ? `${url.origin}/mods/${match[1]}`.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * The unified catalog. Every ModDB release beneath one project URL becomes one project card; rows
 * outside `/mods/{slug}` still collapse only on exact titles. The representative is the root mod
 * page when available, because it supplies the file picker. Nothing is grouped by fuzzy title.
 */
export function catalogEntries(archive: readonly Item[], moddb: readonly ModDbItem[]): CatalogEntry[] {
  const exactRank: Record<ModDbKind, number> = { file: 0, addon: 1, mod: 2 };
  const groups = new Map<string, ModDbItem[]>();
  for (const item of moddb) {
    const project = modDbProjectPage(item);
    const key = project ? `project:${project}` : `title:${titleKey(item.title)}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const modDbGroups = [...groups.entries()].map(([key, variants]) => {
    const project = modDbProjectPage(variants[0]!);
    const representative = project
      ? variants.find((item) => item.kind === "mod" && modDbProjectPage(item) === item.page.toLowerCase()) ??
        [...variants].sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""))[0]!
      : [...variants].sort((a, b) => exactRank[a.kind] - exactRank[b.kind])[0]!;
    return { key, representative, variants };
  });

  const entries: CatalogEntry[] = archive.map((item) => ({
    key: `archive:${item.id}`,
    title: item.title,
    archive: item,
    moddb: null,
    moddbVariants: [],
  }));
  const firstArchive = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const key = titleKey(entry.title);
    if (!firstArchive.has(key)) firstArchive.set(key, entry);
  }
  for (const group of modDbGroups) {
    const item = group.representative;
    const existing = group.variants.map((variant) => firstArchive.get(titleKey(variant.title))).find(Boolean);
    if (existing) {
      existing.moddb = item;
      existing.moddbVariants = group.variants;
    } else {
      entries.push({
        key: `moddb:${group.key}`,
        title: item.title,
        archive: null,
        moddb: item,
        moddbVariants: group.variants,
      });
    }
  }
  return entries;
}

export const baseName = (file: string) => file.split("/").pop() ?? file;

export function modDbAddress(text: string): string | null {
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

export function installableModDbUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return DOWNLOAD_URL.test(parsed.pathname) ||
      /(^|\.)moddb\.com$/i.test(parsed.hostname) &&
        (/\/downloads(?:\/|$)/i.test(parsed.pathname) || /\/addons\/[^/]+$/i.test(parsed.pathname));
  } catch {
    return false;
  }
}

export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    return last ? decodeURIComponent(last).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") : tr("ModDB download");
  } catch {
    return tr("ModDB download");
  }
}

export function post(path: string, body: unknown) {
  return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function openLink(url: string) {
  void post("/api/open-link", { url }).catch(() => {});
}

/** Where a job is, as a fraction 0..1, or null when it cannot be measured (unpacking an unknown size). */
export function jobProgress(job: Job): number | null {
  if (job.state === "downloading") return job.total ? job.received / job.total : null;
  if (job.state === "extracting") return job.unpackedSize ? Math.min(1, job.extracted / job.unpackedSize) : null;
  if (job.state === "installing" || job.state === "installed") return 1;
  return null;
}

export function jobLabel(job: Job): string {
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

/**
 * A ModDB picture that does not load steps down: the original upload to the entry page's 620px copy,
 * that to the listing's crop, which its cache always has.
 */
export function smallerModDbImage(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  const original = /^https:[/][/]media[.]moddb[.]com[/]images[/]([a-z]+[/]\d+[/]\d+[/]\d+)[/]([^/]+)$/i.exec(img.src);
  const smaller = original
    ? `https://media.moddb.com/cache/images/${original[1]}/thumb_620x2000/${original[2]}`
    : img.src.replace("/thumb_620x2000/", "/crop_120x90/");
  if (smaller !== img.src) img.src = smaller;
}

export const INSTALLER_FILE = /\.(exe|msi|bat|cmd|com|scr)$/i;

/** A file name's extension in capitals ("ZIP"), or nothing when it has none. */
export function fileExtension(name: string): string {
  return /\.([a-z0-9]{1,5})$/i.exec(name.trim())?.[1]?.toUpperCase() ?? "";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return tr("{value} KB", { value: (bytes / 1024).toFixed(0) });
  if (bytes < 1024 * 1024 * 1024) return tr("{value} MB", { value: formatDecimal(bytes / 1024 / 1024) });
  return tr("{value} GB", { value: formatDecimal(bytes / 1024 / 1024 / 1024, 2) });
}

export function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`;
  if (bytesPerSecond < 1024 * 1024) return tr("{value} KB/s", { value: (bytesPerSecond / 1024).toFixed(0) });
  return tr("{value} MB/s", { value: (bytesPerSecond / 1024 / 1024).toFixed(1) });
}

/** `01:40`, or `1:02:03` past an hour, as Steam shows the time left. */
export function formatClock(seconds: number): string {
  const whole = Math.ceil(seconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  const clock = `${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}`;
  return whole < 3600 ? clock : `${Math.floor(whole / 3600)}:${clock}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
