import { assert, assertEquals, assertThrows } from "@std/assert";
import { chunksOf, parseTranslation } from "./translate.ts";

Deno.test("a description within the limit stays whole", () => {
  assertEquals(chunksOf("short"), ["short"]);
  assertEquals(chunksOf(""), []);
});

Deno.test("a long description is cut on paragraphs, and nothing is lost", () => {
  const text = "first paragraph\n\nsecond one\n\nthird";
  const chunks = chunksOf(text, 20);
  assertEquals(chunks.join(""), text);
  assertEquals(chunks[0], "first paragraph\n\n");
  assert(chunks.every((chunk) => chunk.length <= 20));
});

Deno.test("text with no spaces is still cut to the limit", () => {
  const chunks = chunksOf("x".repeat(25), 10);
  assertEquals(chunks.map((chunk) => chunk.length), [10, 10, 5]);
});

Deno.test("the segments are joined and the language read", () => {
  const body = [[["A mod.\n\n", "Ein Mod.\n\n", null], ["New items.", "Neue Gegenstände.", null]], null, "de"];
  assertEquals(parseTranslation(body), { text: "A mod.\n\nNew items.", from: "de" });
});

Deno.test("an answer of another shape is an error, not an empty translation", () => {
  assertThrows(() => parseTranslation({ error: "nope" }));
  assertThrows(() => parseTranslation([[], null, "de"]));
});
