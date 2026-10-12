import { assertEquals } from "@std/assert";
import {
  archiveItemFromDoc,
  cleanDescription,
  contentKeywords,
  executableInstallWarning,
  keywordsFor,
  modDbBytes,
  modDbDetailsFromHtml,
  modDbDownloadLinks,
  modDbImage,
  modDbItemsFromHtml,
  modDbItemsFromRss,
  modDbNextPage,
  parseArchiveListing,
} from "./browse.ts";

Deno.test("keywords come from the entry's own words", () => {
  assertEquals(keywordsFor("Firozo mod"), []);
  assertEquals(keywordsFor("D2SE mod for 1.13c with PlugY, new runewords and a shared stash"), [
    "1.13",
    "items",
    "plugy",
    "d2se",
    "stash",
  ]);
  assertEquals(keywordsFor("Lord of Destruction v1.10f overhaul, single player and hardcore"), [
    "1.10",
    "lod",
    "overhaul",
    "single",
    "hardcore",
  ]);
  // A version needs its own word: 11.10 or 1.100 are not 1.10.
  assertEquals(keywordsFor("build 11.10, file 1.100"), []);
});

Deno.test("descriptions lose HTML, entities and the pasted translator widget", () => {
  assertEquals(
    cleanDescription("Diablo 2 mod<br/>Needs &amp; uses PlugY TRANSLATE with x English Arabic Hebrew"),
    "Diablo 2 mod\nNeeds & uses PlugY",
  );
  assertEquals(cleanDescription(["a", "b"]), "a\nb");
  assertEquals(cleanDescription(undefined), "");
});

Deno.test("an archive.org search row becomes a browse entry, and a bad identifier does not", () => {
  const item = archiveItemFromDoc({
    identifier: "firozo-mod",
    title: "Firozo mod",
    description: "Diablo 2 mod for 1.10",
    creator: "Frio Laszlo",
    downloads: 110,
    item_size: 14150332,
    publicdate: "2026-01-14T14:22:18Z",
  });
  assertEquals(item?.keywords, ["1.10"]);
  assertEquals(item?.cover, "https://archive.org/services/img/firozo-mod");
  assertEquals(item?.creator, "Frio Laszlo");
  assertEquals(archiveItemFromDoc({ identifier: "../evil" }), null);
});

Deno.test("the translator widget is cut however the HTML spaced it", () => {
  assertEquals(
    cleanDescription("Diablo 2 mod <b>TRANSLATE</b> with <a href='#'>x</a>\nEnglish Arabic"),
    "Diablo 2 mod",
  );
});

Deno.test("archive.org's listing of an archive's files is read with sizes, and says what the mod holds", () => {
  const html = [
    '<tr><td><a href="//archive.org/download/firozo-mod/Firozo_v0.19.zip/Readme.txt">Readme.txt</a><td><td>2008-01-13 20:12<td id="size">11450</tr>',
    '<tr><td><a href="//archive.org/download/firozo-mod/Firozo_v0.19.zip/Firozo%2FD2SE_SETUP.ini">Firozo/D2SE_SETUP.ini</a><td><td>2008-01-13 20:12<td id="size">3000</tr>',
    '<tr><td><a href="//archive.org/download/firozo-mod/Firozo_v0.19.zip/Firozo%2FPlugY.dll">Firozo/PlugY.dll</a><td><td>2008-01-13 20:12<td id="size">200000</tr>',
  ].join("\n");
  const members = parseArchiveListing(html);
  assertEquals(members, [
    { path: "Readme.txt", size: 11450 },
    { path: "Firozo/D2SE_SETUP.ini", size: 3000 },
    { path: "Firozo/PlugY.dll", size: 200000 },
  ]);
  assertEquals(contentKeywords(members), ["d2se", "plugy"]);
});

Deno.test("ModDB download pages expose start and mirror links for the in-house downloader", () => {
  const html = [
    '<a href="/downloads/start/12345">Download now</a>',
    '<a href="https://www.moddb.com/downloads/mirror/12345/987/abcdef">Mirror</a>',
  ].join("\n");
  assertEquals(modDbDownloadLinks(html, "https://www.moddb.com/mods/example/downloads/file"), [
    "https://www.moddb.com/downloads/mirror/12345/987/abcdef",
    "https://www.moddb.com/downloads/start/12345",
  ]);
});

Deno.test("executable downloads are manual installs only", () => {
  assertEquals(executableInstallWarning("setup.exe")?.includes("will not run or unpack"), true);
  assertEquals(executableInstallWarning("mod.zip"), null);
});

Deno.test("ModDB RSS rows become cached catalog items", () => {
  const rss = `<?xml version="1.0"?>
    <rss xmlns:media="http://search.yahoo.com/mrss/">
      <channel>
        <item>
          <title>Example D2SE Mod 1.13c</title>
          <link>https://www.moddb.com/mods/example/downloads/example-d2se-mod</link>
          <description><![CDATA[<p>PlugY overhaul &amp; new skills.</p>]]></description>
          <pubDate>Sat, 10 Oct 2026 12:00:00 +0000</pubDate>
          <media:thumbnail url="https://media.moddb.com/cache/images/mods/1/2/thumb.jpg" />
        </item>
      </channel>
    </rss>`;
  const items = modDbItemsFromRss(rss, "addon", "Addons");
  assertEquals(items.length, 1);
  assertEquals(items[0]?.source, "moddb");
  assertEquals(items[0]?.kind, "addon");
  assertEquals(items[0]?.sourceLabel, "Addons");
  assertEquals(items[0]?.title, "Example D2SE Mod 1.13c");
  assertEquals(items[0]?.keywords, ["1.13", "overhaul", "skills", "plugy", "d2se"]);
  assertEquals(items[0]?.cover, "https://media.moddb.com/cache/images/mods/1/2/thumb.jpg");
});

Deno.test("ModDB category pages become files, addons and mods", () => {
  const html = `
    <div class="row rowcontent rowtimeframe3 clear">
      <a href="/mods/diablo-ii-arreat" title="Diablo II Arreat" class="image">
        <img src="https://media.moddb.com/cache/images/mods/1/74/73279/crop_120x90/Diablo_II_Arreat.jpg" />
      </a>
      <div class="content">
        <h4><a href="/mods/diablo-ii-arreat">Diablo II Arreat</a></h4>
        <span class="date"><time datetime="2026-10-09T12:57:04+00:00">Oct 9 2026</time></span>
        <p>Mod for Diablo II Lord of Destruction version 1.13c.</p>
      </div>
    </div>`;
  const items = modDbItemsFromHtml(html, "mod", "Mods", "https://www.moddb.com/games/diablo-2-lod/mods");
  assertEquals(items.length, 1);
  assertEquals(items[0]?.title, "Diablo II Arreat");
  assertEquals(items[0]?.page, "https://www.moddb.com/mods/diablo-ii-arreat");
  assertEquals(items[0]?.installPage, "https://www.moddb.com/mods/diablo-ii-arreat/downloads");
  assertEquals(items[0]?.cover.includes("Diablo_II_Arreat.jpg"), true);
});

Deno.test("ModDB page walking follows category rows before mirror pages", () => {
  const html = [
    '<h4><a href="/mods/example/downloads/example-full">Full version</a></h4>',
    '<h4><a href="/mods/example/downloads/add">Add file</a></h4>',
    '<a href="/mods/example/downloads">Downloads</a>',
    '<a href="/downloads/start/12345">Download now</a>',
  ].join("\n");
  assertEquals(modDbDownloadLinks(html, "https://www.moddb.com/mods/example/downloads"), [
    "https://www.moddb.com/downloads/start/12345",
    "https://www.moddb.com/mods/example/downloads/example-full",
  ]);
});

Deno.test("ModDB category pagination follows the next page", () => {
  assertEquals(
    modDbNextPage(
      '<link rel="next" href="/games/diablo-2-lod/mods/page/2" />',
      "https://www.moddb.com/games/diablo-2-lod/mods",
    ),
    "https://www.moddb.com/games/diablo-2-lod/mods/page/2",
  );
  assertEquals(
    modDbNextPage(
      '<a class="next" href="/games/diablo-2-lod/mods/page/3">Next</a>',
      "https://www.moddb.com/games/diablo-2-lod/mods/page/2",
    ),
    "https://www.moddb.com/games/diablo-2-lod/mods/page/3",
  );
});

Deno.test("ModDB pictures are asked for at sizes its cache always has", () => {
  const crop = "https://media.moddb.com/cache/images/mods/1/43/42940/crop_120x90/005_-_Start.jpg";
  assertEquals(
    modDbImage(crop, "thumb_620x2000"),
    "https://media.moddb.com/cache/images/mods/1/43/42940/thumb_620x2000/005_-_Start.jpg",
  );
  assertEquals(
    modDbImage("https://media.moddb.com/images/downloads/1/252/251341/Andariel.jpg", "crop_120x90"),
    "https://media.moddb.com/cache/images/downloads/1/252/251341/crop_120x90/Andariel.jpg",
  );
  assertEquals(modDbImage("https://example.com/a.jpg", "crop_120x90"), "https://example.com/a.jpg");
});

Deno.test("ModDB sizes read as bytes", () => {
  assertEquals(modDbBytes("15.29mb (16,034,640 bytes)"), 16034640);
  assertEquals(modDbBytes("1.05gb"), Math.round(1.05 * 1024 ** 3));
  assertEquals(modDbBytes("none"), null);
});

const MODDB_ROW = (label: string, value: string) =>
  `<div class="row clear"><h5>${label}</h5><span class="summary">${value}</span></div>`;

Deno.test("a ModDB file page gives its facts, description, picture and its mod's files", () => {
  const html =
    `<meta property="og:image" content="https://media.moddb.com/images/downloads/1/252/251341/Andariel.jpg" />
    ${MODDB_ROW("Location", '<a href="/games">Games</a> : <a href="/mods/dreamaker-mod">Dreamaker-Mod</a>')}
    ${MODDB_ROW("Filename", "Dreamaker-Mod_2026-10-10.exe")}
    ${MODDB_ROW("Uploader", '<a href="/members/dreamaker-mod">(Dreamaker)</a>')}
    ${MODDB_ROW("Added", '<time datetime="2023-06-06T11:49:33+00:00">Jun 6th, 2023</time>')}
    ${MODDB_ROW("Size", "15.29mb (16,034,640 bytes)")}
    ${MODDB_ROW("Downloads", '<a href="/statistics">3,203 (9 today)</a>')}
    <div id="downloaddescription" style="display: none;"><hr /><p># Diablo II by Dreamaker<br />Quality of Life</p></div>
    <a href="/mods/dreamaker-mod/downloads/dreamaker-mod-2026-10-10" class="button buttonfull"><span style="float: right;">PATCH</span><span>Dreamaker-Mod</span><hr><span>3.2K</span><span>15.29mb</span></a>
    <a href="/games/diablo-2-lod/downloads/hero-editor" class="button buttonfull"><span>FULL</span><span>Hero Editor</span><hr><span>1K</span><span>5mb</span></a>
    ${MODDB_ROW("Homepage", '<a href="https://bio.link/dreamaker">Bio.link</a>')}`;
  const page = "https://www.moddb.com/mods/dreamaker-mod/downloads/dreamaker-mod-2026-10-10";
  const details = modDbDetailsFromHtml(html, page);
  assertEquals(details.creator, "Dreamaker");
  assertEquals(details.filename, "Dreamaker-Mod_2026-10-10.exe");
  assertEquals(details.size, 16034640);
  assertEquals(details.downloads, 3203);
  assertEquals(details.addedAt, "2023-06-06T11:49:33.000Z");
  assertEquals(details.description, "# Diablo II by Dreamaker\nQuality of Life");
  assertEquals(details.parentMod, "https://www.moddb.com/mods/dreamaker-mod");
  assertEquals(details.screenshots, [{
    full: "https://media.moddb.com/cache/images/downloads/1/252/251341/thumb_620x2000/Andariel.jpg",
    thumb: "https://media.moddb.com/cache/images/downloads/1/252/251341/crop_120x90/Andariel.jpg",
  }]);
  // The game's own downloads in the sidebar are not this mod's files.
  assertEquals(details.files.map((f) => [f.name, f.category, f.size]), [["Dreamaker-Mod", "PATCH", 16032727]]);
  assertEquals(details.links, [{ label: "Homepage", url: "https://bio.link/dreamaker" }]);
});

Deno.test("a game-level ModDB addon takes nothing from the game's own profile", () => {
  const html = `${MODDB_ROW("Location", '<a href="/games/diablo-2-lod">Diablo II</a>')}
    ${MODDB_ROW("Homepage", '<a href="http://sea.blizzard.com/">Blizzard</a>')}
    <a href="/games/diablo-2-lod/downloads/hero-editor" class="button buttonfull"><span>FULL</span><span>Hero Editor</span><hr><span>1K</span><span>5mb</span></a>`;
  const details = modDbDetailsFromHtml(html, "https://www.moddb.com/games/diablo-2-lod/addons/drop-mod");
  assertEquals(details.files, []);
  assertEquals(details.links, []);
  assertEquals(details.parentMod, null);
});
