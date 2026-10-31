import { assert, assertEquals } from "@std/assert";
import { sameLanguage, writtenIn } from "./language.ts";

const ENGLISH =
  "This mod adds new unique items, runewords and cube recipes, and rebalances every skill for all classes.";
const GERMAN = "Diese Modifikation fügt neue Gegenstände hinzu und verändert die Fähigkeiten aller Klassen im Spiel.";
const POLISH = "Trochę zmian kosmetycznych i kilka poprawek, dodano nowe tła umiejętności dla druida oraz nową muzykę.";
const RUSSIAN = "Этот мод не меняет в игре ничего кардинального, лишь некоторые предметы и умения всех персонажей.";

Deno.test("a description clearly in the player's language needs no translation", () => {
  assert(writtenIn(ENGLISH, "en"));
  assert(writtenIn(ENGLISH, "en-US"));
  assert(writtenIn(GERMAN, "de"));
});

Deno.test("a description in another language still offers one", () => {
  assertEquals(writtenIn(GERMAN, "en"), false);
  assertEquals(writtenIn(POLISH, "en"), false);
  assertEquals(writtenIn(RUSSIAN, "en"), false);
  assertEquals(writtenIn(ENGLISH, "fr"), false);
});

Deno.test("plain English needs less of a lead than text with accents", () => {
  assert(writtenIn("Version 1.27 released. See description and downloadable files for details.", "en"));
  assert(writtenIn("Quality of Life Mod containing improvements to play Single Player / Lan Game", "en"));
  assertEquals(writtenIn("patch v2.4.5 B - Odświeżone tło menu oraz interfejs", "en"), false);
});

Deno.test("too little text to judge still offers one", () => {
  assertEquals(writtenIn("New items", "en"), false);
  assertEquals(writtenIn("", "en"), false);
});

Deno.test("languages match on their base tag", () => {
  assert(sameLanguage("zh-CN", "zh"));
  assert(sameLanguage("EN", "en-GB"));
  assertEquals(sameLanguage("pt", "es"), false);
});
