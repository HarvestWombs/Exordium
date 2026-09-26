import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { ArtError, ArtStore, isPng, pngSize } from "./mod.ts";

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

Deno.test("the store keeps PNG artwork by title, refuses anything else, and stays in its folder", async () => {
  const root = await Deno.makeTempDir({ prefix: "exordium-art-" });
  try {
    const store = new ArtStore(root);
    assertEquals(await store.has("mod-the-black-soul", "banner"), false);
    await store.save("mod-the-black-soul", "banner", png(1920, 500));
    assertEquals(await store.has("mod-the-black-soul", "banner"), true);
    assertEquals(await store.read("mod-the-black-soul", "banner"), png(1920, 500));
    await store.save("mod-the-black-soul", "icon", png(256, 256));
    await assertRejects(() => store.save("mod-the-black-soul", "icon", png(512, 512)), ArtError, "256×256");
    await assertRejects(() => store.save("mod-the-black-soul", "portrait", new Uint8Array(40)), ArtError, "Not a PNG");
    assertThrows(() => store.path("../escape", "icon"), ArtError, "not a valid art key");
    await store.remove("mod-the-black-soul", "banner");
    assertEquals(await store.read("mod-the-black-soul", "banner"), null);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
