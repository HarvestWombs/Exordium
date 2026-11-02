import { assertEquals, assertThrows } from "@std/assert";
import { ArtError, checkArt, chosenArtPath, isPng, pngSize } from "./mod.ts";

/** The smallest thing that reads as a PNG here: signature and an IHDR with the given size. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

Deno.test("a PNG is recognised and sized from its header", () => {
  assertEquals(isPng(png(1920, 500)), true);
  assertEquals(pngSize(png(1920, 500)), { width: 1920, height: 500 });
  assertEquals(isPng(new Uint8Array([0x42, 0x4d, ...new Array(40).fill(0)])), false); // a BMP
  assertThrows(() => pngSize(new Uint8Array(40)), ArtError, "Not a PNG");
});

Deno.test("a chosen image must be a PNG, an icon one that fits Game.exe", () => {
  checkArt("banner", png(1920, 480));
  checkArt("icon", png(256, 256));
  assertThrows(() => checkArt("icon", png(512, 512)), ArtError, "256×256");
  assertThrows(() => checkArt("portrait", new Uint8Array(40)), ArtError, "Not a PNG");
});

Deno.test("a chosen image has a name of its own, never one a mod would ship", () => {
  assertEquals(chosenArtPath("banner"), "art/chosen-banner.png");
  assertEquals(chosenArtPath("icon"), "art/chosen-icon.png");
});
