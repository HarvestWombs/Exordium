import { formatDate, formatDecimal, tr } from "../lib/i18n.ts";
import type { Running, Title } from "../types.ts";

/** A value kept in localStorage, or the fallback when storage is missing or unreadable. */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; still applied for this session.
  }
}

export const RENDERERS: Record<string, string> = {
  glide: "Glide",
  ddraw: "DirectDraw",
  d3d: "Direct3D",
  opengl: "OpenGL",
};

export function initials(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !/^(the|of|a)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || title.slice(0, 2)).toUpperCase();
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return tr("{value} KB", { value: formatDecimal(bytes / 1024) });
  if (bytes < 1024 ** 3) return tr("{value} MB", { value: formatDecimal(bytes / 1024 / 1024) });
  return tr("{value} GB", { value: formatDecimal(bytes / 1024 ** 3) });
}

export async function openLink(url: string) {
  await fetch("/api/open-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => {});
}

export async function openAppFolder(path: string) {
  await fetch("/api/app-settings/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => {});
}

/** "Synthesis is running", or "Synthesis ×2 are running" for copies, joined per title. */
export function runningSummary(runs: Running[]): string {
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.title, (counts.get(run.title) ?? 0) + 1);
  return [...counts].map(([title, n]) =>
    n === 1 ? tr("{title} is running", { title }) : tr("{title} ×{n} are running", { title, n })
  ).join(" · ");
}

/** "42 min", "3.4 h", as Steam counts play time. */
export function playTime(seconds: number): string {
  if (seconds < 60) return tr("< 1 min");
  if (seconds < 3600) return tr("{minutes} min", { minutes: Math.floor(seconds / 60) });
  const hours = seconds / 3600;
  return tr("{hours} h", { hours: hours < 100 ? formatDecimal(hours) : Math.round(hours) });
}

/**
 * A title's folder, written the way its system writes paths: all backslashes for a Windows path (the
 * library root arrives with forward slashes), all forward slashes otherwise.
 */
export function installLocation(root: string, t: Title): string {
  const path = `${root}/${t.kind === "core" ? "cores" : "mods"}/${t.folder}`;
  return /^[a-z]:|\\/i.test(root) ? path.replace(/\//g, "\\") : path.replace(/\\/g, "/");
}

export function relative(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return tr("Today");
  if (days === 1) return tr("Yesterday");
  if (days < 7) return tr("{days} days ago", { days });
  return formatDate(then);
}
