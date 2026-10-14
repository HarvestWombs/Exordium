/**
 * The mod browser's sources.
 *
 * - **archive.org** has a public search API (`advancedsearch.php`), per-item metadata listing every
 *   file, a thumbnail service and direct downloads, so it is listed, detailed and downloaded here.
 * - **ModDB** has public listing pages for files/addons/mods. Those are cached and listed as a
 *   lightweight catalog; specific download pages are fetched only when the player installs one.
 *
 * A download goes to Exordium's own folder (`downloads\<source>\<id>\`), is unpacked on the install's
 * drive and moved into its MODS folder (install.ts), and the archive is then deleted.
 */

import { installArchive, type InstallResult } from "./install.ts";

export const ARCHIVE_QUERY = 'subject:"Diablo 2 mod"';
export const MODDB_URL = "https://www.moddb.com/games/diablo-2-lod/mods";
const MODDB_CATALOGS = [
  { kind: "file", label: "Files", url: "https://www.moddb.com/games/diablo-2-lod/downloads" },
  { kind: "addon", label: "Addons", url: "https://www.moddb.com/games/diablo-2-lod/addons" },
  { kind: "mod", label: "Mods", url: "https://www.moddb.com/games/diablo-2-lod/mods" },
] as const;
const ARCHIVE_TTL_MS = 12 * 60 * 60 * 1000;
const MODDB_TTL_MS = 12 * 60 * 60 * 1000;
const MODDB_MAX_PAGES = 25;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const DOWNLOAD_FILE = /\.(zip|rar|7z|tar|tgz|gz|bz2|xz)$/i;
const EXECUTABLE_FILE = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar)$/i;

// ---- Keywords ---------------------------------------------------------------------------------------

export interface KeywordGroup {
  id: string;
  label: string;
  keywords: { id: string; label: string; pattern: RegExp }[];
}

/**
 * Common Diablo II modding terms, matched against an entry's title, description and tags. archive.org
 * items rarely tag more than "Diablo 2 mod", so the text is what there is. Plain dictionary matching:
 * an entry shows a keyword only when its own words say so.
 */
export const KEYWORD_GROUPS: KeywordGroup[] = [
  {
    id: "version",
    label: "GAME VERSION",
    keywords: [
      { id: "1.07", label: "1.07", pattern: /\b(v|patch\s*)?1\.07\b/i },
      { id: "1.08", label: "1.08", pattern: /\b(v|patch\s*)?1\.08\b/i },
      { id: "1.09", label: "1.09", pattern: /\b(v|patch\s*)?1\.09[a-d]?\b/i },
      { id: "1.10", label: "1.10", pattern: /\b(v|patch\s*)?1\.10[a-f]?\b/i },
      { id: "1.11", label: "1.11", pattern: /\b(v|patch\s*)?1\.11[ab]?\b/i },
      { id: "1.12", label: "1.12", pattern: /\b(v|patch\s*)?1\.12a?\b/i },
      { id: "1.13", label: "1.13", pattern: /\b(v|patch\s*)?1\.13[a-d]?\b/i },
      { id: "1.14", label: "1.14", pattern: /\b(v|patch\s*)?1\.14[a-d]?\b/i },
      { id: "lod", label: "Lord of Destruction", pattern: /\b(lod|lord of destruction|expansion)\b/i },
      { id: "classic", label: "Classic", pattern: /\bclassic\b/i },
    ],
  },
  {
    id: "kind",
    label: "KIND",
    keywords: [
      {
        id: "overhaul",
        label: "Overhaul",
        pattern: /\b(overhaul|total conversion|complete (mod|rework)|rebalanc\w*)\b/i,
      },
      { id: "items", label: "Items", pattern: /\b(items?|uniques?|runewords?|set items?|affix\w*|loot)\b/i },
      { id: "skills", label: "Skills & classes", pattern: /\b(skills?|skill trees?|new class\w*|classes)\b/i },
      { id: "monsters", label: "Monsters", pattern: /\b(monsters?|bosses|boss|enemies)\b/i },
      { id: "maps", label: "Maps & areas", pattern: /\b(maps?|areas?|levels?|dungeons?|zones?|acts?\s*[1-6vi]*)\b/i },
      {
        id: "graphics",
        label: "Graphics",
        pattern: /\b(graphics?|textures?|sprites?|hd|high resolution|resolution|d2gl|glide|widescreen)\b/i,
      },
      { id: "sound", label: "Sound & music", pattern: /\b(sounds?|music|audio|voice)\b/i },
      { id: "utility", label: "Tools & utilities", pattern: /\b(tool|utility|editor|loader|launcher|plugin)\b/i },
      { id: "fix", label: "Fixes", pattern: /\b(fix(es|ed)?|bug\s*fix\w*|patch(es)?)\b/i },
    ],
  },
  {
    id: "feature",
    label: "FEATURES",
    keywords: [
      { id: "plugy", label: "PlugY", pattern: /\bplugy\b/i },
      { id: "d2se", label: "D2SE", pattern: /\bd2se\b/i },
      { id: "d2mod", label: "D2Mod", pattern: /\bd2mod\b/i },
      {
        id: "multiplayer",
        label: "Multiplayer",
        pattern: /\b(multi\s*-?player|battle\.?net|pvpgn|realm|tcp\/?ip|lan|co-?op)\b/i,
      },
      { id: "single", label: "Single player", pattern: /\bsingle\s*-?player\b/i },
      { id: "hardcore", label: "Hardcore", pattern: /\bhardcore\b/i },
      { id: "stash", label: "Shared stash", pattern: /\b(shared stash|stash)\b/i },
      { id: "median", label: "Median XL", pattern: /\bmedian\b/i },
    ],
  },
];

/** The keyword ids an entry's text mentions, in dictionary order. */
export function keywordsFor(text: string): string[] {
  const found: string[] = [];
  for (const group of KEYWORD_GROUPS) {
    for (const keyword of group.keywords) {
      if (keyword.pattern.test(text)) found.push(keyword.id);
    }
  }
  return found;
}

/**
 * Plain text from an archive.org description: HTML dropped, entities decoded, whitespace collapsed,
 * and the Microsoft Translator widget text that several uploads pasted in along with their
 * description ("TRANSLATE with x English Arabic …") cut off.
 */
export function cleanDescription(html: unknown): string {
  const raw = Array.isArray(html) ? html.join("\n") : typeof html === "string" ? html : "";
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
  const tidy = text.replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n");
  const cut = tidy.search(/TRANSLATE\s+with\s+x\b/i);
  return (cut >= 0 ? tidy.slice(0, cut) : tidy).trim();
}

// ---- archive.org --------------------------------------------------------------------------------

export interface BrowseItem {
  source: "archive";
  id: string;
  title: string;
  description: string;
  creator: string | null;
  /** When it was uploaded (archive.org's publicdate), ISO. */
  addedAt: string | null;
  downloads: number;
  size: number;
  keywords: string[];
  page: string;
  cover: string;
}

export interface ModDbItem {
  source: "moddb";
  kind: "file" | "addon" | "mod";
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

interface ArchiveDoc {
  identifier?: string;
  title?: string;
  description?: unknown;
  subject?: string | string[];
  creator?: string | string[];
  publicdate?: string;
  downloads?: number;
  item_size?: number;
}

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : null;
}

export function archiveItemFromDoc(doc: ArchiveDoc): BrowseItem | null {
  const id = doc.identifier;
  if (!id || !ID.test(id)) return null;
  const title = firstString(doc.title) ?? id;
  const description = cleanDescription(doc.description);
  const subjects = Array.isArray(doc.subject) ? doc.subject.join(" ") : doc.subject ?? "";
  return {
    source: "archive",
    id,
    title,
    description,
    creator: firstString(doc.creator),
    addedAt: doc.publicdate ?? null,
    downloads: doc.downloads ?? 0,
    size: doc.item_size ?? 0,
    keywords: keywordsFor(`${title}\n${description}\n${subjects}`),
    page: `https://archive.org/details/${id}`,
    cover: `https://archive.org/services/img/${id}`,
  };
}

/** The whole archive.org list, from a cache under `cacheDir` that is refreshed after 12 hours. */
export async function archiveList(
  cacheDir: string,
  refresh = false,
): Promise<{ items: BrowseItem[]; fetchedAt: string }> {
  const file = `${cacheDir}/archive.json`;
  if (!refresh) {
    try {
      const cached = JSON.parse(await Deno.readTextFile(file)) as { items: BrowseItem[]; fetchedAt: string };
      if (Date.now() - Date.parse(cached.fetchedAt) < ARCHIVE_TTL_MS) return cached;
    } catch {
      // Missing or unreadable: fetch.
    }
  }
  const fields = ["identifier", "title", "description", "subject", "creator", "publicdate", "downloads", "item_size"];
  const query = new URLSearchParams({ q: ARCHIVE_QUERY, rows: "1000", page: "1", output: "json" });
  for (const field of fields) query.append("fl[]", field);
  const response = await fetch(`https://archive.org/advancedsearch.php?${query}`);
  if (!response.ok) throw new Error(`archive.org search answered ${response.status}`);
  const body = await response.json() as { response?: { docs?: ArchiveDoc[] } };
  const items = (body.response?.docs ?? []).map(archiveItemFromDoc).filter((item): item is BrowseItem => item !== null);
  const result = { items, fetchedAt: new Date().toISOString() };
  await Deno.mkdir(cacheDir, { recursive: true });
  await Deno.writeTextFile(file, JSON.stringify(result));
  return result;
}

// ---- ModDB --------------------------------------------------------------------------------------

function rssText(item: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i").exec(item);
  return match ? decodeXml(match[1] ?? "").trim() : "";
}

function rssAttr(item: string, tag: string, name: string): string {
  const match = new RegExp(`<(?:media:)?${tag}\\b[^>]*\\s${name}=["']([^"']+)["'][^>]*>`, "i").exec(item);
  return match ? decodeXml(match[1] ?? "").trim() : "";
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function modDbId(link: string): string {
  try {
    const url = new URL(link);
    return url.pathname.split("/").filter(Boolean).join("-").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 180) ||
      crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}

function modDbAbsolute(base: string, href: string): string | null {
  try {
    return new URL(decodeXml(href), base).href;
  } catch {
    return null;
  }
}

function modDbInstallPage(page: string, kind: ModDbItem["kind"]): string {
  if (kind !== "mod") return page;
  try {
    const url = new URL(page);
    const path = url.pathname.replace(/\/+$/, "");
    if (/^\/mods\/[^/]+$/i.test(path)) return `${url.origin}${path}/downloads`;
  } catch {
    // Fall through to the visible page.
  }
  return page;
}

export function modDbItemsFromHtml(
  html: string,
  kind: ModDbItem["kind"],
  sourceLabel: string,
  base = "https://www.moddb.com/",
): ModDbItem[] {
  return [
    ...html.matchAll(
      /<div\s+class=["'][^"']*\browcontent\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\s+class=["'][^"']*\browcontent\b|<\/div>\s*<\/div>\s*(?:<p class=["']view|<div class=["']pagination|$))/gi,
    ),
  ]
    .map((match) => {
      const row = match[1] ?? "";
      const titleLink = /<h4>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h4>/i.exec(row);
      const imageHref = /<a\b(?=[^>]*class=["'][^"']*\bimage\b[^"']*["'])[^>]*href=["']([^"']+)["']/i.exec(row)?.[1];
      const imageTitle = /<a\b(?=[^>]*class=["'][^"']*\bimage\b[^"']*["'])[^>]*title=["']([^"']*)["']/i.exec(row)?.[1];
      const imageSrc = /<img\b[^>]*src=["']([^"']+)["']/i.exec(row)?.[1];
      const href = titleLink?.[1] ?? imageHref ?? "";
      const page = modDbAbsolute(base, href) ?? "";
      const title = cleanDescription(titleLink?.[2] ?? imageTitle ?? `ModDB ${sourceLabel.toLowerCase()}`);
      const description = cleanDescription(/<p>([\s\S]*?)<\/p>/i.exec(row)?.[1] ?? "");
      const datetime = /<time\b[^>]*datetime=["']([^"']+)["']/i.exec(row)?.[1] ?? "";
      const cover = imageSrc ? modDbAbsolute(base, imageSrc) ?? "" : "";
      return {
        source: "moddb" as const,
        kind,
        sourceLabel,
        id: modDbId(page || title),
        title,
        description,
        addedAt: datetime ? new Date(datetime).toISOString() : null,
        page,
        installPage: modDbInstallPage(page, kind),
        cover,
        keywords: keywordsFor(`${title}\n${description}`),
      };
    })
    .filter((item) => item.page.startsWith("https://www.moddb.com/"));
}

export function modDbNextPage(html: string, base: string): string | null {
  const relNext = /<link\b(?=[^>]*\brel=["']next["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1];
  if (relNext) return modDbAbsolute(base, relNext);

  const pagination =
    /<a\b(?=[^>]*\bclass=["'][^"']*\bnext\b[^"']*["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1] ??
      /<a\b(?=[^>]*\bhref=["']([^"']*\/page\/\d+[^"']*)["'])[^>]*>\s*Next\s*<\/a>/i.exec(html)?.[1];
  return pagination ? modDbAbsolute(base, pagination) : null;
}

async function modDbCatalogItems(catalog: typeof MODDB_CATALOGS[number]): Promise<ModDbItem[]> {
  const items: ModDbItem[] = [];
  const seenPages = new Set<string>();
  let next: string | null = catalog.url;
  for (let page = 0; next && page < MODDB_MAX_PAGES; page++) {
    if (seenPages.has(next)) break;
    seenPages.add(next);
    const response = await fetch(next, { headers: { "user-agent": "Exordium" } });
    if (!response.ok) throw new Error(`ModDB ${catalog.label} answered ${response.status}`);
    const html = await response.text();
    items.push(...modDbItemsFromHtml(html, catalog.kind, catalog.label, next));
    next = modDbNextPage(html, next);
  }
  return items;
}

export function modDbItemsFromRss(
  xml: string,
  kind: ModDbItem["kind"] = "file",
  sourceLabel = "Files",
): ModDbItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => {
    const row = match[1] ?? "";
    const title = rssText(row, "title") || `ModDB ${sourceLabel.toLowerCase()}`;
    const page = rssText(row, "link");
    const description = cleanDescription(rssText(row, "description"));
    const addedAtText = rssText(row, "pubDate");
    const cover = rssAttr(row, "thumbnail", "url") || rssAttr(row, "content", "url");
    return {
      source: "moddb" as const,
      kind,
      sourceLabel,
      id: modDbId(page || title),
      title,
      description,
      addedAt: addedAtText ? new Date(addedAtText).toISOString() : null,
      page,
      installPage: modDbInstallPage(page, kind),
      cover,
      keywords: keywordsFor(`${title}\n${description}`),
    };
  }).filter((item) => item.page.startsWith("https://www.moddb.com/"));
}

/** Cached ModDB catalog. Refreshes at most every 12 hours unless the user asks. */
export async function modDbList(cacheDir: string, refresh = false): Promise<{ items: ModDbItem[]; fetchedAt: string }> {
  const file = `${cacheDir}/moddb.json`;
  if (!refresh) {
    try {
      const cached = JSON.parse(await Deno.readTextFile(file)) as { items: ModDbItem[]; fetchedAt: string };
      if (Date.now() - Date.parse(cached.fetchedAt) < MODDB_TTL_MS) {
        return {
          ...cached,
          items: cached.items.map((item) => ({ ...item, cover: modDbImage(item.cover, "thumb_620x2000") })),
        };
      }
    } catch {
      // Missing or unreadable: fetch.
    }
  }
  const byPage = new Map<string, ModDbItem>();
  for (const catalog of MODDB_CATALOGS) {
    for (const item of await modDbCatalogItems(catalog)) byPage.set(`${item.kind}:${item.page}`, item);
  }
  const result = {
    items: [...byPage.values()].sort((a, b) => Date.parse(b.addedAt ?? "0") - Date.parse(a.addedAt ?? "0")),
    fetchedAt: new Date().toISOString(),
  };
  await Deno.mkdir(cacheDir, { recursive: true });
  await Deno.writeTextFile(file, JSON.stringify(result));
  return {
    ...result,
    items: result.items.map((item) => ({ ...item, cover: modDbImage(item.cover, "thumb_620x2000") })),
  };
}

/**
 * A ModDB image at one of the sizes its cache serves for every picture: `crop_120x90` (what listings
 * show) for strips, `thumb_620x2000` (what entry pages show) for cards, or `original`, the upload as
 * posted, for screenshots seen large (an 800x600 shot is 620x465 as a thumb). The same picture is at
 * `media.moddb.com/cache/images/<path>/<size>/<name>`; the original drops `cache/` and the size
 * (`media.moddb.com/images/<path>/<name>`). Other sizes exist only where ModDB's own pages used them
 * (measured 2026-10-10; originals 2026-10-14).
 */
export function modDbImage(url: string, size: "crop_120x90" | "thumb_620x2000" | "original"): string {
  const match =
    /^https:\/\/media\.moddb\.com\/(?:cache\/)?images\/([a-z]+\/\d+\/\d+\/\d+)\/(?:(?:crop|thumb|resize)_\d+x\d+\/)?([^/?#]+)$/i
      .exec(url.trim());
  if (!match) return url;
  return size === "original"
    ? `https://media.moddb.com/images/${match[1]}/${match[2]}`
    : `https://media.moddb.com/cache/images/${match[1]}/${size}/${match[2]}`;
}

export interface ModDbFile {
  /** The file's ModDB page, which leads to its download. */
  page: string;
  name: string;
  /** Bytes, from the size ModDB shows ("15.29mb"); null when it shows none. */
  size: number | null;
  category: string | null;
}

export interface ModDbDetails {
  page: string;
  description: string;
  creator: string | null;
  addedAt: string | null;
  updatedAt: string | null;
  /** A single file's size, in bytes (file and addon pages). */
  size: number | null;
  downloads: number | null;
  /** A single file's name: `.exe` ones are never installed for the player. */
  filename: string | null;
  screenshots: { full: string; thumb: string }[];
  /** A mod's files, newest first, for choosing which to install. */
  files: ModDbFile[];
  links: { label: string; url: string }[];
  /** A file's or addon's mod, whose screenshots it borrows when it has few of its own. */
  parentMod: string | null;
}

/** ModDB's own size text ("15.29mb", "1.05gb", "512kb") in bytes. */
export function modDbBytes(text: string): number | null {
  const exact = /\(([\d,]+)\s*bytes\)/i.exec(text);
  if (exact) return Number(exact[1]!.replace(/,/g, ""));
  const match = /([\d.]+)\s*(b|kb|mb|gb)\b/i.exec(text);
  if (!match) return null;
  const scale = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[match[2]!.toLowerCase() as "b"];
  return Math.round(Number(match[1]) * scale);
}

/** The `<h5>Label</h5><span class="summary">…</span>` rows of ModDB's side tables, by label. */
function modDbFacts(html: string): Map<string, string> {
  const facts = new Map<string, string>();
  for (const match of html.matchAll(/<h5>([^<]+)<\/h5>\s*<span class="summary">([\s\S]*?)<\/span>\s*<\/div>/gi)) {
    const label = match[1]!.trim().toLowerCase();
    if (!facts.has(label)) facts.set(label, match[2]!);
  }
  return facts;
}

/** The text of the element whose opening tag carries `id`, up to its first closing `</div>`. */
function modDbBlock(html: string, id: string): string {
  const at = html.search(new RegExp(`<[a-z]+\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i"));
  if (at < 0) return "";
  const open = html.indexOf(">", at) + 1;
  const end = html.indexOf("</div>", open);
  return html.slice(open, end < 0 ? undefined : end);
}

export function modDbDetailsFromHtml(html: string, page: string): ModDbDetails {
  const facts = modDbFacts(html);
  const text = (label: string) => {
    const raw = facts.get(label);
    return raw === undefined ? null : cleanDescription(raw).replace(/\s+/g, " ").trim() || null;
  };
  const time = (label: string) => {
    const at = /<time\b[^>]*datetime=["']([^"']+)["']/i.exec(facts.get(label) ?? "")?.[1];
    return at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : null;
  };

  const description = cleanDescription(modDbBlock(html, "downloaddescription").replace(/<hr\s*\/?>/gi, "")) ||
    cleanDescription(modDbBlock(html, "profiledescription")) ||
    cleanDescription(/<p\b[^>]*id=["']downloadsummary["'][^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? "") ||
    decodeXml(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)?.[1] ?? "");

  const shots: ModDbDetails["screenshots"] = [];
  const seen = new Set<string>();
  const addShot = (url: string) => {
    const full = modDbImage(url, "original");
    if (seen.has(full) || !full.startsWith("https://media.moddb.com/")) return;
    seen.add(full);
    shots.push({ full, thumb: modDbImage(url, "crop_120x90") });
  };
  for (const match of modDbBlock(html, "imagebox").matchAll(/<img\b[^>]*src=["']([^"']+)["']/gi)) addShot(match[1]!);
  // A file's or addon's own picture; a mod's og:image is its logo, kept last.
  const og = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (og && /\/images\/downloads\//i.test(og)) {
    shots.unshift({ full: modDbImage(og, "original"), thumb: modDbImage(og, "crop_120x90") });
  } else if (og && shots.length === 0) addShot(og);

  // The side profile is the entry's mod's, or the game's for a game-level addon: its files and
  // homepage count only when they are a mod's own.
  const location = facts.get("location") ?? "";
  const parent = [...location.matchAll(/href=["'](\/mods\/[^"'/]+)["']/gi)].map((m) => m[1]!).at(-1);
  const parentMod = parent ? modDbAbsolute(page, parent) : null;
  const ownMod = /^https:\/\/www\.moddb\.com\/mods\/[^/]+$/i.test(page.replace(/\/+$/, "")) ? page : parentMod;

  // The sidebar's download buttons: every file of the mod, with its category and size.
  const files: ModDbFile[] = [];
  for (
    const match of html.matchAll(
      /<a\s+href=["']([^"']+\/downloads\/[^"'#?]+)["'][^>]*class=["']button buttonfull["'][^>]*>([\s\S]*?)<\/a>/gi,
    )
  ) {
    const filePage = modDbAbsolute(page, match[1]!);
    if (!filePage || !ownMod || !filePage.startsWith(`${ownMod.replace(/\/+$/, "")}/downloads/`)) continue;
    if (files.some((f) => f.page === filePage)) continue;
    const spans = [...match[2]!.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((s) => cleanDescription(s[1]!));
    files.push({
      page: filePage,
      category: spans[0] || null,
      name: spans[1] || filePage.split("/").pop()!,
      size: spans[3] ? modDbBytes(spans[3]) : null,
    });
  }

  const links: ModDbDetails["links"] = [];
  const homepage = /<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/i.exec(facts.get("homepage") ?? "")?.[1];
  if (homepage && ownMod) links.push({ label: "Homepage", url: decodeXml(homepage) });

  const downloads = /([\d,]+)/.exec(text("downloads") ?? "")?.[1];
  return {
    page,
    description,
    creator: (text("uploader") ?? text("creator") ?? text("developer") ?? text("publisher") ?? text("author"))
      ?.replace(/^\((.*)\)$/, "$1") ?? null,
    addedAt: time("added") ?? time("release date"),
    updatedAt: time("updated") ?? time("last update"),
    size: facts.has("size") ? modDbBytes(cleanDescription(facts.get("size")!)) : null,
    downloads: downloads ? Number(downloads.replace(/,/g, "")) : null,
    filename: text("filename"),
    screenshots: shots,
    files,
    links,
    parentMod,
  };
}

const MODDB_DETAILS_TTL_MS = 12 * 60 * 60 * 1000;

async function fetchModDbDetails(page: string): Promise<ModDbDetails> {
  const response = await fetch(page, { headers: { "user-agent": "Exordium" } });
  if (!response.ok) throw new Error(`ModDB answered ${response.status} for this page.`);
  return modDbDetailsFromHtml(await response.text(), page);
}

/**
 * One ModDB entry's page, read once its card comes on screen and cached for 12 hours. A file or
 * addon with fewer than two pictures also shows its mod's screenshots.
 */
export async function modDbDetails(cacheDir: string, page: string, refresh = false): Promise<ModDbDetails> {
  if (!/^https:\/\/www\.moddb\.com\/[^?#]+$/i.test(page)) throw new Error("Not a ModDB page.");
  const file = `${cacheDir}/moddb-items/${modDbId(page)}.json`;
  if (!refresh) {
    try {
      const cached = JSON.parse(await Deno.readTextFile(file)) as { at: string; details: ModDbDetails };
      if (Date.now() - Date.parse(cached.at) < MODDB_DETAILS_TTL_MS) {
        // Cached before the originals were used: the same shots, full size.
        for (const shot of cached.details.screenshots) shot.full = modDbImage(shot.full, "original");
        return cached.details;
      }
    } catch {
      // Missing or unreadable: fetch.
    }
  }
  const details = await fetchModDbDetails(page);
  if (details.parentMod && details.parentMod !== page && details.screenshots.length < 2) {
    const parent = await modDbDetails(cacheDir, details.parentMod).catch(() => null);
    for (const shot of parent?.screenshots ?? []) {
      if (!details.screenshots.some((s) => s.full === shot.full)) details.screenshots.push(shot);
    }
  }
  await Deno.mkdir(`${cacheDir}/moddb-items`, { recursive: true });
  await Deno.writeTextFile(file, JSON.stringify({ at: new Date().toISOString(), details }));
  return details;
}

export interface ItemFile {
  name: string;
  size: number;
}

/** A file inside an item's archive, as archive.org lists it. */
export interface ArchiveMember {
  path: string;
  size: number;
}

export interface ItemDetails {
  id: string;
  /** The best description found: the mod's readme, its D2SE description, or the uploader's. */
  description: string;
  /** Where the description came from, e.g. "Readme.txt inside the archive". */
  descriptionSource: string | null;
  /** What can be downloaded: the uploader's own archives and installers. */
  archives: ItemFile[];
  screenshots: { full: string; thumb: string }[];
  /** Homepage, forum… named by the mod's own D2SE_SETUP.ini inside the archive. */
  links: { label: string; url: string }[];
  /** Keywords the archive's contents add: D2SE-ready, PlugY, D2Mod, the core version. */
  keywords: string[];
  /** The main archive's unpacked size, from its listing; 0 when unknown. */
  unpackedSize: number;
}

const ARCHIVE_FILE = /\.(zip|rar|7z|mpq)$/i;
const LISTABLE = /\.(zip|rar|7z)$/i;
const IMAGE_FILE = /\.(png|jpe?g|gif|bmp|webp)$/i;
/** Bumped when what is stored per item changes, so old cached details are read again. */
const DETAILS_VERSION = 2;
const details = new Map<string, ItemDetails>();

function downloadUrl(id: string, name: string): string {
  return `https://archive.org/download/${id}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

/** Screenshots go through the app's own cache (browseImage), so a gallery click is instant. */
function imageUrl(id: string, name: string): string {
  return `/api/browse/image?id=${encodeURIComponent(id)}&file=${encodeURIComponent(name)}`;
}

/**
 * archive.org's listing of the files inside an archive: its "view contents" page, one row per file
 * with its size. Works for zip, 7z and rar; serving a single file from inside works for zip only
 * (a file inside a 7z comes back empty).
 */
export function parseArchiveListing(html: string): ArchiveMember[] {
  const members: ArchiveMember[] = [];
  const row =
    /<a href="\/\/archive\.org\/download\/[^"]+?\.(?:zip|rar|7z)\/([^"]+)">[^<]*<\/a><td>[^<]*<td>[^<]*<td id="size">(\d+)/gi;
  for (const match of html.matchAll(row)) {
    try {
      members.push({ path: decodeURIComponent(match[1]!), size: Number(match[2]) });
    } catch {
      // A name that does not decode is skipped.
    }
  }
  return members;
}

/** What an archive's file names say about the mod inside it. */
export function contentKeywords(members: readonly ArchiveMember[]): string[] {
  const names = members.map((member) => member.path.toLowerCase());
  const has = (pattern: RegExp) => names.some((name) => pattern.test(name));
  const found: string[] = [];
  if (has(/(^|\/)d2se_setup\.ini$/)) found.push("d2se");
  if (has(/(^|\/)plugy\.dll$/)) found.push("plugy");
  if (has(/(^|\/)d2mod\.dll$/)) found.push("d2mod");
  if (has(/(^|\/)(d2gl\.mpq|d2gl\.ini|glide3x\.dll)$/)) found.push("graphics");
  return found;
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** A small text file from inside a zip on archive.org; null when it cannot be read. */
async function memberText(id: string, archive: string, member: string, limit = 24 * 1024): Promise<string | null> {
  try {
    const response = await fetch(`${downloadUrl(id, archive)}/${member.split("/").map(encodeURIComponent).join("/")}`);
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < limit) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    const text = decodeText(bytes.subarray(0, limit)).replace(/\r\n?/g, "\n").trim();
    return text || null;
  } catch {
    return null;
  }
}

/** key=value from an ini's text, keys lowercased; later wins. */
function iniValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values.set(match[1]!.toLowerCase(), match[2]!);
  }
  return values;
}

const README = /(^|\/)(read\s*-?_?me|mod\s*info|modinfo|info|description|about)[^/]*\.(txt|nfo|md)$/i;

/**
 * Reads what the mod inside an item's main archive says about itself: from the listing, what it
 * contains; for a zip, its D2SE_SETUP.ini (description, homepage, forum, core) and its readme.
 */
async function enrich(id: string, archive: ItemFile): Promise<Partial<ItemDetails>> {
  if (!LISTABLE.test(archive.name)) return {};
  let members: ArchiveMember[] = [];
  try {
    const response = await fetch(`${downloadUrl(id, archive.name)}/`);
    if (response.ok) members = parseArchiveListing(await response.text());
  } catch {
    return {};
  }
  const result: Partial<ItemDetails> = {
    keywords: contentKeywords(members),
    unpackedSize: members.reduce((sum, member) => sum + member.size, 0),
    links: [],
  };
  if (!/\.zip$/i.test(archive.name)) return result;

  const setupMember = members
    .filter((member) => /(^|\/)d2se_setup\.ini$/i.test(member.path))
    .sort((a, b) => a.path.length - b.path.length)[0];
  const modDir = setupMember ? setupMember.path.slice(0, setupMember.path.lastIndexOf("/") + 1) : "";
  let setupDescription: string | null = null;
  let readmePath: string | null = null;
  if (setupMember) {
    const text = await memberText(id, archive.name, setupMember.path);
    if (text) {
      const ini = iniValues(text);
      for (const [key, label] of [["modhp", "Homepage"], ["modboard", "Forum"]] as const) {
        const url = ini.get(key);
        if (url && /^https?:\/\//i.test(url)) result.links!.push({ label, url });
      }
      const description = ini.get("moddescription");
      if (description && !/^https?:\/\//i.test(description)) setupDescription = description;
      const readme = ini.get("modreadme");
      if (readme && !/^https?:\/\//i.test(readme)) readmePath = `${modDir}${readme.replace(/\\/g, "/")}`;
      const core = ini.get("d2core");
      if (core) result.keywords!.push(...keywordsFor(core));
    }
  }
  const readmeMember = members.find((member) => readmePath && member.path.toLowerCase() === readmePath.toLowerCase()) ??
    members
      .filter((member) => README.test(member.path) && member.size < 512 * 1024)
      .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
  if (readmeMember) {
    const text = await memberText(id, archive.name, readmeMember.path);
    if (text) {
      result.description = text;
      result.descriptionSource = `${readmeMember.path.split("/").pop()} inside the archive`;
      result.keywords!.push(...keywordsFor(text));
      return result;
    }
  }
  if (setupDescription) {
    result.description = setupDescription;
    result.descriptionSource = "D2SE_SETUP.ini inside the archive";
  }
  return result;
}

/**
 * An item's files, screenshots and description: archive.org's metadata, then what its main archive
 * holds (enrich). Kept in memory and on disk under `cacheDir`, so each item is read once.
 */
export async function archiveItem(id: string, cacheDir: string): Promise<ItemDetails> {
  if (!ID.test(id)) throw new Error("Bad item id");
  const known = details.get(id);
  if (known) return known;
  const cacheFile = `${cacheDir}/items/${id}.json`;
  try {
    const cached = JSON.parse(await Deno.readTextFile(cacheFile)) as ItemDetails & { version?: number };
    if (cached.version === DETAILS_VERSION) {
      details.set(id, cached);
      return cached;
    }
  } catch {
    // Not cached yet.
  }

  const response = await fetch(`https://archive.org/metadata/${id}`);
  if (!response.ok) throw new Error(`archive.org metadata answered ${response.status}`);
  const body = await response.json() as {
    metadata?: { description?: unknown };
    files?: { name: string; size?: string; source?: string }[];
  };
  const files = body.files ?? [];
  const names = new Set(files.map((file) => file.name));
  const originals = files.filter((file) => file.source === "original");
  const archives = originals
    .filter((file) => ARCHIVE_FILE.test(file.name))
    .map((file) => ({ name: file.name, size: Number(file.size ?? 0) }));
  const uploaderDescription = cleanDescription(body.metadata?.description);
  const main = [...archives].filter((a) => LISTABLE.test(a.name)).sort((a, b) => b.size - a.size)[0];
  const extra = main ? await enrich(id, main) : {};
  const result: ItemDetails = {
    id,
    // "Diablo 2 mod" alone is the upload form's subject, not a description.
    description: extra.description ??
      (uploaderDescription && !/^diablo\s*(2|ii)\s*mod\.?$/i.test(uploaderDescription) ? uploaderDescription : ""),
    descriptionSource: extra.descriptionSource ?? (uploaderDescription ? "archive.org" : null),
    archives,
    screenshots: originals
      .filter((file) => IMAGE_FILE.test(file.name) && !file.name.startsWith("__ia_thumb"))
      .map((file) => {
        const thumb = `${file.name.replace(/\.[^.]+$/, "")}_thumb.jpg`;
        return { full: imageUrl(id, file.name), thumb: imageUrl(id, names.has(thumb) ? thumb : file.name) };
      }),
    links: extra.links ?? [],
    keywords: [...new Set(extra.keywords ?? [])],
    unpackedSize: extra.unpackedSize ?? 0,
  };
  details.set(id, result);
  await Deno.mkdir(`${cacheDir}/items`, { recursive: true });
  await Deno.writeTextFile(cacheFile, JSON.stringify({ ...result, version: DETAILS_VERSION }));
  return result;
}

/**
 * A screenshot, from the disk cache or fetched once into it. Only an image file of a listed item can
 * be asked for. The browser may keep it for good: an archive.org file under a name never changes.
 */
export async function browseImage(cacheDir: string, id: string, file: string): Promise<Response> {
  if (!ID.test(id) || !IMAGE_FILE.test(file) || file.includes("..") || file.includes("\\")) {
    return new Response("Not found", { status: 404 });
  }
  const local = `${cacheDir}/images/${id}/${file.replace(/\//g, "__")}`;
  const type = /\.png$/i.test(file)
    ? "image/png"
    : /\.gif$/i.test(file)
    ? "image/gif"
    : /\.webp$/i.test(file)
    ? "image/webp"
    : /\.bmp$/i.test(file)
    ? "image/bmp"
    : "image/jpeg";
  const headers = { "content-type": type, "cache-control": "public, max-age=31536000, immutable" };
  try {
    return new Response((await Deno.readFile(local)).slice(), { headers });
  } catch {
    // Not cached yet.
  }
  const response = await fetch(downloadUrl(id, file));
  if (!response.ok) return new Response("Not found", { status: 404 });
  const bytes = new Uint8Array(await response.arrayBuffer());
  await Deno.mkdir(local.slice(0, local.lastIndexOf("/")), { recursive: true });
  await Deno.writeFile(local, bytes);
  return new Response(bytes.slice(), { headers });
}

// ---- Jobs: download, unpack, install ---------------------------------------------------------------

export type JobState = "downloading" | "extracting" | "installing" | "installed" | "downloaded" | "failed";

export interface Job {
  source: "archive" | "url";
  id: string;
  title: string;
  file: string;
  /** The archive on disk; gone once it has been unpacked. */
  path: string;
  state: JobState;
  received: number;
  total: number;
  extracted: number;
  /** Unpacked size, when the listing gave it: extraction progress is `extracted / unpackedSize`. */
  unpackedSize: number;
  installing: string | null;
  result: InstallResult | null;
  error?: string;
  startedAt: string;
  endedAt?: string;
}

const jobs = new Map<string, Job>();

export function urlDownloadId(url: string): string {
  const bytes = new TextEncoder().encode(url.trim());
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `url-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/^"|"$/g, ""));
    } catch {
      return encoded.replace(/^"|"$/g, "");
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1];
  return plain?.trim() || null;
}

function safeDownloadName(name: string, fallback: string): string {
  const raw = name.split(/[\\/]/).pop()?.trim() || fallback;
  const printable = [...raw].map((char) => (char.charCodeAt(0) < 32 ? " " : char)).join("");
  const clean = printable.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return clean || fallback;
}

export function executableInstallWarning(name: string): string | null {
  if (!EXECUTABLE_FILE.test(name)) return null;
  return `${name} is an executable installer. Exordium will not run or unpack executable downloads automatically. ` +
    "Open the ModDB page and install it manually only if you trust the author and the file.";
}

function likelyDownload(response: Response, original: URL): boolean {
  const name = filenameFromDisposition(response.headers.get("content-disposition")) ??
    safeDownloadName(new URL(response.url || original.href).pathname.split("/").pop() ?? "", "");
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  return DOWNLOAD_FILE.test(name) || type.includes("application/octet-stream") || type.includes("application/zip") ||
    type.includes("application/x-7z-compressed") || type.includes("application/x-rar");
}

function absoluteUrl(base: URL, href: string): string | null {
  try {
    return new URL(href.replace(/&amp;/g, "&"), base).href;
  } catch {
    return null;
  }
}

export function modDbDownloadLinks(html: string, base = "https://www.moddb.com/"): string[] {
  const direct: string[] = [];
  const details: string[] = [];
  const indexes: string[] = [];
  const page = new URL(base);
  const keep = (link: string) => {
    const url = new URL(link);
    const path = url.pathname.replace(/\/+$/, "");
    return path !== page.pathname.replace(/\/+$/, "") && !/\/downloads\/add$/i.test(path);
  };
  for (const match of html.matchAll(/href\s*=\s*["']([^"']*(?:\/downloads\/(?:start|mirror)\/[^"']+))["']/gi)) {
    const link = absoluteUrl(page, match[1]!);
    if (link && !direct.includes(link)) direct.push(link);
  }
  for (const match of html.matchAll(/<h4>\s*<a\b[^>]*href=["']([^"']*\/downloads\/[^"']+)["'][^>]*>/gi)) {
    const link = absoluteUrl(page, match[1]!);
    if (link && keep(link) && !details.includes(link)) details.push(link);
  }
  for (const match of html.matchAll(/href\s*=\s*["']([^"']*\/mods\/[^"'/]+\/downloads\/?)["']/gi)) {
    const link = absoluteUrl(page, match[1]!);
    if (link && keep(link) && !indexes.includes(link)) indexes.push(link);
  }
  for (const match of html.matchAll(/<h4>\s*<a\b[^>]*href=["']([^"']*\/addons\/[^"']+)["'][^>]*>/gi)) {
    const link = absoluteUrl(page, match[1]!);
    if (link && keep(link) && !details.includes(link)) details.push(link);
  }
  direct.sort((a, b) => Number(b.includes("/downloads/mirror/")) - Number(a.includes("/downloads/mirror/")));
  return [...direct, ...details, ...indexes];
}

async function openDownload(url: string): Promise<{ response: Response; name: string; finalUrl: string }> {
  let current = new URL(url);
  if (current.protocol !== "http:" && current.protocol !== "https:") throw new Error("Only http and https URLs work.");
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (seen.has(current.href)) break;
    seen.add(current.href);
    const response = await fetch(current.href, { headers: { "user-agent": "Exordium" } });
    const finalUrl = new URL(response.url || current.href);
    if (!response.ok || !response.body) {
      throw new Error(`${finalUrl.hostname} answered ${response.status}.`);
    }
    if (likelyDownload(response, current)) {
      const name = safeDownloadName(
        filenameFromDisposition(response.headers.get("content-disposition")) ??
          finalUrl.pathname.split("/").pop() ?? "",
        `${urlDownloadId(url)}.zip`,
      );
      const executableWarning = executableInstallWarning(name);
      if (executableWarning) throw new Error(executableWarning);
      return { response, name, finalUrl: finalUrl.href };
    }
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!type.includes("text/html")) {
      throw new Error(`The URL did not return an archive (${type || "unknown content type"}).`);
    }
    const html = await response.text();
    const next = modDbDownloadLinks(html, finalUrl.href)[0];
    if (!next) throw new Error("That page did not expose an archive download link.");
    current = new URL(next);
  }
  throw new Error("Could not resolve that download link.");
}

// Throughput, for the downloads page's graph: bytes from the network and bytes written to disk.
const counters = { net: 0, disk: 0 };
const history: { t: number; net: number; disk: number }[] = [];
const HISTORY_SECONDS = 300;
let sampler: number | null = null;
let last = { net: 0, disk: 0 };

function sample() {
  history.push({ t: Date.now(), net: counters.net - last.net, disk: counters.disk - last.disk });
  last = { ...counters };
  while (history.length > HISTORY_SECONDS) history.shift();
  const active = [...jobs.values()].some((job) => ["downloading", "extracting", "installing"].includes(job.state));
  // Keeps sampling for a minute after the last job, so the graph settles to zero before it stops.
  if (!active && history.slice(-60).every((point) => point.net === 0 && point.disk === 0) && sampler !== null) {
    clearInterval(sampler);
    sampler = null;
  }
}

function startSampling() {
  if (sampler === null) {
    last = { ...counters };
    sampler = setInterval(sample, 1000);
  }
}

export function throughput() {
  return {
    history,
    peakNet: Math.max(0, ...history.map((point) => point.net)),
    peakDisk: Math.max(0, ...history.map((point) => point.disk)),
    totalNet: counters.net,
    totalDisk: counters.disk,
  };
}

/**
 * This session's jobs, plus any archive already in the downloads folder (downloaded in an earlier
 * session, or kept because installing it failed), so it can still be installed.
 */
export async function jobList(folder: string): Promise<Job[]> {
  const list = [...jobs.values()];
  const known = new Set(list.map((job) => `${job.id}/${job.file.split("/").pop()}`.toLowerCase()));
  try {
    for await (const item of Deno.readDir(`${folder}/archive`)) {
      if (!item.isDirectory || !ID.test(item.name)) continue;
      for await (const entry of Deno.readDir(`${folder}/archive/${item.name}`)) {
        if (!entry.isFile || entry.name.endsWith(".part")) continue;
        if (known.has(`${item.name}/${entry.name}`.toLowerCase())) continue;
        const path = `${folder}/archive/${item.name}/${entry.name}`;
        const info = await Deno.stat(path);
        list.push({
          source: "archive",
          id: item.name,
          title: item.name,
          file: entry.name,
          path: path.replace(/\//g, "\\"),
          state: "downloaded",
          received: info.size,
          total: info.size,
          extracted: 0,
          unpackedSize: 0,
          installing: null,
          result: null,
          startedAt: (info.mtime ?? new Date()).toISOString(),
        });
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return list;
}

/** The archive of `file` for item `id` in the downloads folder, or null. An id and one file name only. */
export async function downloadedFile(folder: string, id: string, file: string): Promise<string | null> {
  const name = file.split("/").pop() ?? "";
  if (!ID.test(id) || !name || name.includes("\\") || name === "." || name === "..") return null;
  const path = `${folder}/archive/${id}/${name}`;
  const info = await Deno.stat(path).catch(() => null);
  return info?.isFile ? path : null;
}

export interface InstallTarget {
  /** The install's MODS folder. */
  modsDir: string;
  /** A folder on the same drive as MODS, for unpacking: the final move is then a rename. */
  stagingDir: string;
}

export interface DownloadSettings {
  keepArchives?: boolean;
  verifyAfterDownload?: boolean;
}

export function activeJobCount(): number {
  return [...jobs.values()].filter((job) => ["downloading", "extracting", "installing"].includes(job.state)).length;
}

async function runInstall(
  job: Job,
  archive: string,
  folder: string,
  target: InstallTarget,
  settings: DownloadSettings = {},
) {
  job.state = "extracting";
  let written = 0;
  try {
    const result = await installArchive(archive, `${target.stagingDir}/${job.id}`, target.modsDir, job.title, {
      expectedBytes: job.unpackedSize,
      keepDir: `${folder}/archive/${job.id}/unpacked`,
      onExtract: (bytes) => {
        counters.disk += Math.max(0, bytes - written);
        written = bytes;
        job.extracted = bytes;
      },
      onInstall: (name) => {
        job.state = "installing";
        job.installing = name;
      },
    });
    job.result = result;
    job.state = "installed";
    if (!settings.keepArchives) {
      // Unpacked: the archive is only taking space now.
      await Deno.remove(archive).catch(() => {});
      job.path = "";
    }
  } catch (error) {
    job.state = "failed";
    job.error = (error as Error).message;
  } finally {
    job.installing = null;
    job.endedAt = new Date().toISOString();
  }
}

/**
 * Downloads one of an item's own files, then unpacks and installs it. Only a file the item's metadata
 * lists can be asked for. The archive is deleted once unpacked; it stays when unpacking fails, so it
 * can be tried again.
 */
export async function startJob(
  folder: string,
  cacheDir: string,
  id: string,
  file: string,
  title: string,
  target: InstallTarget,
  settings: DownloadSettings = {},
): Promise<Job> {
  const item = await archiveItem(id, cacheDir);
  const listed = item.archives.find((archive) => archive.name === file);
  if (!listed) throw new Error("That file is not one of this item's downloads.");
  const key = `archive:${id}/${file}`;
  const current = jobs.get(key);
  if (current && ["downloading", "extracting", "installing"].includes(current.state)) return current;

  const dir = `${folder}/archive/${id}`;
  const name = file.split("/").pop()!;
  const main = [...item.archives].sort((a, b) => b.size - a.size)[0];
  const job: Job = {
    source: "archive",
    id,
    title,
    file,
    path: `${dir}/${name}`.replace(/\//g, "\\"),
    state: "downloading",
    received: 0,
    total: listed.size,
    extracted: 0,
    unpackedSize: main?.name === file ? item.unpackedSize : 0,
    installing: null,
    result: null,
    startedAt: new Date().toISOString(),
  };
  jobs.set(key, job);
  startSampling();

  void (async () => {
    const partial = `${dir}/${name}.part`;
    const existing = await downloadedFile(folder, id, file);
    if (existing) return await runInstall(job, existing, folder, target, settings);
    try {
      await Deno.mkdir(dir, { recursive: true });
      const response = await fetch(downloadUrl(id, file));
      if (!response.ok || !response.body) throw new Error(`archive.org answered ${response.status}`);
      job.total = Number(response.headers.get("content-length")) || job.total;
      const out = await Deno.open(partial, { write: true, create: true, truncate: true });
      // Counted on the way through; pipeTo closes the file when the body ends.
      await response.body
        .pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              job.received += chunk.length;
              counters.net += chunk.length;
              counters.disk += chunk.length;
              controller.enqueue(chunk);
            },
          }),
        )
        .pipeTo(out.writable);
      if (settings.verifyAfterDownload && job.total > 0 && job.received !== job.total) {
        throw new Error(`Downloaded ${job.received} bytes, expected ${job.total}.`);
      }
      await Deno.rename(partial, `${dir}/${name}`);
    } catch (error) {
      job.state = "failed";
      job.error = (error as Error).message;
      job.endedAt = new Date().toISOString();
      await Deno.remove(partial).catch(() => {});
      return;
    }
    await runInstall(job, `${dir}/${name}`, folder, target, settings);
  })();
  return job;
}

/**
 * Downloads an archive from a player-provided URL, then unpacks and installs it through the same path
 * as catalog downloads. This is the ModDB bridge: the player browses/copies, Exordium downloads.
 */
export function startUrlJob(
  folder: string,
  url: string,
  title: string,
  target: InstallTarget,
  settings: DownloadSettings = {},
): Job {
  const trimmed = url.trim();
  const id = urlDownloadId(trimmed);
  const key = `url:${id}`;
  const current = jobs.get(key);
  if (current && ["downloading", "extracting", "installing"].includes(current.state)) return current;

  const dir = `${folder}/url/${id}`;
  const job: Job = {
    source: "url",
    id,
    title: title.trim() || id,
    file: trimmed,
    path: "",
    state: "downloading",
    received: 0,
    total: 0,
    extracted: 0,
    unpackedSize: 0,
    installing: null,
    result: null,
    startedAt: new Date().toISOString(),
  };
  jobs.set(key, job);
  startSampling();

  void (async () => {
    let partial = "";
    try {
      const opened = await openDownload(trimmed);
      job.file = opened.name;
      job.total = Number(opened.response.headers.get("content-length")) || 0;
      await Deno.mkdir(dir, { recursive: true });
      const archive = `${dir}/${opened.name}`;
      partial = `${archive}.part`;
      job.path = archive.replace(/\//g, "\\");
      const out = await Deno.open(partial, { write: true, create: true, truncate: true });
      await opened.response.body!
        .pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              job.received += chunk.length;
              counters.net += chunk.length;
              counters.disk += chunk.length;
              controller.enqueue(chunk);
            },
          }),
        )
        .pipeTo(out.writable);
      if (settings.verifyAfterDownload && job.total > 0 && job.received !== job.total) {
        throw new Error(`Downloaded ${job.received} bytes, expected ${job.total}.`);
      }
      await Deno.rename(partial, archive);
      await runInstall(job, archive, folder, target, settings);
    } catch (error) {
      job.state = "failed";
      job.error = (error as Error).message;
      job.endedAt = new Date().toISOString();
      if (partial) await Deno.remove(partial).catch(() => {});
    }
  })();
  return job;
}

/** Installs an archive already in the downloads folder (from an earlier session, or a failed try). */
export async function installDownloaded(
  folder: string,
  cacheDir: string,
  id: string,
  file: string,
  title: string,
  target: InstallTarget,
  settings: DownloadSettings = {},
): Promise<Job> {
  const archive = await downloadedFile(folder, id, file);
  if (!archive) throw new Error("That file has not been downloaded.");
  const item = await archiveItem(id, cacheDir).catch(() => null);
  const info = await Deno.stat(archive);
  const job: Job = {
    source: "archive",
    id,
    title,
    file,
    path: archive.replace(/\//g, "\\"),
    state: "extracting",
    received: info.size,
    total: info.size,
    extracted: 0,
    unpackedSize: item && [...item.archives].sort((a, b) => b.size - a.size)[0]?.name.split("/").pop() ===
        file.split("/").pop()
      ? item.unpackedSize
      : 0,
    installing: null,
    result: null,
    startedAt: new Date().toISOString(),
  };
  jobs.set(`archive:${id}/${file}`, job);
  startSampling();
  void runInstall(job, archive, folder, target, settings);
  return job;
}
