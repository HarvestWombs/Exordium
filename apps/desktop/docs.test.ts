import { assertEquals } from "@std/assert";
import { findDocs, linkKind, modLinks, webUrl } from "./docs.ts";

Deno.test("a generated site is listed once, by its index; changelogs and readmes are found", () => {
  const { docs, changelogs } = findDocs(
    [
      "documentation/index.htm",
      "documentation/skills.htm",
      "documentation/items.htm",
      "Documentation/Changelog.txt",
      "modchangelog.txt",
      "Readme.txt",
      "D2Mod.ini",
      "tools/notes.txt",
      "save/Hero.d2s",
    ],
    "documentation\\readme.txt",
  );
  assertEquals(docs.map((d) => [d.path, d.kind]), [
    ["documentation/index.htm", "html"],
    ["Readme.txt", "text"],
  ]);
  assertEquals(changelogs.map((d) => d.path), ["Documentation/Changelog.txt", "modchangelog.txt"]);
});

Deno.test("the setup's own readme comes first", () => {
  const { docs } = findDocs(["Docs/Mod Readme.txt", "Docs/Runewords.txt"], "Docs\\Mod Readme.txt");
  assertEquals(docs.map((d) => d.path), ["Docs/Mod Readme.txt", "Docs/Runewords.txt"]);
});

Deno.test("dated changelogs are newest first", () => {
  const { changelogs } = findDocs(
    [
      "Changelog-2024-01-05.txt",
      "Patch Notes 2025.03.12.md",
      "History.txt",
      "changes_12-24-2024.txt",
    ],
    null,
  );
  assertEquals(changelogs.map((d) => d.path), [
    "Patch Notes 2025.03.12.md",
    "changes_12-24-2024.txt",
    "Changelog-2024-01-05.txt",
    "History.txt",
  ]);
});

Deno.test("links are web addresses only, named by kind, without duplicates", () => {
  assertEquals(webUrl("javascript:alert(1)"), null);
  assertEquals(webUrl("file:///C:/Windows"), null);
  assertEquals(webUrl("www.example.com"), "https://www.example.com/");
  assertEquals(linkKind("https://discord.gg/abc"), "discord");
  assertEquals(linkKind("http://d2mods.info/forum/viewtopic.php?t=1"), "forum");
  const links = modLinks(
    {
      homepage: "http://bth.d2mods.com/",
      board: "http://d2mods.info/forum/",
      readme: "documentation\\readme.txt",
      description: null,
    },
    [{ label: "Discord", url: "https://discord.gg/abc" }, { url: "http://bth.d2mods.com/" }, { url: "C:\\evil.exe" }],
  );
  assertEquals(links.map((l) => [l.label, l.kind]), [["Homepage", "web"], ["Forum", "forum"], ["Discord", "discord"]]);
});

Deno.test("a site whose index is also the setup's readme is listed once", () => {
  const { docs } = findDocs(["documentation/index.htm", "documentation/a.htm"], "documentation\index.htm");
  assertEquals(docs.map((d) => d.path), ["documentation/index.htm"]);
});
