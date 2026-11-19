import { assertEquals } from "@std/assert";
import { catalogEntries, fileExtension, formatClock } from "./browse-util.ts";
import type { Item, ModDbItem } from "./types.ts";

Deno.test("time left reads as a clock", () => {
  assertEquals(formatClock(4), "00:04");
  assertEquals(formatClock(100), "01:40");
  assertEquals(formatClock(3599.2), "1:00:00");
  assertEquals(formatClock(3723), "1:02:03");
});

Deno.test("a file's type is its extension, in capitals", () => {
  assertEquals(fileExtension("pd2pl_1.4.0_update_10.zip"), "ZIP");
  assertEquals(fileExtension("D2SE_Lament_of_Innocence_1.06a_sfx.exe"), "EXE");
  assertEquals(fileExtension("Patch_D2.7z"), "7Z");
  // A version number or a name with no extension is not a type.
  assertEquals(fileExtension("Mod v1.10 final"), "");
  assertEquals(fileExtension(""), "");
});

const archive = (id: string, title: string): Item => ({
  source: "archive",
  id,
  title,
  description: "",
  creator: null,
  addedAt: null,
  downloads: 0,
  size: 0,
  keywords: [],
  page: `https://archive.org/details/${id}`,
  cover: "",
});

const moddb = (id: string, title: string, kind: ModDbItem["kind"]): ModDbItem => ({
  source: "moddb",
  kind,
  sourceLabel: "Files",
  id,
  title,
  description: "",
  addedAt: null,
  page: `https://www.moddb.com/${id}`,
  installPage: `https://www.moddb.com/${id}/downloads/file`,
  cover: "",
  keywords: [],
});

Deno.test("the catalog merges exact cross-provider titles and keeps ambiguous releases separate", () => {
  const entries = catalogEntries(
    [archive("mortal", "MortalBorne"), archive("mortal-old", "MortalBorne 0.9")],
    [moddb("mods/mortal", "Mortal Borne", "mod"), moddb("downloads/mortal", "Mortal Borne", "file")],
  );
  assertEquals(entries.length, 2);
  assertEquals(entries[0]?.archive?.id, "mortal");
  assertEquals(entries[0]?.moddb?.kind, "file");
  assertEquals(entries[1]?.moddb, null);
});

Deno.test("the catalog groups every ModDB release beneath its project card", () => {
  const entries = catalogEntries([], [
    moddb("mods/shadows/downloads/shadows-301", "[Update] Shadows 3.01", "file"),
    moddb("mods/shadows/downloads/shadows-302", "[Update] Shadows 3.02", "file"),
    moddb("mods/shadows", "Shadows", "mod"),
    moddb("games/diablo-2-lod/addons/other", "Other", "addon"),
  ]);

  assertEquals(entries.length, 2);
  assertEquals(entries[0]?.title, "Shadows");
  assertEquals(entries[0]?.moddb?.kind, "mod");
  assertEquals(entries[0]?.moddbVariants.length, 3);
  assertEquals(entries[1]?.title, "Other");
});
