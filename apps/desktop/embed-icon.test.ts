import { assertEquals, assertThrows } from "@std/assert";
import { buildGroup, parseIco } from "./embed-icon.ts";

Deno.test("the committed .ico holds every size the shell asks for", async () => {
  const entries = parseIco(await Deno.readFile(new URL("./assets/exordium.ico", import.meta.url)));
  // Width byte 0 means 256: the field is one byte.
  assertEquals(entries.map((entry) => entry.header[0] || 256), [16, 24, 32, 48, 64, 128, 256]);
});

Deno.test("an icon group points at resource ids 1..n with each image's real size", () => {
  const header = (width: number) => new Uint8Array([width, width, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0]);
  const group = buildGroup([
    { header: header(16), image: new Uint8Array(10) },
    { header: header(32), image: new Uint8Array(20) },
  ]);
  const view = new DataView(group.buffer);
  assertEquals([view.getUint16(2, true), view.getUint16(4, true)], [1, 2]);
  assertEquals([group[6], view.getUint32(6 + 8, true), view.getUint16(6 + 12, true)], [16, 10, 1]);
  assertEquals([group[20], view.getUint32(20 + 8, true), view.getUint16(20 + 12, true)], [32, 20, 2]);
  assertThrows(() => parseIco(new Uint8Array([1, 2, 3, 4, 5, 6])), Error, "not an .ico");
});
