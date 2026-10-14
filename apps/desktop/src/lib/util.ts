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
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
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
  return [...counts].map(([title, n]) => n === 1 ? `${title} is running` : `${title} ×${n} are running`).join(" · ");
}

/** "42 min", "3.4 h", as Steam counts play time. */
export function playTime(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${hours < 100 ? hours.toFixed(1) : Math.round(hours)} h`;
}

export function installLocation(root: string, t: Title): string {
  return t.kind === "core" ? `${root}\\cores\\${t.folder}` : `${root}\\mods\\${t.folder}`;
}

export function relative(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString();
}
