import { assertEquals } from "@std/assert";
import { cleanManifest } from "./manifest.ts";

Deno.test("half-typed lines and links are tidied, and everything else is left alone", () => {
  const clean = cleanManifest({
    core: "1.10f",
    links: [{ label: "Site", url: "https://example.com" }, { label: "Unfinished", url: "  " }],
    loads: { mpqs: ["one.mpq ", "", "  two.mpq"], d2mod: true },
    launch: { seed: "12", seedEnabled: false },
    theAuthorsOwn: 7,
  });
  assertEquals(clean, {
    core: "1.10f",
    links: [{ label: "Site", url: "https://example.com" }],
    loads: { mpqs: ["one.mpq", "two.mpq"], dlls: [], d2mod: true },
    launch: { seed: "12", seedEnabled: false },
    theAuthorsOwn: 7,
  });
});
