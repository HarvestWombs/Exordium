import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { INSTALLER_FILE } from "./browse-util.ts";
import type { Details, Item, ModDbDetails, ModDbItem } from "./types.ts";

/**
 * When to read an entry's details: once its card nears the screen (`ref`, observed with `margin`
 * inside the scrolling list when `inList`), or at once (`null`: the details page).
 */
export type LoadWhen = { ref: React.RefObject<HTMLElement | null>; margin: string; inList?: boolean } | null;

/** Calls `load` once, when `when` says so; nothing when `skip`. */
function useLoadOnce(when: LoadWhen, skip: boolean, load: () => void, deps: React.DependencyList): void {
  React.useEffect(() => {
    if (skip) return;
    if (!when) return load();
    const node = when.ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { root: when.inList ? node.closest(".browse-list") : null, rootMargin: when.margin });
    observer.observe(node);
    return () => observer.disconnect();
  }, deps);
}

/** The largest archive: what Install picks first. */
function largest(details: Details | null): string {
  return [...(details?.archives ?? [])].sort((a, b) => b.size - a.size)[0]?.name ?? "";
}

/**
 * An Internet Archive entry's details (files, screenshots, its archive's own readme and findings) and
 * the file chosen to install. `cached` is what the list already carried: then nothing is fetched.
 */
export function useArchiveEntry(
  item: Item,
  cached: Details | null,
  when: LoadWhen,
  onDetails?: (details: Details) => void,
) {
  const [details, setDetails] = React.useState<Details | null>(cached);
  const [error, setError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<string>(() => largest(cached));

  useLoadOnce(when, details !== null, () => {
    void (async () => {
      const response = await fetch(`/api/browse/item?id=${encodeURIComponent(item.id)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setError(body.error ?? tr("Could not read this item."));
      setDetails(body);
      setFile(largest(body));
      onDetails?.(body);
      // The full screenshots, preloaded so switching between them is instant.
      for (const shot of body.screenshots as Details["screenshots"]) new Image().src = shot.full;
    })();
  }, [item.id, details]);

  return { details, error, loading: !details && !error, file, setFile };
}

export type ModDbFile = ModDbDetails["files"][number];

/**
 * A ModDB entry's own page (description, screenshots and videos, who made it, its files) and what
 * Install would fetch: for a mod, the file chosen among its releases; for a file or addon, itself.
 */
export function useModDbEntry(item: ModDbItem, variants: ModDbItem[] | undefined, when: LoadWhen) {
  const [details, setDetails] = React.useState<ModDbDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState("");
  // A mod's page does not say what its files are; each file's own page does, by its page.
  const [fileNames, setFileNames] = React.useState<Record<string, string | null>>({});
  const isMod = item.kind === "mod";

  useLoadOnce(when, details !== null, () => {
    void (async () => {
      const response = await fetch(`/api/browse/moddb-item?page=${encodeURIComponent(item.page)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return setError(body.error ?? tr("Could not read this page."));
      setDetails(body);
      setFile(body.files?.[0]?.page ?? "");
      for (const shot of body.screenshots as ModDbDetails["screenshots"]) new Image().src = shot.full;
    })();
  }, [item.page, details]);

  React.useEffect(() => {
    if (!isMod || !file || file in fileNames) return;
    void fetch(`/api/browse/moddb-item?page=${encodeURIComponent(file)}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((body: ModDbDetails | null) => setFileNames((names) => ({ ...names, [file]: body?.filename ?? null })));
  }, [isMod, file, fileNames]);

  const availableFiles = React.useMemo(() => {
    const detailsByPage = new Map((details?.files ?? []).map((entry) => [entry.page, entry]));
    const files = new Map<string, ModDbFile>();
    const releases = (variants ?? []).filter((variant) => variant.kind === "file").sort((a, b) =>
      (b.addedAt ?? "").localeCompare(a.addedAt ?? "")
    );
    for (const variant of releases) {
      files.set(
        variant.page,
        detailsByPage.get(variant.page) ?? { page: variant.page, name: variant.title, size: null, category: null },
      );
    }
    for (const entry of details?.files ?? []) if (!files.has(entry.page)) files.set(entry.page, entry);
    return [...files.values()];
  }, [details, variants]);

  React.useEffect(() => {
    if (isMod && !file && availableFiles[0]) setFile(availableFiles[0].page);
  }, [isMod, file, availableFiles]);

  const chosen = isMod ? availableFiles.find((f) => f.page === file) ?? null : null;
  const filename = isMod ? fileNames[file] ?? null : details?.filename ?? null;
  return {
    details,
    error,
    loading: !details && !error,
    isMod,
    file,
    setFile,
    availableFiles,
    chosen,
    size: isMod ? chosen?.size ?? null : details?.size ?? null,
    filename,
    /** An installer: never run for the player; Install opens its page instead. */
    installer: INSTALLER_FILE.test(filename ?? ""),
    /** What Install fetches. */
    target: isMod ? chosen?.page ?? item.installPage : item.installPage || item.page,
  };
}
