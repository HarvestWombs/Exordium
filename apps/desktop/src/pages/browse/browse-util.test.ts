import { assertEquals } from "@std/assert";
import { fileExtension, formatClock } from "./browse-util.ts";

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
