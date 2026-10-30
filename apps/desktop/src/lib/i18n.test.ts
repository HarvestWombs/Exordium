import { assert, assertEquals } from "@std/assert";
import { LANGUAGES, plural, setLanguage, tr } from "./i18n.ts";
import de from "../locales/de.json" with { type: "json" };
import es from "../locales/es.json" with { type: "json" };
import fr from "../locales/fr.json" with { type: "json" };

const CATALOGS: Record<string, Record<string, string>> = { fr, es, de };

async function sourceFiles(folder: string, found: string[] = []): Promise<string[]> {
  for await (const entry of Deno.readDir(folder)) {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory) await sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) found.push(path);
  }
  return found;
}

/** Every text passed to tr() and plural(): the catalogs' keys. */
async function sourceKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const literal = `"((?:[^"\\\\]|\\\\.)*)"`;
  const trCall = new RegExp(`\\btr\\(\\s*${literal}`, "g");
  const pluralCall = new RegExp(`\\bplural\\(\\s*(?:[^,"]|\\([^)]*\\))+,\\s*${literal},\\s*${literal}`, "g");
  const source = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  for (const file of await sourceFiles(source.replace(/\/$/, ""))) {
    const text = await Deno.readTextFile(file);
    for (const match of text.matchAll(trCall)) keys.add(JSON.parse(`"${match[1]}"`));
    for (const match of text.matchAll(pluralCall)) {
      keys.add(`${JSON.parse(`"${match[1]}"`)}|${JSON.parse(`"${match[2]}"`)}`);
    }
  }
  return keys;
}

const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

for (const [language, catalog] of Object.entries(CATALOGS)) {
  Deno.test(`${LANGUAGES[language as keyof typeof LANGUAGES]} has every string, and no strays`, async () => {
    const keys = await sourceKeys();
    assertEquals([...keys].filter((key) => !(key in catalog)), []);
    assertEquals(Object.keys(catalog).filter((key) => !keys.has(key)), []);
  });

  Deno.test(`${LANGUAGES[language as keyof typeof LANGUAGES]} keeps every placeholder`, () => {
    for (const [key, text] of Object.entries(catalog)) {
      const forms = text.split("|");
      const originals = key.split("|");
      assertEquals(forms.length, originals.length, key);
      forms.forEach((form, index) => assertEquals(placeholders(form), placeholders(originals[index]!), key));
    }
  });

  Deno.test(`${LANGUAGES[language as keyof typeof LANGUAGES]} keeps the attribution the licence requires`, () => {
    const about = Object.entries(catalog).filter(([key]) => key.includes("Exordium by Harvest (HarvestLabs)"));
    assert(about.length > 0);
    for (const [, text] of about) assert(text.includes("Exordium by Harvest (HarvestLabs)"));
  });
}

Deno.test("English is the source: its text comes back, filled in", () => {
  setLanguage("en", "en-US");
  assertEquals(tr("Version {current}", { current: "0.1.0" }), "Version 0.1.0");
  assertEquals(plural(1, "{count} mod", "{count} mods"), "1 mod");
  assertEquals(plural(2, "{count} mod", "{count} mods"), "2 mods");
});

Deno.test("system follows Windows, and falls back to English", () => {
  setLanguage("system", "fr-CA");
  assertEquals(tr("Library"), fr["Library"]);
  setLanguage("system", "ru-RU");
  assertEquals(tr("Library"), "Library");
  setLanguage("en", "en-US");
});

Deno.test("French counts zero as one", () => {
  setLanguage("fr", "en-US");
  assertEquals(
    plural(0, "{count} mod", "{count} mods"),
    fr["{count} mod|{count} mods"]!.split("|")[0]!.replace("{count}", "0"),
  );
  setLanguage("en", "en-US");
});
