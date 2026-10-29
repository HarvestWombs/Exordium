import { assertEquals } from "@std/assert";
import { versionResource } from "./stamp-game.ts";

function utf16(bytes: Uint8Array): string {
  return new TextDecoder("utf-16le").decode(bytes);
}

Deno.test("a stamped Game.exe's version block carries the core's version and the name", () => {
  const block = versionResource([1, 0, 10, 39], "Diablo II");
  const view = new DataView(block.buffer);
  assertEquals(view.getUint16(0, true), block.length); // wLength covers the whole tree
  assertEquals(view.getUint16(2, true), 52); // VS_FIXEDFILEINFO
  assertEquals(utf16(block.slice(6, 36)), "VS_VERSION_INFO");
  // Key "VS_VERSION_INFO\0" ends at 38, padded to 40: the fixed info starts there.
  assertEquals(view.getUint32(40, true), 0xFEEF04BD);
  assertEquals(view.getUint32(48, true), 1 << 16 | 0); // 1.0
  assertEquals(view.getUint32(52, true), 10 << 16 | 39); // .10.39
  const all = utf16(block);
  for (const text of ["FileDescription", "Diablo II", "FileVersion", "1.0.10.39", "OriginalFilename", "Game.exe"]) {
    assertEquals(all.includes(text), true, text);
  }
});
