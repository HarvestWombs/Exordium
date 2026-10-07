import { assertEquals } from "@std/assert";
import { archiveItemFromDoc, cleanDescription, contentKeywords, keywordsFor, parseArchiveListing } from "./browse.ts";

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
