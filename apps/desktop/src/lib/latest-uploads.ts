import type { Upload } from "../types.ts";

/**
 * The library home's Latest uploads, fetched once and kept for the session: the app asks for them at
 * startup, alongside reading the library, so the row is there as soon as the home screen is, and every
 * return to the home screen shows them at once. A later request refreshes them quietly.
 */
let kept: Upload[] | null = null;
let pending: Promise<Upload[]> | null = null;
/** Rows showing the uploads, told when a fresher set lands after the first answer. */
const listeners = new Set<(uploads: Upload[]) => void>();
/** The ask that waits for lists being fetched again behind the first answer (`?wait=1`). */
let waiting: Promise<void> | null = null;

/** Calls `listener` with each fresher set of uploads; returns the unsubscribe. */
export function onUploads(listener: (uploads: Upload[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function keep(uploads: Upload[]): Upload[] {
  kept = uploads;
  // The first cards' pictures, fetched now so the row does not fill in one picture at a time.
  for (const upload of kept.slice(0, 6)) if (upload.cover) new Image().src = upload.cover;
  return kept;
}

/**
 * The server answers from its cache at once and says when a list is being fetched again behind it (at
 * startup, after days closed): then ask once more, waiting for it, and hand the fresh set to the rows.
 */
function awaitFresh(): void {
  waiting ??= fetch("/api/browse/latest?wait=1")
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { uploads?: Upload[] } | null) => {
      if (!body?.uploads) return;
      const fresh = keep(body.uploads);
      for (const listener of listeners) listener(fresh);
    })
    .catch(() => {})
    .finally(() => {
      waiting = null;
    });
}

/** Descriptions read from uploads' own pages, by key: each is asked for once. */
const pageDescriptions = new Map<string, string>();

/**
 * An upload's description from its own page, for one the list has no words for. Rejects when the page
 * cannot be read, so a card only ever says there is no description when the page has none.
 */
export async function pageDescription(upload: Upload): Promise<string> {
  const kept = pageDescriptions.get(upload.key);
  if (kept !== undefined) return kept;
  if (upload.source === "update") return "";
  const url = upload.source === "moddb"
    ? `/api/browse/moddb-item?page=${encodeURIComponent(upload.page ?? "")}`
    : `/api/browse/item?id=${encodeURIComponent(upload.key.slice("archive:".length))}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const description = String((await response.json()).description ?? "");
  pageDescriptions.set(upload.key, description);
  return description;
}

/** What is kept so far, or null before the first answer. */
export function keptUploads(): Upload[] | null {
  return kept;
}

/** The uploads, from the server; one request at a time. Empty when the sources cannot be read. */
export function loadUploads(): Promise<Upload[]> {
  pending ??= fetch("/api/browse/latest")
    .then((response) => (response.ok ? response.json() : { uploads: [] }))
    .then((body: { uploads?: Upload[]; refreshing?: boolean }) => {
      if (body.refreshing) awaitFresh();
      return keep(body.uploads ?? []);
    })
    .catch(() => kept ?? [])
    .finally(() => {
      pending = null;
    });
  return pending;
}
