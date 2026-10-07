import { assertEquals } from "@std/assert";
import { fileVersion, isSingleExeCore, singleExeCoreName } from "./exe-version.ts";

function withFixedInfo(ms: number, ls: number, at = 64): Uint8Array {
  const bytes = new Uint8Array(at + 64);
  const view = new DataView(bytes.buffer);
  view.setUint32(at, 0xFEEF04BD, true);
  view.setUint32(at + 4, 0x00010000, true);
  view.setUint32(at + 8, ms, true);
  view.setUint32(at + 12, ls, true);
  return bytes;
}

Deno.test("the file version comes from VS_FIXEDFILEINFO", () => {
  assertEquals(fileVersion(withFixedInfo((1 << 16) | 14, (3 << 16) | 71)), [1, 14, 3, 71]);
  assertEquals(fileVersion(new Uint8Array(128)), null);
});

Deno.test("a 1.14 Game.exe names its core by the patch number", () => {
  assertEquals(singleExeCoreName([1, 14, 3, 71]), "1.14d");
  assertEquals(singleExeCoreName([1, 14, 0, 64]), "1.14a");
  assertEquals(singleExeCoreName([1, 0, 13, 60]), null);
  assertEquals(singleExeCoreName(null), null);
});

Deno.test("only 1.14 cores are one executable", () => {
  assertEquals(isSingleExeCore("1.14d"), true);
  assertEquals(isSingleExeCore("1.14D"), true);
  assertEquals(isSingleExeCore("1.13c"), false);
  assertEquals(isSingleExeCore(null), false);
});
