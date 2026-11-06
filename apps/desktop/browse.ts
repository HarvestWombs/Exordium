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
import { inspectMod, type ModInspection, modRoot, type ModTexts } from "./mod-inspect.ts";
import { APP_VERSION } from "./updater.ts";

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

// ---- Being a good archive.org client ---------------------------------------------------------------

/** Who is asking: archive.org asks automated clients to say so. */
const USER_AGENT = `Exordium/${APP_VERSION} (Diablo II mod launcher)`;

/** No request to archive.org before this time: set when it answers 429 or 503 (too busy). */
let archivePausedUntil = 0;

/**
 * Every request to archive.org: it says who is asking, and when archive.org answers 429 (too many
 * requests) or 503 (overloaded), every request waits for its Retry-After, or a minute, before the next.
 */
async function archiveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const wait = archivePausedUntil - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const headers = new Headers(init.headers);
  headers.set("user-agent", USER_AGENT);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 429 || response.status === 503) {
    const after = Number(response.headers.get("retry-after"));
    archivePausedUntil = Date.now() + (Number.isFinite(after) && after > 0 ? after * 1000 : 60_000);
  }
  return response;
}
const DOWNLOAD_FILE = /\.(zip|rar|7z|tar|tgz|gz|bz2|xz)$/i;
const EXECUTABLE_FILE = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar)$/i;

// ---- Keywords ---------------------------------------------------------------------------------------

export interface KeywordGroup {
  id: string;
  label: string;
  keywords: { id: string; label: string; pattern: RegExp }[];
}

/**
 * An English pattern that also matches Russian word stems: a readme in Russian should tag the same.
 * JavaScript's \b only knows Latin letters, so the stems start where no letter comes before them.
 */
function words(english: RegExp, russian: string): RegExp {
  return new RegExp(`${english.source}|(?<!\\p{L})(?:${russian})`, "iu");
}

/** Never matches: a keyword only an archive's contents add (inspectionKeywords), never its words. */
const CONTENTS_ONLY = /(?!)/;

/**
 * Common Diablo II modding terms, matched against an entry's title, description and tags. archive.org
 * items rarely tag more than "Diablo 2 mod", so the text is what there is. Plain dictionary matching:
 * an entry shows a keyword only when its own words say so, in English or Russian.
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
        pattern: words(
          /\b(overhaul|total conversion|complete (mod|rework)|rebalanc\w*)\b/i,
          "ребаланс|баланс|переработ|глобальн",
        ),
      },
      {
        id: "items",
        label: "Items",
        pattern: words(
          /\b(items?|uniques?|runewords?|set items?|affix\w*|loot)\b/i,
          "предмет|уникальн|рунн|руны|рунам|экипиров|амулет|талисман|кольц",
        ),
      },
      {
        id: "skills",
        label: "Skills & classes",
        pattern: words(/\b(skills?|skill trees?|new class\w*|classes)\b/i, "навык|умени|способност|скилл|класс"),
      },
      {
        id: "monsters",
        label: "Monsters",
        pattern: words(/\b(monsters?|bosses|boss|enemies)\b/i, "монстр|босс|враг|чудовищ"),
      },
      {
        id: "maps",
        label: "Maps & areas",
        pattern: words(/\b(maps?|areas?|levels?|dungeons?|zones?|acts?\s*[1-6vi]*)\b/i, "локаци|подземел|карты|карта"),
      },
      {
        id: "graphics",
        label: "Graphics",
        pattern: words(
          /\b(graphics?|textures?|sprites?|hd|high resolution|resolution|d2gl|glide|widescreen)\b/i,
          "графи|текстур|спрайт|разрешени",
        ),
      },
      {
        id: "sound",
        label: "Sound & music",
        pattern: words(/\b(sounds?|music|audio|voice)\b/i, "звук|музык|озвуч"),
      },
      {
        id: "utility",
        label: "Tools & utilities",
        pattern: words(/\b(tool|utility|editor|loader|launcher|plugin)\b/i, "утилит|редактор|загрузчик|лаунчер|плагин"),
      },
      {
        id: "fix",
        label: "Fixes",
        pattern: words(/\b(fix(es|ed)?|bug\s*fix\w*|patch(es)?)\b/i, "исправлен|фикс|баг"),
      },
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
        pattern: words(
          /\b(multi\s*-?player|battle\.?net|pvpgn|realm|tcp\/?ip|lan|co-?op)\b/i,
          "мультиплеер|по сети|сетев|кооператив",
        ),
      },
      { id: "single", label: "Single player", pattern: words(/\bsingle\s*-?player\b/i, "одиночн") },
      { id: "hardcore", label: "Hardcore", pattern: words(/\bhardcore\b/i, "хардкор") },
      {
        id: "stash",
        label: "Shared stash",
        pattern: words(/\b(shared stash|stash)\b/i, "общий сундук|общий тайник|общего сундука"),
      },
      { id: "median", label: "Median XL", pattern: /\bmedian\b/i },
    ],
  },
  {
    id: "contents",
    label: "CONTAINS",
    // Only an archive's contents add these (inspectionKeywords), and only for what is not a mod.
    keywords: [
      { id: "contents-data", label: "Loose data files", pattern: CONTENTS_ONLY },
      { id: "contents-game", label: "Game folders", pattern: CONTENTS_ONLY },
      { id: "contents-saves", label: "Character saves", pattern: CONTENTS_ONLY },
      { id: "contents-tool", label: "Tools", pattern: CONTENTS_ONLY },
      { id: "contents-docs", label: "Documentation", pattern: CONTENTS_ONLY },
    ],
  },
  {
    id: "language",
    label: "LANGUAGE",
    // Only an archive's contents add these (inspectionKeywords): a mod's language folder, or the
    // script its readme is written in. English, the default, gets no tag.
    keywords: [
      { id: "lang-rus", label: "Russian", pattern: CONTENTS_ONLY },
      { id: "lang-pol", label: "Polish", pattern: CONTENTS_ONLY },
      { id: "lang-deu", label: "German", pattern: CONTENTS_ONLY },
      { id: "lang-fra", label: "French", pattern: CONTENTS_ONLY },
      { id: "lang-esp", label: "Spanish", pattern: CONTENTS_ONLY },
      { id: "lang-ita", label: "Italian", pattern: CONTENTS_ONLY },
      { id: "lang-por", label: "Portuguese", pattern: CONTENTS_ONLY },
      { id: "lang-kor", label: "Korean", pattern: CONTENTS_ONLY },
      { id: "lang-chi", label: "Chinese", pattern: CONTENTS_ONLY },
      { id: "lang-jpn", label: "Japanese", pattern: CONTENTS_ONLY },
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
/** The named entities mod readmes use besides the basic five: their symbols and dashes. */
const NAMED_ENTITIES: Record<string, string> = {
  reg: "®",
  trade: "™",
  copy: "©",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
};

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
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(
      /&(reg|trade|copy|hellip|mdash|ndash|laquo|raquo);/gi,
      (_, name: string) => NAMED_ENTITIES[name.toLowerCase()]!,
    );
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

/** A list refresh already under way, so one opening of Browse never starts two. */
let listRefresh: Promise<{ items: BrowseItem[]; fetchedAt: string }> | null = null;

/**
 * The whole archive.org list, from a cache under `cacheDir`. Once there is one, it is what Browse gets
 * at once; past 12 hours old it is fetched again behind it, for the next look. Only asking with
 * `refresh` (the page's Refresh) waits for archive.org.
 */
export async function archiveList(
  cacheDir: string,
  refresh = false,
): Promise<{ items: BrowseItem[]; fetchedAt: string }> {
  const file = `${cacheDir}/archive.json`;
  if (!refresh) {
    try {
      const cached = JSON.parse(await Deno.readTextFile(file)) as { items: BrowseItem[]; fetchedAt: string };
      if (Date.now() - Date.parse(cached.fetchedAt) >= ARCHIVE_TTL_MS && !listRefresh) {
        listRefresh = fetchArchiveList(file).finally(() => (listRefresh = null));
        listRefresh.catch(() => {});
      }
      return cached;
    } catch {
      // Missing or unreadable: fetch.
    }
  }
  return await (listRefresh ?? fetchArchiveList(file));
}

async function fetchArchiveList(file: string): Promise<{ items: BrowseItem[]; fetchedAt: string }> {
  const cacheDir = file.slice(0, file.lastIndexOf("/"));
  const fields = ["identifier", "title", "description", "subject", "creator", "publicdate", "downloads", "item_size"];
  const query = new URLSearchParams({ q: ARCHIVE_QUERY, rows: "1000", page: "1", output: "json" });
  for (const field of fields) query.append("fl[]", field);
  const response = await archiveFetch(`https://archive.org/advancedsearch.php?${query}`);
  if (!response.ok) throw new Error(`archive.org search answered ${response.status}`);
  const body = await response.json() as { response?: { docs?: ArchiveDoc[] } };
  const items = (body.response?.docs ?? []).map(archiveItemFromDoc).filter((item): item is BrowseItem => item !== null);
  const result = { items, fetchedAt: new Date().toISOString() };
  await Deno.mkdir(cacheDir, { recursive: true });
  await Deno.writeTextFile(file, JSON.stringify(result));
  return result;
}

// ---- Latest uploads (the library home's row) ----------------------------------------------------

export interface LatestUpload {
  key: string;
  source: "archive" | "moddb";
  title: string;
  /** The start of the list's description: a hover card's few lines, not the whole text. May be empty. */
  description: string;
  /** The entry's own page, which can have a description when the list has none. */
  page: string;
  addedAt: string;
  cover: string;
  sourceLabel: string;
}

const UPLOAD_DESCRIPTION_LENGTH = 400;

/** A cache file from before descriptions were kept has none. */
function uploadDescription(item: { description?: string }): string {
  const text = item.description ?? "";
  return text.length > UPLOAD_DESCRIPTION_LENGTH ? `${text.slice(0, UPLOAD_DESCRIPTION_LENGTH).trimEnd()}…` : text;
}

/** Lists being fetched again in the background, by name: one refresh at a time each. */
const refreshing = new Map<string, Promise<unknown>>();

/**
 * A list's items from its cache file at once, however old: a stale one is refreshed in the background
 * for next time instead of keeping the caller waiting on archive.org or ModDB. Only a list never
 * fetched waits for the network.
 */
async function staleFirst<T>(
  name: string,
  file: string,
  ttl: number,
  fetchFresh: () => Promise<{ items: T[] }>,
): Promise<T[]> {
  const cached = await Deno.readTextFile(file).then((text) => JSON.parse(text) as { items: T[]; fetchedAt: string })
    .catch(() => null);
  if (!cached) return (await fetchFresh().catch(() => ({ items: [] as T[] }))).items;
  if (Date.now() - Date.parse(cached.fetchedAt) >= ttl && !refreshing.has(name)) {
    const run = fetchFresh().catch(() => {}).finally(() => refreshing.delete(name));
    refreshing.set(name, run);
  }
  return cached.items;
}

/**
 * The newest uploads across the Internet Archive and ModDB, merged by date: what the library home's
 * Latest uploads row shows, so it needs neither whole list. The same mod posted the same day in
 * several variants ("… (D2GL Russian)", "… (D2GL English)", "… - pt-BR") is one card, its newest.
 */
export async function latestUploads(cacheDir: string, limit = 16): Promise<LatestUpload[]> {
  const [archive, moddb] = await Promise.all([
    staleFirst<BrowseItem>("archive", `${cacheDir}/archive.json`, ARCHIVE_TTL_MS, () => archiveList(cacheDir, true)),
    staleFirst<ModDbItem>("moddb", `${cacheDir}/moddb.json`, MODDB_TTL_MS, () => modDbList(cacheDir, true)),
  ]);
  const all: LatestUpload[] = [];
  for (const item of archive) {
    if (item.addedAt) {
      all.push({
        key: `archive:${item.id}`,
        source: "archive",
        title: item.title,
        description: uploadDescription(item),
        page: item.page,
        addedAt: item.addedAt,
        cover: item.cover,
        sourceLabel: "Internet Archive",
      });
    }
  }
  for (const item of moddb) {
    if (item.addedAt) {
      all.push({
        key: `moddb:${item.id}`,
        source: "moddb",
        title: item.title,
        description: uploadDescription(item),
        page: item.page,
        addedAt: item.addedAt,
        cover: modDbImage(item.cover, "thumb_620x2000"),
        sourceLabel: item.sourceLabel ? `ModDB · ${item.sourceLabel}` : "ModDB",
      });
    }
  }
  all.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const seen = new Set<string>();
  const shown: LatestUpload[] = [];
  for (const upload of all) {
    const base = upload.title.replace(/\s*(\(.*\)|-\s*[a-z]{2}(-[a-z]{2})?)\s*$/i, "").trim().toLowerCase();
    const id = `${base}|${upload.addedAt.slice(0, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    shown.push(upload);
    if (shown.length >= limit) break;
  }
  return shown;
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
  /** What the archive says about the mod: its core, launch options, language, loaders… */
  inspection: ModInspection | null;
}

const ARCHIVE_FILE = /\.(zip|rar|7z|mpq)$/i;
const LISTABLE = /\.(zip|rar|7z)$/i;
const IMAGE_FILE = /\.(png|jpe?g|gif|bmp|webp)$/i;
/** Bumped when what is stored per item changes, so old cached details are read again. */
const DETAILS_VERSION = 9;
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
 * with its size. Works for zip, 7z and rar; serving a single file from inside works for zip and rar
 * (a file inside a 7z comes back empty).
 */
export function parseArchiveListing(html: string, archive?: string): ArchiveMember[] {
  const members: ArchiveMember[] = [];
  const row = /<a href="\/\/archive\.org\/download\/([^"]+)">[^<]*<\/a><td>[^<]*<td>[^<]*<td id="size">(\d+)/gi;
  // A link is <item id>/<archive>/<member>. The archive's own name marks where the member starts: an
  // item id can end in ".7z" itself ("...-sigma-2.3.2.7z"), so the first archive extension is not it.
  const marker = archive ? `/${archive.replace(/\\/g, "/")}/` : null;
  for (const match of html.matchAll(row)) {
    try {
      const href = decodeURIComponent(match[1]!);
      const at = marker ? href.indexOf(marker) : -1;
      const path = at >= 0
        ? href.slice(at + marker!.length)
        : /^[^/]+\/(?:.+?\.(?:zip|rar|7z))\/(.+)$/i.exec(href)?.[1];
      if (path) members.push({ path, size: Number(match[2]) });
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

/**
 * A text file's bytes as text, whatever it was saved in. UTF-8 and UTF-16 say so (a BOM, or bytes
 * that are only valid as UTF-8); otherwise an old Windows or DOS code page. Russian readmes are mostly
 * Windows-1251, some DOS 866: the one whose Cyrillic letters run together in words wins, and Western
 * text, whose few high bytes are lone accents inside Latin words, stays Windows-1252.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8: a code page, chosen below.
  }
  const cyrillicRuns = (text: string) => text.match(/[А-яЁё]{2,}/g)?.join("").length ?? 0;
  const highBytes = bytes.reduce((count, byte) => count + (byte >= 0x80 ? 1 : 0), 0);
  let best = { text: "", score: 0 };
  for (const label of ["windows-1251", "ibm866"]) {
    const text = new TextDecoder(label).decode(bytes);
    const score = cyrillicRuns(text);
    if (score > best.score) best = { text, score };
  }
  // Mostly Cyrillic words among the high bytes, or it was Western text all along.
  return best.score > highBytes * 0.6 ? best.text : new TextDecoder("windows-1252").decode(bytes);
}

/** A small text file from inside a zip or a rar on archive.org; null when it cannot be read. */
async function memberText(id: string, archive: string, member: string, limit = 24 * 1024): Promise<string | null> {
  try {
    const response = await archiveFetch(
      `${downloadUrl(id, archive)}/${member.split("/").map(encodeURIComponent).join("/")}`,
    );
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

/** A readme's name, in English or Russian: the description and the installation notes. */
const README =
  /(read\s*-?_?me|mod\s*info|modinfo|info|description|about|install|прочти|прочитай|описани|установк|инструкц|информац)/iu;
/** A changelog's name: the next best thing to a readme. */
const CHANGELOG = /(change\s*log|changes|history|whats?\s*new|изменени|история|список)/iu;
const TEXT_FILE = /\.(txt|nfo|md)$/i;

/**
 * The archive's readme: the one its D2SE setup names, else a text file outside data/ and near the
 * top, a readme by name first, then a changelog, then any; the larger of equals, since a few lines
 * rarely describe a mod.
 */
export function pickReadme(members: readonly ArchiveMember[], named: string | null, title = ""): ArchiveMember | null {
  return readmeCandidates(members, named, title)[0] ?? null;
}

/**
 * A log the game or a wrapper wrote (debuglog240213.txt, BnetLog.txt, d2dx_log.txt, D2Debug.txt, a
 * crash dump): never a readme. A changelog is not one: "log" must start the name or follow a
 * separator or one of the words that make it a log.
 */
const LOG_FILE = /(^|[_\-\s.]|debug|bnet|error|crash|d2|realm|game)log[\w\-]*\.(txt|log)$|debug|crash|dump/i;

/** The readme candidates, likeliest first (pickReadme): the next is tried when one turns out a log. */
export function readmeCandidates(
  members: readonly ArchiveMember[],
  named: string | null,
  title = "",
): ArchiveMember[] {
  const own = named ? members.find((member) => member.path.toLowerCase() === named.toLowerCase()) : undefined;
  const root = modRoot(members.map((member) => member.path));
  const words = titleWords(title);
  // Where a mod keeps its own words: its folder, the archive's top, or a docs folder in either.
  const placed = (path: string) => {
    const lower = path.toLowerCase();
    const dir = lower.slice(0, lower.lastIndexOf("/") + 1);
    if (dir === root || dir === "") return true;
    const parent = dir.slice(0, dir.slice(0, -1).lastIndexOf("/") + 1);
    const folder = dir.slice(parent.length, -1);
    return (parent === root || parent === "") && DOCS_FOLDER.test(folder);
  };
  const candidates = members.filter((member) =>
    member !== own && TEXT_FILE.test(member.path) && member.size > 0 && member.size < 512 * 1024 &&
    placed(member.path) && !LOG_FILE.test(member.path.split("/").pop()!) &&
    // Below the mod's own folder only: many mods name theirs for what they ship ("… v1.80 D2GL QoL").
    !PLUGIN.test(member.path.slice(member.path.toLowerCase().startsWith(root) ? root.length : 0))
  );
  const rank = (member: ArchiveMember) => {
    const name = member.path.split("/").pop()!;
    // Its own name in the file's name ("Zy-El readme.txt") outranks a generic readme.
    const named = words.some((word) => name.toLowerCase().includes(word)) ? 3 : 0;
    return named + (README.test(name) ? 3 : CHANGELOG.test(name) ? 2 : 1);
  };
  const sorted = candidates.sort((a, b) =>
    rank(b) - rank(a) || a.path.split("/").length - b.path.split("/").length || b.size - a.size
  );
  return own ? [own, ...sorted] : sorted;
}

/** A folder a mod keeps its documents in. */
const DOCS_FOLDER = /^(docs?|documentation|readme|manuals?|guides?|help|info|документац\w*|инструкц\w*)$/iu;

/**
 * Plugins, wrappers and tools mods ship beside themselves: a file or folder named for one holds that
 * plugin's readme, not the mod's ("PlugY/PlugY_The_Survival_Kit_-_Readme.txt", "D2GL/readme.txt").
 */
const PLUGIN =
  /(plugy|d2mod|d2gl|d2dx|glide|sven|d2hd|multires|sgd2freeres|d2expres|reshade|ddraw|dgvoodoo|dxwrapper|d2hackmap|maphack|d2loader|basemod|d2se|(^|[^a-z])bh([^a-z]|$))/i;

/** A title's distinctive words, lowercased: those of four letters or more that are not D2 boilerplate. */
function titleWords(title: string): string[] {
  const generic = new Set(["d2se", "diablo", "mod", "mods", "edition", "final", "version", "with", "full", "lord"]);
  return (title.toLowerCase().match(/\p{L}[\p{L}\d'-]{3,}/gu) ?? []).filter((word) => !generic.has(word));
}

/**
 * Text that opens as a plugin's own readme: its first lines name a plugin and not the mod. Cross-checked
 * against the title, so a mod's readme that mentions PlugY further down, or a mod named after one, stays.
 */
export function aboutPlugin(text: string, title: string): boolean {
  const head = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5).join(" ").toLowerCase();
  const words = titleWords(title);
  return PLUGIN.test(head) && !words.some((word) => head.includes(word));
}

/**
 * Text whose lines mostly carry a time of day near their start (18:34:05): a log, whatever its name
 * says. A dated changelog has dates, rarely times, so it still reads as a readme.
 */
export function looksLikeLog(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line && !/^[-=*_#]+$/.test(line))
    .slice(0, 20);
  const stamped = lines.filter((line) => /\b\d{1,2}:\d{2}:\d{2}\b/.test(line.slice(0, 32)));
  return lines.length >= 4 && stamped.length / lines.length > 0.4;
}

/**
 * Text that is mostly a data table (tab-separated columns, like a plugin's statsinterface.txt) or
 * settings (key=value lines): a file the mod reads, not one written for the player.
 */
export function looksLikeData(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 30);
  const data = lines.filter((line) => (line.match(/\t/g)?.length ?? 0) >= 3 || /^[\w.\[\]]+\s*=/.test(line));
  return lines.length >= 4 && data.length / lines.length > 0.5;
}

/** Text with sentences in it (lines of five words or more): what anything written for a person has. */
export function hasProse(text: string): boolean {
  const sentences = text.split("\n").filter((line) => (line.match(/\p{L}{2,}/gu)?.length ?? 0) >= 5);
  return sentences.length >= 2;
}

/** Single files can be read from inside these on archive.org; from inside a 7z they come back empty. */
const READABLE = /\.(zip|rar)$/i;

/** An archive's file list from archive.org; null when it cannot be read. */
async function listing(id: string, name: string): Promise<ArchiveMember[] | null> {
  try {
    const response = await archiveFetch(`${downloadUrl(id, name)}/`);
    return response.ok ? parseArchiveListing(await response.text(), name) : null;
  } catch {
    return null;
  }
}

/** The shortest path matching `pattern`: the mod's own copy, not a backup deeper down. */
function shallowest(members: readonly ArchiveMember[], pattern: RegExp): ArchiveMember | undefined {
  return members.filter((member) => pattern.test(member.path)).sort((a, b) => a.path.length - b.path.length)[0];
}

/**
 * Reads what the mod inside an item's main archive says about itself: from the listing, what it
 * contains; for a zip or a rar, its exordium.mod.json, its D2SE_SETUP.ini (description, homepage,
 * forum, core, readme) and its readme. inspectMod (mod-inspect.ts) turns all that into findings.
 */
async function enrich(
  id: string,
  archive: ItemFile,
  uploaderDescription: string,
  siblings: readonly ItemFile[],
  title: string,
): Promise<Partial<ItemDetails>> {
  if (!LISTABLE.test(archive.name)) return {};
  const members = await listing(id, archive.name);
  if (members === null) return {};
  const result: Partial<ItemDetails> = {
    keywords: contentKeywords(members),
    unpackedSize: members.reduce((sum, member) => sum + member.size, 0),
    links: [],
  };
  const texts: ModTexts = { description: uploaderDescription };
  let setupDescription: string | null = null;
  let manifestDescription: string | null = null;
  let readmePath: string | null = null;
  let readmeMember: ArchiveMember | null = null;
  // Where the mod's own words are read from: this archive when archive.org serves files from inside
  // it, else a zip or rar of the same mod in the item (one holding its D2SE setup or manifest, not an
  // add-on pack), since a 7z's files cannot be read without downloading most of it.
  let source: { archive: ItemFile; members: ArchiveMember[] } | null = READABLE.test(archive.name)
    ? { archive, members }
    : null;
  // At most two: an item of many zips with no setup in any would otherwise list every one.
  const readable = siblings.filter((file) => READABLE.test(file.name)).sort((x, y) => y.size - x.size).slice(0, 2);
  for (const other of readable) {
    if (source) break;
    const inside = await listing(id, other.name);
    if (inside?.some((member) => /(^|\/)(d2se_setup\.ini|exordium\.mod\.json)$/i.test(member.path))) {
      source = { archive: other, members: inside };
    }
  }
  const where = source && source.archive !== archive ? source.archive.name : "the archive";
  if (source) {
    const from = source.archive.name;
    const inside = source.members;
    const manifestMember = shallowest(inside, /(^|\/)exordium\.mod\.json$/i);
    if (manifestMember) {
      try {
        const parsed = JSON.parse(await memberText(id, from, manifestMember.path) ?? "");
        if (parsed && typeof parsed === "object") {
          texts.manifest = parsed;
          if (typeof parsed.description === "string" && parsed.description.trim()) {
            manifestDescription = parsed.description.trim();
          }
        }
      } catch {
        // Not JSON: the listing and the readme still say plenty.
      }
    }
    const setupMember = shallowest(inside, /(^|\/)d2se_setup\.ini$/i);
    if (setupMember) {
      const modDir = setupMember.path.slice(0, setupMember.path.lastIndexOf("/") + 1);
      const text = await memberText(id, from, setupMember.path);
      if (text) {
        const ini = iniValues(text);
        texts.setup = ini;
        for (const [key, label] of [["modhp", "Homepage"], ["modboard", "Forum"]] as const) {
          const url = ini.get(key);
          if (url && /^https?:\/\//i.test(url)) result.links!.push({ label, url });
        }
        const description = ini.get("moddescription");
        // Some setups put a file there ("Knowledge Base\faq_for_bfe_1_60.xlsm"): a path describes nothing.
        const isPath = /^\S*[\\/]\S*$/.test(description ?? "") || /\.[a-z0-9]{2,4}$/i.test(description ?? "");
        if (description && !/^https?:\/\//i.test(description) && !isPath) setupDescription = description;
        const readme = ini.get("modreadme");
        if (readme && !/^https?:\/\//i.test(readme)) readmePath = `${modDir}${readme.replace(/\\/g, "/")}`;
      }
    }
    // The likeliest readme that reads as one: a text that turns out to be a log or data is skipped.
    for (const candidate of readmeCandidates(inside, readmePath, title).slice(0, 3)) {
      const text = await memberText(id, from, candidate.path);
      // A D2SE setup can name an HTML readme: its words, not its markup.
      const readme = text && /\.html?$/i.test(candidate.path) ? cleanDescription(text) || null : text;
      if (!readme || looksLikeLog(readme) || looksLikeData(readme) || !hasProse(readme)) continue;
      // The one D2SE_SETUP.ini names is the mod's by its word; any other must not open as a plugin's.
      if (candidate.path !== readmePath && aboutPlugin(readme, title)) continue;
      readmeMember = candidate;
      texts.readme = readme;
      break;
    }
  }

  const inspection = inspectMod(members, texts);
  result.inspection = inspection;
  result.keywords!.push(...inspectionKeywords(inspection));
  for (const link of inspection.links) {
    if (!result.links!.some((known) => known.url.toLowerCase() === link.url.toLowerCase())) result.links!.push(link);
  }
  if (texts.readme && readmeMember) {
    result.description = texts.readme;
    result.descriptionSource = `${readmeMember.path.split("/").pop()} inside ${where}`;
    result.keywords!.push(...keywordsFor(texts.readme));
  } else if (setupDescription ?? manifestDescription) {
    result.description = (setupDescription ?? manifestDescription)!;
    result.descriptionSource = `${setupDescription ? "D2SE_SETUP.ini" : "exordium.mod.json"} inside ${where}`;
  }
  return result;
}

/** The tags an inspection adds: each game version it covers, its language, its loaders. */
function inspectionKeywords(inspection: ModInspection): string[] {
  const found: string[] = [];
  for (const version of inspection.core?.versions ?? []) found.push(...keywordsFor(version));
  if (inspection.language && inspection.language.code !== "eng") found.push(`lang-${inspection.language.code}`);
  // Nearly everything is a mod: only what is not one gets a CONTAINS tag, to find or skip it.
  if (inspection.contents !== "mod" && inspection.contents !== "unknown") found.push(`contents-${inspection.contents}`);
  for (const loader of inspection.loaders) if (["plugy", "d2se", "d2mod"].includes(loader)) found.push(loader);
  if (inspection.loaders.some((loader) => ["d2gl", "glide", "d2multires", "d2hd", "sgd2freeres"].includes(loader))) {
    found.push("graphics");
  }
  return found;
}

/**
 * An item's files, screenshots and description: archive.org's metadata, then what its main archive
 * holds (enrich). Kept in memory and on disk under `cacheDir`, so each item is read once.
 */
export async function archiveItem(id: string, cacheDir: string): Promise<ItemDetails> {
  if (!ID.test(id)) throw new Error("Bad item id");
  const known = await cachedItem(id, cacheDir);
  if (known && detailVersions.get(id) === DETAILS_VERSION) return known;
  // Read by an older Exordium: shown as it is now, read again behind it.
  if (known) {
    void refreshItem(id, cacheDir).catch(() => {});
    return known;
  }
  return await refreshItem(id, cacheDir);
}

/** Items being read from archive.org right now: a card and the background read share one fetch. */
const reading = new Map<string, Promise<ItemDetails>>();

function refreshItem(id: string, cacheDir: string): Promise<ItemDetails> {
  const running = reading.get(id);
  if (running) return running;
  const read = readItem(id, cacheDir).finally(() => reading.delete(id));
  reading.set(id, read);
  return read;
}

/** The DETAILS_VERSION each cached item was read with: an older one is shown, then read again. */
const detailVersions = new Map<string, number>();

/**
 * An item's details if they have ever been read (memory, then disk), whatever version read them;
 * null otherwise. Never fetches.
 */
async function cachedItem(id: string, cacheDir: string): Promise<ItemDetails | null> {
  if (!ID.test(id)) return null;
  const known = details.get(id);
  if (known) return known;
  try {
    const cached = JSON.parse(await Deno.readTextFile(`${cacheDir}/items/${id}.json`)) as ItemDetails & {
      version?: number;
    };
    // Older shapes lack newer fields; the card copes with their absence.
    cached.inspection ??= null;
    details.set(id, cached);
    detailVersions.set(id, cached.version ?? 0);
    return cached;
  } catch {
    return null;
  }
}

/**
 * Every listed item's cached details, for the list to carry: Browse opens with every card complete
 * instead of each fetching its own. Read from disk once, then from memory.
 */
export async function cachedDetails(ids: readonly string[], cacheDir: string): Promise<Record<string, ItemDetails>> {
  const found: Record<string, ItemDetails> = {};
  for (let i = 0; i < ids.length; i += 32) {
    await Promise.all(
      ids.slice(i, i + 32).map(async (id) => {
        const item = await cachedItem(id, cacheDir);
        if (item) found[id] = item;
      }),
    );
  }
  return found;
}

async function readItem(id: string, cacheDir: string): Promise<ItemDetails> {
  const cacheFile = `${cacheDir}/items/${id}.json`;

  const response = await archiveFetch(`https://archive.org/metadata/${id}`);
  if (!response.ok) throw new Error(`archive.org metadata answered ${response.status}`);
  const body = await response.json() as {
    metadata?: { description?: unknown; title?: unknown };
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
  const title = firstString(body.metadata?.title) ?? id;
  const extra = main
    ? await enrich(id, main, uploaderDescription, archives.filter((file) => file !== main), title)
    : {};
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
    inspection: extra.inspection ?? null,
  };
  details.set(id, result);
  detailVersions.set(id, DETAILS_VERSION);
  await Deno.mkdir(`${cacheDir}/items`, { recursive: true });
  await Deno.writeTextFile(cacheFile, JSON.stringify({ ...result, version: DETAILS_VERSION }));
  return result;
}

/** How far the background read of every item (warmDetails) has got. */
export const detailsProgress = { done: 0, total: 0 };
let warming = false;

/**
 * Reads every listed item's details in the background, two at a time with a pause between, so Browse's filters count
 * what each archive holds (its core, language, loaders), not only the cards scrolled past. Each item
 * is read once and kept on disk; one that fails is tried again on the next start.
 */
export function warmDetails(ids: readonly string[], cacheDir: string): void {
  if (warming) return;
  warming = true;
  void (async () => {
    try {
      await cachedDetails(ids, cacheDir);
      // Missing, or read by an older version: what is cached stays on show until its read lands.
      const todo = ids.filter((id) => detailVersions.get(id) !== DETAILS_VERSION);
      detailsProgress.total = ids.length;
      detailsProgress.done = ids.length - todo.length;
      let next = 0;
      const worker = async () => {
        while (next < todo.length) {
          const id = todo[next++]!;
          await archiveItem(id, cacheDir).catch(() => {});
          detailsProgress.done++;
          // A breath between items: this is a background read, nobody is waiting on it.
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      };
      await Promise.all([worker(), worker()]);
    } finally {
      warming = false;
    }
  })();
}

/** The tags each listed item's archive adds, for every item read so far. Never fetches. */
export async function detailKeywords(ids: readonly string[], cacheDir: string): Promise<Record<string, string[]>> {
  const found: Record<string, string[]> = {};
  for (const [id, item] of Object.entries(await cachedDetails(ids, cacheDir))) found[id] = item.keywords;
  return found;
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
  const response = await archiveFetch(downloadUrl(id, file));
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
  /** The download is held: no more of it is read until this clears. */
  paused?: boolean;
  installing: string | null;
  result: InstallResult | null;
  error?: string;
  startedAt: string;
  endedAt?: string;
}

const jobs = new Map<string, Job>();
/** The downloads under way, so they can be stopped. Unpacking can't be: it runs to its end. */
const aborts = new Map<Job, AbortController>();

function forgetJob(job: Job) {
  for (const [key, each] of jobs) if (each === job) jobs.delete(key);
}

function downloading(id: string, file: string): Job | null {
  const job = [...jobs.values()].find((each) => each.id === id && (each.source === "url" || each.file === file));
  return job?.state === "downloading" ? job : null;
}

/** Holds a download or lets it go on. False if it is past downloading. */
export function pauseJob(id: string, file: string, paused: boolean): boolean {
  const job = downloading(id, file);
  if (job) job.paused = paused;
  return job !== null;
}

/** Reading stops here while a download is held, so the connection stays open to carry on. */
async function whilePaused(job: Job, signal: AbortSignal) {
  while (job.paused && !signal.aborted) await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Stops a download and forgets it; its `.part` file is removed as it stops. False if it is past that. */
export function cancelJob(id: string, file: string): boolean {
  const job = downloading(id, file);
  if (!job) return false;
  aborts.get(job)?.abort();
  return true;
}

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

async function openDownload(
  url: string,
  signal?: AbortSignal,
): Promise<{ response: Response; name: string; finalUrl: string }> {
  let current = new URL(url);
  if (current.protocol !== "http:" && current.protocol !== "https:") throw new Error("Only http and https URLs work.");
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (seen.has(current.href)) break;
    seen.add(current.href);
    const response = await fetch(current.href, {
      headers: { "user-agent": "Exordium" },
      ...(signal ? { signal } : {}),
    });
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
  /** Warms launch metadata after installed folders have reached their final paths. */
  afterInstall?: (folders: string[]) => Promise<void>;
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
    await target.afterInstall?.(result.installed.map((mod) => mod.name));
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
    const abort = new AbortController();
    aborts.set(job, abort);
    try {
      await Deno.mkdir(dir, { recursive: true });
      const response = await archiveFetch(downloadUrl(id, file), { signal: abort.signal });
      if (!response.ok || !response.body) throw new Error(`archive.org answered ${response.status}`);
      job.total = Number(response.headers.get("content-length")) || job.total;
      const out = await Deno.open(partial, { write: true, create: true, truncate: true });
      // Counted on the way through; pipeTo closes the file when the body ends.
      await response.body
        .pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            async transform(chunk, controller) {
              await whilePaused(job, abort.signal);
              job.received += chunk.length;
              counters.net += chunk.length;
              counters.disk += chunk.length;
              controller.enqueue(chunk);
            },
          }),
        )
        .pipeTo(out.writable, { signal: abort.signal });
      if (settings.verifyAfterDownload && job.total > 0 && job.received !== job.total) {
        throw new Error(`Downloaded ${job.received} bytes, expected ${job.total}.`);
      }
      await Deno.rename(partial, `${dir}/${name}`);
    } catch (error) {
      await Deno.remove(partial).catch(() => {});
      if (abort.signal.aborted) return forgetJob(job);
      job.state = "failed";
      job.error = (error as Error).message;
      job.endedAt = new Date().toISOString();
      return;
    } finally {
      aborts.delete(job);
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
    const abort = new AbortController();
    aborts.set(job, abort);
    try {
      const opened = await openDownload(trimmed, abort.signal);
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
            async transform(chunk, controller) {
              await whilePaused(job, abort.signal);
              job.received += chunk.length;
              counters.net += chunk.length;
              counters.disk += chunk.length;
              controller.enqueue(chunk);
            },
          }),
        )
        .pipeTo(out.writable, { signal: abort.signal });
      if (settings.verifyAfterDownload && job.total > 0 && job.received !== job.total) {
        throw new Error(`Downloaded ${job.received} bytes, expected ${job.total}.`);
      }
      await Deno.rename(partial, archive);
      aborts.delete(job);
      await runInstall(job, archive, folder, target, settings);
    } catch (error) {
      if (partial) await Deno.remove(partial).catch(() => {});
      if (abort.signal.aborted) return forgetJob(job);
      job.state = "failed";
      job.error = (error as Error).message;
      job.endedAt = new Date().toISOString();
    } finally {
      aborts.delete(job);
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
