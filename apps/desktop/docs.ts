/**
 * What a mod says about itself beyond its setup: its documentation (a readme, or a static site some
 * mods generate from their tables), its changelogs, and its links (homepage, forum, Discord…).
 *
 * Everything is found in the mod's own file list, which the library scan already has. Documentation
 * is served from the mod's folder under a sandbox policy with no scripts (see server.ts, `/api/docs/`).
 */

export type DocKind = "html" | "text" | "rtf";

export interface DocEntry {
  label: string;
  /** Relative to the mod folder, `/`-separated. */
  path: string;
  kind: DocKind;
}

export interface ModLink {
  label: string;
  url: string;
  kind: "discord" | "github" | "moddb" | "youtube" | "reddit" | "forum" | "docs" | "web";
}

const HTML = /\.html?$/i;
const TEXT = /\.(txt|md|nfo)$/i;
const RTF = /\.rtf$/i;
const CHANGELOG = /(change\s*-?_?log|changes|history|what'?s[\s_-]*new|patch[\s_-]*notes|release[\s_-]*notes)/i;
const README = /(read[\s_-]*me|manual|guide|faq|instructions|installation|install|info|description|about)/i;
const DOC_FOLDER = /^(doc|docs|documentation|manual|guide|help|readme|html)$/i;
/** A generated site can run to hundreds of pages; its entry points are what gets listed. */
const MAX_DOCS = 40;

function kindOf(path: string): DocKind | null {
  if (HTML.test(path)) return "html";
  if (TEXT.test(path)) return "text";
  if (RTF.test(path)) return "rtf";
  return null;
}

function labelOf(path: string): string {
  return path.split("/").pop()!.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
}

function dateScore(path: string): number {
  const text = path.replace(/\\/g, "/");
  const ymd = /(?:^|[^\d])((?:19|20)\d{2})[-_. ]([01]?\d)[-_. ]([0-3]?\d)(?:[^\d]|$)/.exec(text);
  if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const mdy = /(?:^|[^\d])([01]?\d)[-_. ]([0-3]?\d)[-_. ]((?:19|20)\d{2})(?:[^\d]|$)/.exec(text);
  if (mdy) return Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
  return 0;
}

/**
 * Documentation and changelogs among `files` (relative paths). A folder holding an `index.htm(l)` is
 * one site, listed by its index; other pages are listed only in documentation folders or at the top.
 * `readme` is the setup's `ModReadme` when it names a file in the mod.
 */
export function findDocs(
  files: readonly string[],
  readme: string | null,
): { docs: DocEntry[]; changelogs: DocEntry[] } {
  const changelogs: DocEntry[] = [];
  const docs: DocEntry[] = [];
  const seen = new Set<string>();
  const add = (list: DocEntry[], path: string) => {
    const kind = kindOf(path);
    if (!kind || seen.has(path.toLowerCase())) return;
    seen.add(path.toLowerCase());
    list.push({ label: labelOf(path), path, kind });
  };
  const visible = files.filter((path) => !/^save\//i.test(path));

  for (const path of visible) {
    if (CHANGELOG.test(path.split("/").pop()!) && kindOf(path)) add(changelogs, path);
  }
  changelogs.sort((a, b) => dateScore(b.path) - dateScore(a.path) || a.path.localeCompare(b.path));

  const wanted = readme?.replace(/\\/g, "/").toLowerCase();
  const setupReadme = wanted ? visible.find((path) => path.toLowerCase() === wanted) : undefined;
  if (setupReadme) add(docs, setupReadme);

  const sites = new Set(
    visible.filter((path) => /(^|\/)index\.html?$/i.test(path)).map((path) => path.slice(0, path.lastIndexOf("/") + 1)),
  );
  for (const folder of [...sites].sort((a, b) => a.length - b.length)) {
    const index = visible.find((path) =>
      path.toLowerCase().startsWith(folder.toLowerCase()) && /index\.html?$/i.test(path)
    );
    // Skipped when the setup's readme already named this index.
    if (index && !seen.has(index.toLowerCase())) {
      docs.push({
        label: folder ? `${folder.replace(/\/$/, "").split("/").pop()} (site)` : "Documentation",
        path: index,
        kind: "html",
      });
      seen.add(index.toLowerCase());
    }
  }
  const inSite = (path: string) => [...sites].some((folder) => path.toLowerCase().startsWith(folder.toLowerCase()));

  for (const path of visible) {
    if (docs.length >= MAX_DOCS) break;
    if (seen.has(path.toLowerCase()) || !kindOf(path) || inSite(path)) continue;
    const parts = path.split("/");
    const top = parts.length === 1;
    const inDocFolder = parts.slice(0, -1).some((part) => DOC_FOLDER.test(part));
    const name = parts[parts.length - 1]!;
    if (kindOf(path) === "html" ? top || inDocFolder : (top || inDocFolder) && (README.test(name) || inDocFolder)) {
      if (!CHANGELOG.test(name)) add(docs, path);
    }
  }
  return { docs, changelogs };
}

export function linkKind(url: string): ModLink["kind"] {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (/discord\.(gg|com|app)/.test(host)) return "discord";
  if (/github\.(com|io)/.test(host)) return "github";
  if (/moddb\.com/.test(host)) return "moddb";
  if (/youtube\.com|youtu\.be/.test(host)) return "youtube";
  if (/reddit\.com/.test(host)) return "reddit";
  if (/d2mods\.info|forum|board|phpbb|thephrozenkeep/.test(host + new URL(url).pathname)) return "forum";
  if (/docs\.google|wiki|fandom/.test(host)) return "docs";
  return "web";
}

/** Only real web addresses: a link is opened by the system, so nothing else may pass. */
export function webUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  try {
    const url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * A title's links: what its D2SE setup names (homepage, forum, and readme or description when they
 * are web addresses), what `exordium.mod.json` lists, then what the player added. Duplicates dropped.
 */
export function modLinks(
  setup: { homepage: string | null; board: string | null; readme: string | null; description: string | null } | null,
  ...lists: ({ label?: unknown; url?: unknown }[] | undefined)[]
): ModLink[] {
  const found: ModLink[] = [];
  const add = (label: string, value: unknown) => {
    const url = webUrl(value);
    if (!url || found.some((link) => link.url === url)) return;
    found.push({ label, url, kind: linkKind(url) });
  };
  if (setup) {
    add("Homepage", setup.homepage);
    add("Forum", setup.board);
    add("Readme", setup.readme);
    add("Description", setup.description);
  }
  for (const list of lists) {
    for (const link of list ?? []) {
      const url = webUrl(link.url);
      if (!url) continue;
      const label = typeof link.label === "string" && link.label.trim() ? link.label.trim() : new URL(url).hostname;
      add(label, url);
    }
  }
  return found;
}

/** Content types a documentation folder may serve; anything else is refused. No scripts, no SVG. */
export const DOC_TYPES: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  txt: "text/plain",
  md: "text/plain",
  nfo: "text/plain",
  rtf: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  ico: "image/x-icon",
};
