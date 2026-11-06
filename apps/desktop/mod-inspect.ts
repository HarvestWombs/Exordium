/**
 * What a mod archive says about the mod inside, from what can be read without downloading it: the
 * list of its files (always), and for a zip or a rar its readme, D2SE_SETUP.ini and exordium.mod.json
 * (archive.org serves single files from inside those; from inside a 7z it serves empty files).
 *
 * Each finding names where it came from, strongest first: the mod's own manifest or D2SE setup, then
 * its readme, then the uploader's description, then what its files imply. File evidence is common
 * sense, not proof: a plugin made for one patch gives that core, a mod that is only a Patch_D2.mpq is
 * taken to run on 1.10 to 1.14d, loose files under data/ to need -direct, and so on. The sizes of the
 * game DLLs a mod ships are no evidence at all: mods modify them or bring them from other patches.
 */

import type { ArchiveMember } from "./browse.ts";

export type Basis = "manifest" | "setup" | "readme" | "description" | "files";

export interface ModInspection {
  /** The game version it is for: one version ("1.13c"), or a range it runs on ("1.10f–1.14d"). */
  core: { label: string; versions: string[]; basis: Basis } | null;
  /** Loose files to load: -direct for any under data/, -txt for loose excel tables. */
  launch: { direct: boolean; txt: boolean; basis: Basis } | null;
  /** The language its text is in, when something says so. */
  language: { code: string; name: string; basis: Basis } | null;
  /** Plugins and loaders it brings or needs: "plugy", "d2mod", "d2se", "d2gl", "glide"… */
  loaders: string[];
  /**
   * What the archive holds: a mod (MPQs, a D2SE setup or a manifest), loose data files, a whole game
   * folder, character saves, a tool, documentation alone, or nothing recognisable.
   */
  contents: "mod" | "data" | "game" | "saves" | "tool" | "docs" | "unknown";
  /** Who made it, as the readme credits them. */
  author: string | null;
  /** Pages the readme names (a forum thread, a VK or Discord community…). */
  links: { label: string; url: string }[];
}

/** What could be read from inside the archive, besides its file list. */
export interface ModTexts {
  readme?: string | null;
  /** The uploader's own description: weaker than the readme, but often all a 7z item has. */
  description?: string | null;
  setup?: Map<string, string> | null;
  manifest?: Record<string, unknown> | null;
}

/** Every core Exordium knows, by the names it uses for them (D2SE's), oldest first. */
export const GAME_VERSIONS = [
  "1.00",
  "1.01",
  "1.02",
  "1.03",
  "1.04b",
  "1.04c",
  "1.05",
  "1.05b",
  "1.06",
  "1.06b",
  "1.07",
  "1.08",
  "1.09",
  "1.09b",
  "1.09d",
  "1.10f",
  "1.11",
  "1.11b",
  "1.12a",
  "1.13c",
  "1.13d",
  "1.14a",
  "1.14b",
  "1.14c",
  "1.14d",
] as const;

/** Patch_D2.mpq alone: the patch archive 1.10 and later read, from the mod's own folder. */
const PATCH_ONLY_RANGE = ["1.10f", "1.14d"] as const;

/**
 * Plugins made for one patch only: a mod shipping one is for that core, whatever its other files say.
 * D2Mod and D2ExpRes are 1.10f plugins; BH (the maphack) is 1.13c's.
 */
const PLUGIN_CORE: Record<string, string> = { d2mod: "1.10f", d2expres: "1.10f", bh: "1.13c" };

function between(from: string, to: string): string[] {
  const start = GAME_VERSIONS.indexOf(from as typeof GAME_VERSIONS[number]);
  const end = GAME_VERSIONS.indexOf(to as typeof GAME_VERSIONS[number]);
  return start < 0 || end < start ? [] : GAME_VERSIONS.slice(start, end + 1);
}

/** The game's own DLLs: a folder holding them is a whole game folder, not only a mod. */
const GAME_DLLS = /(^|\/)(d2client|d2common|d2game|d2win|d2gfx|d2lang|d2net|d2cmp|d2sound|storm|fog)\.dll$/;

const LOADER_FILES: [RegExp, string][] = [
  [/(^|\/)plugy\.dll$/, "plugy"],
  [/(^|\/)d2mod\.dll$/, "d2mod"],
  [/(^|\/)d2se_setup\.ini$/, "d2se"],
  [/(^|\/)d2gl\.(dll|mpq|ini)$/, "d2gl"],
  [/(^|\/)glide3x\.dll$/, "glide"],
  [/(^|\/)d2multires[^/]*\.dll$/, "d2multires"],
  [/(^|\/)d2hd\.dll$/, "d2hd"],
  [/(^|\/)sgd2freeres\.dll$/, "sgd2freeres"],
  [/(^|\/)bh\.dll$/, "bh"],
  [/(^|\/)d2expres\.dll$/, "d2expres"],
];

/** The game's three-letter language folders under data/local/lng, and what they hold. */
const LANGUAGES: Record<string, string> = {
  eng: "English",
  rus: "Russian",
  pol: "Polish",
  deu: "German",
  fra: "French",
  esp: "Spanish",
  ita: "Italian",
  por: "Portuguese",
  kor: "Korean",
  chi: "Chinese",
  jpn: "Japanese",
};

/** A version-like number in text: 1.00 to 1.14, with its letter when there is one ("1.13c"). */
const VERSION = /(?<![\d.])1\.(0[0-9]|1[0-4])([a-fs])?(?![\d])/gi;

/** A patch that was really released (or a name every modder uses for one, like 1.10f). */
const REAL_PATCH = /^1\.(0[0-3]|04[bc]?|05b?|06b?|07|08|09[a-d]?|10[sf]?|11[ab]?|12a?|13[a-d]?|14[a-d]?)$/;

/** Words just before a version that say it is the game's, strongly ("tested on") or loosely ("patch"). */
const STRONG_CONTEXT =
  /(tested|requires?|needs?|for\s+(d2|diablo|lod|version|patch)|on\s+(version|patch)|тестир|требу|нужн|под\s+верси|для\s+верси|на\s+верси)/iu;
const LOOSE_CONTEXT = /(patch|version|ver\.|lod|diablo|d2|верси|патч|для)/iu;

/**
 * The game versions a text names as what the mod is for, likeliest first. A version counts only when
 * it is a real patch and either has its letter or sits after a word that makes it the game's: a mod's
 * own version ("Changes 1.10", "v1.08a") must not pass for the game's.
 */
export function readmeVersions(text: string): string[] {
  const found: { version: string; score: number; at: number }[] = [];
  for (const match of text.matchAll(VERSION)) {
    const version = `1.${match[1]}${(match[2] ?? "").toLowerCase()}`;
    if (!REAL_PATCH.test(version)) continue;
    const before = text.slice(Math.max(0, match.index! - 40), match.index!);
    const context = STRONG_CONTEXT.test(before) ? 2 : LOOSE_CONTEXT.test(before) ? 1 : 0;
    const score = (match[2] ? 2 : 0) + context;
    if (score < 1 || (!match[2] && context === 0)) continue;
    const known = found.find((entry) => entry.version === version);
    if (known) known.score = Math.max(known.score, score);
    else found.push({ version, score, at: match.index! });
  }
  return found.sort((a, b) => b.score - a.score || a.at - b.at).map((entry) => entry.version);
}

/** The language a readme is written in, from its script; null for plain English-looking text. */
function scriptLanguage(text: string): { code: string; name: string } | null {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 40) return null;
  const share = (pattern: RegExp) => (text.match(pattern)?.length ?? 0) / letters;
  if (share(/\p{Script=Cyrillic}/gu) > 0.3) return { code: "rus", name: "Russian" };
  if (share(/\p{Script=Hangul}/gu) > 0.2) return { code: "kor", name: "Korean" };
  if (share(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) > 0.1) return { code: "jpn", name: "Japanese" };
  if (share(/\p{Script=Han}/gu) > 0.2) return { code: "chi", name: "Chinese" };
  if (share(/[ąęłńśźżĄĘŁŃŚŹŻ]/gu) > 0.005) return { code: "pol", name: "Polish" };
  if (share(/[a-zA-Z]/g) > 0.9) return { code: "eng", name: "English" };
  return null;
}

/** "Author - Rus|Verm", "Автор: …", "Made by …": the first such line in the readme. */
function readmeAuthor(text: string): string | null {
  const match = /^\s*(?:author|authors|made by|created by|mod by|автор(?:ы)?|создатель|сделал)\s*[-–—:]?\s*(.+?)\s*$/imu
    .exec(text);
  const name = match?.[1]?.replace(/[.!]+$/, "").trim();
  return name && name.length <= 80 ? name : null;
}

const LINK_SITES: [RegExp, string][] = [
  [/vk\.com/i, "VK"],
  [/d2mods\.info/i, "Phrozen Keep"],
  [/moddb\.com/i, "ModDB"],
  [/discord\.(gg|com)/i, "Discord"],
  [/github\.com/i, "GitHub"],
  [/youtube\.com|youtu\.be/i, "YouTube"],
  [/reddit\.com/i, "Reddit"],
];

/** Pages the readme names, with or without their https://, labelled by site. */
function readmeLinks(text: string): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const pattern =
    /(?:https?:\/\/)?(?:www\.)?((?:vk\.com|d2mods\.info|moddb\.com|discord\.gg|discord\.com|github\.com|youtube\.com|youtu\.be|reddit\.com)\/[^\s"'<>)\]]+)/gi;
  for (const match of text.matchAll(pattern)) {
    const url = `https://${match[1]!.replace(/[.,;:!]+$/, "")}`;
    if (links.some((link) => link.url.toLowerCase() === url.toLowerCase())) continue;
    links.push({ label: LINK_SITES.find(([site]) => site.test(url))?.[1] ?? "Link", url });
  }
  return links.slice(0, 6);
}

/** Versions as one label: "1.13c", a run of cores as "1.10f–1.14d", others listed. */
function rangeLabel(versions: readonly string[]): string {
  if (versions.length < 2) return versions[0] ?? "";
  const at = versions.map((version) => GAME_VERSIONS.indexOf(version as typeof GAME_VERSIONS[number]));
  const run = at.every((index, i) => index >= 0 && (i === 0 || index === at[i - 1]! + 1));
  return run ? `${versions[0]}–${versions[versions.length - 1]}` : versions.join(", ");
}

/**
 * Where the mod's own folder starts in an archive, as a lowercase prefix ending in "/" ("" for the
 * archive's top): the shallowest folder holding its marker (D2SE_SETUP.ini, exordium.mod.json or
 * Patch_D2.mpq), else the archive's single top folder when everything sits in one (never data/).
 */
export function modRoot(paths: readonly string[]): string {
  const lower = paths.map((path) => path.replace(/\\/g, "/").toLowerCase());
  const marker = lower
    .filter((path) => /(^|\/)(d2se_setup\.ini|exordium\.mod\.json|patch_d2\.mpq)$/.test(path))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (marker !== undefined) return marker.slice(0, marker.lastIndexOf("/") + 1);
  const tops = new Set(lower.map((path) => path.split("/")[0]));
  const top = [...tops][0];
  return tops.size === 1 && lower.every((path) => path.includes("/")) && top && !/^data$/.test(top) ? `${top}/` : "";
}

export function inspectMod(members: readonly ArchiveMember[], texts: ModTexts = {}): ModInspection {
  const paths = members.map((member) => member.path.replace(/\\/g, "/").toLowerCase());
  const has = (pattern: RegExp) => paths.some((path) => pattern.test(path));
  const readme = texts.readme ?? "";

  const root = modRoot(paths);
  const inRoot = (path: string) => path.startsWith(root) ? path.slice(root.length) : null;
  const rel = paths.map(inRoot).filter((path): path is string => path !== null);
  const at = (pattern: RegExp) => rel.some((path) => pattern.test(path));

  const loaders = LOADER_FILES.filter(([pattern]) => has(pattern)).map(([, id]) => id);
  const looseData = at(/^data\//);
  const looseTxt = at(/^data\/global\/excel\/[^/]+\.txt$/);
  const gameFolder = has(GAME_DLLS);
  const gameExe = members.find((member) => /(^|\/)game\.exe$/i.test(member.path));
  const mpqs = has(/\.mpq$/);

  // A D2SE mod or one with a manifest is a mod even when it ships its own (modded) game DLLs.
  const declared = loaders.includes("d2se") || has(/(^|\/)exordium\.mod\.json$/);
  const contents: ModInspection["contents"] = declared
    ? "mod"
    : gameFolder || (gameExe && gameExe.size > 3_000_000)
    ? "game"
    : mpqs
    ? "mod"
    : looseData
    ? "data"
    : paths.length > 0 && paths.every((path) => /\.(d2s|d2x|sss|key|ma\d|map|txt|nfo|md)$/.test(path)) &&
        has(/\.d2s$/)
    ? "saves"
    : has(/\.exe$/)
    ? "tool"
    : paths.length > 0 && paths.every((path) => /\.(txt|nfo|md|pdf|docx?|odt|rtf|html?|png|jpe?g|gif|bmp)$/.test(path))
    ? "docs"
    : "unknown";

  // The core, strongest first: the manifest, the D2SE setup, the readme, the uploader's description,
  // a plugin made for one patch only, then what else the files imply. A text gives its likeliest
  // version. The game DLLs a mod ships say nothing: mods patch them, rebuild them, or bring one from
  // another patch (Apocalypse, a 1.10f mod, ships a 1.13 Fog.dll).
  let core: ModInspection["core"] = null;
  const manifestCore = typeof texts.manifest?.core === "string" ? texts.manifest.core.trim() : "";
  const setupCore = texts.setup?.get("d2core")?.trim() ?? "";
  const stated = readmeVersions(readme)[0];
  const described = readmeVersions(texts.description ?? "")[0];
  const pinned = loaders.map((id) => PLUGIN_CORE[id]).find((version) => version !== undefined);
  if (manifestCore) core = { label: manifestCore, versions: [manifestCore], basis: "manifest" };
  else if (setupCore) core = { label: setupCore, versions: [setupCore], basis: "setup" };
  else if (stated) core = { label: stated, versions: [stated], basis: "readme" };
  else if (described) core = { label: described, versions: [described], basis: "description" };
  else if (pinned) core = { label: pinned, versions: [pinned], basis: "files" };
  else if (gameExe && gameExe.size > 3_000_000 && !gameFolder) {
    // 1.14 merged the DLLs into one Game.exe of several MB; every earlier Game.exe is a small stub.
    core = { label: "1.14", versions: between("1.14a", "1.14d"), basis: "files" };
  } else if (at(/^patch_d2\.mpq$/) && !gameFolder) {
    const versions = between(...PATCH_ONLY_RANGE);
    core = { label: rangeLabel(versions), versions, basis: "files" };
  }

  // Loose files: what the readme asks for when it says, else what the files need.
  const saysDirect = /(?<![\w-])-direct\b/i.test(readme);
  const saysTxt = /(?<![\w-])-txt\b/i.test(readme);
  const launch: ModInspection["launch"] = saysDirect || saysTxt
    ? { direct: saysDirect || looseData, txt: saysTxt || looseTxt, basis: "readme" }
    : looseData
    ? { direct: true, txt: looseTxt, basis: "files" }
    : null;

  // The language: the game's own language folder first, then the readme's script. A mod with folders
  // for several languages (data/local/lng/*, or D2SE's Language_* folders) is multilingual: no tag.
  const lngFolders = new Set(
    rel
      .map((path) => /^data\/local\/lng\/([a-z]{3})\//.exec(path)?.[1] ?? /^language_([a-z]{3})\//.exec(path)?.[1])
      .filter((code): code is string => code !== undefined && code in LANGUAGES),
  );
  const lngFolder = lngFolders.size === 1 ? [...lngFolders][0]! : null;
  const script = scriptLanguage(readme);
  const language: ModInspection["language"] = lngFolders.size > 1
    ? null
    : lngFolder
    ? { code: lngFolder, name: LANGUAGES[lngFolder]!, basis: "files" }
    : at(/^data\/local\/font\/cyr\//)
    ? { code: "rus", name: "Russian", basis: "files" }
    : script
    ? { ...script, basis: "readme" }
    : null;

  return {
    core,
    launch,
    language,
    loaders,
    contents,
    author: readmeAuthor(readme),
    links: readmeLinks(readme),
  };
}
