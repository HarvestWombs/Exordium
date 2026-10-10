import { assertEquals } from "@std/assert";
import {
  archiveItemFromDoc,
  cleanDescription,
  contentKeywords,
  executableInstallWarning,
  keywordsFor,
  modDbDownloadLinks,
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
