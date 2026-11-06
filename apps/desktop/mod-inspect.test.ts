import { assertEquals } from "@std/assert";
import {
  aboutPlugin,
  decodeText,
  hasProse,
  looksLikeData,
  looksLikeLog,
  pickReadme,
  readmeCandidates,
} from "./browse.ts";
import { inspectMod, readmeVersions } from "./mod-inspect.ts";

const files = (...paths: [string, number?][]) => paths.map(([path, size]) => ({ path, size: size ?? 100 }));

Deno.test("a readme's game version: lettered or after a game word, never the mod's own version", () => {
  assertEquals(readmeVersions("Мод тестировался на версии 1.13c, так что лучше ставить эту версию."), ["1.13c"]);
  // The mod's own changelog numbers and a version that never existed are not the game's.
  assertEquals(readmeVersions("Changes 1.10:\n- more gold\nNezeramontias v1.08a"), []);
  assertEquals(readmeVersions("Version history 1.0, 1.1. Requires patch 1.10 of Diablo II."), ["1.10"]);
  // Tested-on wins over a passing mention.
  assertEquals(readmeVersions("Works like 1.09d did. Tested on 1.13c."), ["1.13c", "1.09d"]);
});

Deno.test("a Russian rar mod: version and launch from its readme, language from its files", () => {
  const members = files(
    ["Mod 2.1/Patch_D2.mpq", 4645541],
    ["Mod 2.1/Установка и список изменений.txt", 44958],
    ["Mod 2.1/data/global/excel/Armor.txt"],
    ["Mod 2.1/data/global/excel/armor.bin"],
    ["Mod 2.1/data/local/lng/rus/patchstring.tbl"],
    ["Mod 2.1/data/local/font/cyr/font8.dc6"],
  );
  const readme = "Мод тестировался на версии 1.13c.\nдописываем -direct -txt после кавычек.\n" +
    "Автор - Rus|Verm (Awesomealldays).\nVk.com/d2lodbgmod сообщество.\n" +
    "Мод Balance & Gameplay улучшает баланс и игровой процесс героев и наемников.";
  const found = inspectMod(members, { readme });
  assertEquals(found.core, { label: "1.13c", versions: ["1.13c"], basis: "readme" });
  assertEquals(found.launch, { direct: true, txt: true, basis: "readme" });
  assertEquals(found.language, { code: "rus", name: "Russian", basis: "files" });
  assertEquals(found.contents, "mod");
  assertEquals(found.author, "Rus|Verm (Awesomealldays)");
  assertEquals(found.links, [{ label: "VK", url: "https://Vk.com/d2lodbgmod" }]);
});

Deno.test("files alone: a lone Patch_D2.mpq is 1.10f to 1.14d, loose data needs -direct", () => {
  const found = inspectMod(files(["Patch_D2.mpq"], ["data/global/excel/skills.txt"]));
  assertEquals(found.core?.label, "1.10f–1.14d");
  assertEquals(found.core?.basis, "files");
  assertEquals(found.launch, { direct: true, txt: true, basis: "files" });
  // A 1.14 Game.exe holds the whole game; earlier ones are small stubs.
  assertEquals(inspectMod(files(["Game.exe", 3_600_000], ["data/x.dc6"])).core?.label, "1.14");
});

Deno.test("a D2SE mod with its own game DLLs is a mod, its setup's core first", () => {
  const members = files(["Mod/D2SE_SETUP.ini"], ["Mod/D2Common.dll", 725057], ["Mod/PlugY.dll"], ["Mod/Mod.mpq"]);
  const found = inspectMod(members, { setup: new Map([["d2core", "1.13c"]]) });
  assertEquals(found.contents, "mod");
  assertEquals(found.core, { label: "1.13c", versions: ["1.13c"], basis: "setup" });
  assertEquals(found.loaders, ["plugy", "d2se"]);
  // Without the setup's text (a 7z), the DLLs it ships say nothing: mods modify them.
  assertEquals(inspectMod(members).core, null);
});

Deno.test("a plugin made for one patch settles the core; game DLL sizes never do", () => {
  // Apocalypse: a 1.10f mod (D2Mod runs only on 1.10f) that ships a Fog.dll sized like 1.13's.
  const apocalypse = files(["mod/D2SE_SETUP.ini"], ["mod/Fog.dll", 212992], ["mod/D2Mod.dll", 9216], ["mod/PlugY.dll"]);
  assertEquals(inspectMod(apocalypse).core, { label: "1.10f", versions: ["1.10f"], basis: "files" });
  assertEquals(inspectMod(files(["mod/D2SE_SETUP.ini"], ["mod/Fog.dll", 212992], ["mod/PlugY.dll"])).core, null);
  assertEquals(inspectMod(files(["mod/D2SE_SETUP.ini"], ["mod/BH.dll"])).core?.label, "1.13c");
});

Deno.test("a mod with several language folders is multilingual: no language", () => {
  const several = files(["data/local/lng/chi/a.tbl"], ["data/local/lng/eng/a.tbl"], ["data/local/lng/deu/a.tbl"]);
  assertEquals(inspectMod(several).language, null);
  assertEquals(inspectMod(files(["Language_CHI/a.mpq"], ["Language_KOR/a.mpq"])).language, null);
  assertEquals(inspectMod(files(["data/local/lng/deu/a.tbl"])).language?.name, "German");
});

Deno.test("text decodes from Windows-1251, DOS 866, UTF-8 and Windows-1252", () => {
  const russian = "Мод тестировался на версии";
  assertEquals(decodeText(encode(russian, "windows-1251")), russian);
  assertEquals(decodeText(encode(russian, "ibm866")), russian);
  assertEquals(decodeText(new TextEncoder().encode(`${russian} ✓`)), `${russian} ✓`);
  assertEquals(decodeText(encode("Café crème, déjà vu", "windows-1252")), "Café crème, déjà vu");
});

Deno.test("the readme: one named in any language before a changelog, never a data table", () => {
  const members = files(
    ["Mod/Новые рецепты.txt", 419],
    ["Mod/Установка и список изменений.txt", 44958],
    ["Mod/data/global/excel/Armor.txt", 90000],
  );
  assertEquals(pickReadme(members, null)?.path, "Mod/Установка и список изменений.txt");
  assertEquals(pickReadme(members, "mod/новые рецепты.txt")?.path, "Mod/Новые рецепты.txt");
  assertEquals(pickReadme(files(["data/global/excel/Armor.txt"]), null), null);
});

Deno.test("a log is never the readme, by its name or by its lines; a changelog still is", () => {
  const members = files(["Mod/debuglog240213.txt", 9000], ["Mod/BnetLog.txt", 900], ["Mod/d2dx_log.txt", 800]);
  assertEquals(pickReadme(members, null), null);
  assertEquals(
    pickReadme(files(["Mod/debuglog.txt", 9000], ["Mod/Changelog.txt", 50]), null)?.path,
    "Mod/Changelog.txt",
  );
  assertEquals(
    pickReadme(files(["Mod/Diablo II Epilogue Mod Readme.txt", 50]), null)?.path,
    "Mod/Diablo II Epilogue Mod Readme.txt",
  );
  const log = "------\nDESKTOP-7ST29V9 Realm startup at 2024-02-13 18:34:05.149\n------\n" +
    "18:34:05.149  starting\n18:34:05.150  loading D2Common\n18:34:05.151  loading D2Game\n18:34:05.152  done";
  assertEquals(looksLikeLog(log), true);
  assertEquals(looksLikeLog("2024-01-02\n- Fixed the cube\n- New runewords\n2023-12-01\n- First release"), false);
  // A plugin's data table or settings file is not a readme either.
  const table = "*desc\tenabled\tpage\tx\ty\n" + "cubepoints\t1\t1\t25\t445\n".repeat(5);
  assertEquals(looksLikeData(table), true);
  assertEquals(looksLikeData("[Main]\nWidth=800\nHeight=600\nWindowed=1\nVsync=0"), true);
  assertEquals(looksLikeData("Advanced Mod\nThis mod makes the game harder.\nGive it a try.\nHave fun."), false);
  // A list of names is not a readme: a readme has sentences.
  assertEquals(hasProse("0\tnull\n1\trefilling\n2\thealth\n3\tmana"), false);
  assertEquals(hasProse("This mod makes the game a lot harder.\nGive it a try and tell us what you think."), true);
});

Deno.test("the readme is the mod's own: its folder or a docs folder, never a plugin's", () => {
  const members = files(
    ["Zy-El/D2SE_SETUP.ini"],
    ["Zy-El/PlugY/PlugY_The_Survival_Kit_-_Readme.txt", 40000],
    ["Zy-El/D2GL/readme.txt", 3000],
    ["Zy-El/Backup/old/readme.txt", 9000],
    ["Zy-El/Docs/Zy-El guide.txt", 20000],
    ["Zy-El/readme.txt", 500],
  );
  // The mod's title in a docs folder's file beats a generic readme; plugins and deep folders never count.
  assertEquals(readmeCandidates(members, null, "D2SE Zy-El Mod").map((m) => m.path), [
    "Zy-El/Docs/Zy-El guide.txt",
    "Zy-El/readme.txt",
  ]);
  // The mod's own folder may carry a plugin's name ("... D2GL QoL"); only what is below it is judged.
  const named = files(["BFE v1.80 D2GL QoL/D2SE_SETUP.ini"], ["BFE v1.80 D2GL QoL/readme_bfe.txt", 3934]);
  assertEquals(pickReadme(named, null, "Battle For Elements")?.path, "BFE v1.80 D2GL QoL/readme_bfe.txt");
  // A text that opens as a plugin's readme is caught by its words, unless it names the mod.
  assertEquals(aboutPlugin("PlugY, The Survival Kit\nVersion 14.03\nBy Yohann Nicolas", "Zy-El Mod"), true);
  assertEquals(aboutPlugin("Zy-El mod 4.8\nNeeds PlugY and D2GL", "Zy-El Mod"), false);
});

Deno.test("documentation alone is not a mod", () => {
  assertEquals(inspectMod(files(["Guide/Runewords.pdf"], ["Guide/readme.txt"], ["Guide/map.png"])).contents, "docs");
  assertEquals(inspectMod(files(["Mod/D2SE_SETUP.ini"], ["Mod/Guide.pdf"])).contents, "mod");
});

/** Bytes of `text` in a single-byte code page, built from the decoder's own table. */
function encode(text: string, label: string): Uint8Array {
  const table = new Map<string, number>();
  const decoded = new TextDecoder(label).decode(Uint8Array.from({ length: 256 }, (_, i) => i));
  [...decoded].forEach((char, byte) => table.set(char, byte));
  return Uint8Array.from([...text].map((char) => table.get(char) ?? 0x3f));
}
