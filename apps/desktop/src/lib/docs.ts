import type { DocEntry, Screenshot } from "../types.ts";

export function docUrl(key: string, path: string): string {
  return `/api/docs/${encodeURIComponent(key)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Old mod text is often Windows-1252, not UTF-8: try UTF-8 strictly, then fall back. */
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Readable text from RTF: control words and groups dropped, paragraphs kept. Enough for changelogs. */
export function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\(par|line)\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Documentation or changelogs from the mod's folder: a list, and the selected one beside it. HTML is
 * shown in a sandboxed frame, with no scripts (the server's CSP says the same); text as text.
 */
export function shotSeed(key: string): number {
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function randomShots(shots: Screenshot[], key: string): Screenshot[] {
  const picked = [...shots];
  let seed = shotSeed(`${key}:${shots.length}`);
  for (let i = picked.length - 1; i > 0; i--) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const j = seed % (i + 1);
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  return picked.slice(0, 8);
}

export function changelogDateScore(entry: DocEntry): number {
  const text = `${entry.path} ${entry.label}`;
  const ymd = /(?:^|[^\d])((?:19|20)\d{2})[-_. ]([01]?\d)[-_. ]([0-3]?\d)(?:[^\d]|$)/.exec(text);
  if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const mdy = /(?:^|[^\d])([01]?\d)[-_. ]([0-3]?\d)[-_. ]((?:19|20)\d{2})(?:[^\d]|$)/.exec(text);
  if (mdy) return Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
  return 0;
}

export function newestChangelog(entries: DocEntry[]): DocEntry | null {
  return [...entries].sort((a, b) => changelogDateScore(b) - changelogDateScore(a))[0] ?? null;
}

export function excerptOf(text: string, max: number): string {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
