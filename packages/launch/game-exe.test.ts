import { assertEquals } from "@std/assert";
import { gameExeVersion } from "./mod.ts";

Deno.test("each core names the Game.exe version plugins look for", () => {
  assertEquals(gameExeVersion("1.10f"), [1, 0, 10, 39]);
  assertEquals(gameExeVersion("1.13C"), [1, 0, 13, 60]);
  assertEquals(gameExeVersion("1.07"), null); // not known, so not guessed
  assertEquals(gameExeVersion(null), null);
});
