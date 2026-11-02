import { assertEquals } from "@std/assert";
import { moveInOrder } from "./shelf-order.ts";

Deno.test("a shelf moves before or after another", () => {
  assertEquals(moveInOrder(["a", "b", "c"], ["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
  assertEquals(moveInOrder(["a", "b", "c"], ["a", "b", "c"], "a", "c", "after"), ["b", "c", "a"]);
});

Deno.test("shelves this page does not list keep their saved place", () => {
  const saved = ["favorites", "mods", "collection:x", "cores"];
  assertEquals(moveInOrder(saved, ["mods", "cores"], "cores", "mods", "before"), [
    "favorites",
    "cores",
    "mods",
    "collection:x",
  ]);
});

Deno.test("the first move saves the order on screen", () => {
  assertEquals(moveInOrder([], ["a", "b", "c"], "c", "b", "before"), ["a", "c", "b"]);
});

Deno.test("shelves never saved follow the saved ones", () => {
  assertEquals(moveInOrder(["b"], ["a", "b", "c"], "c", "a", "before"), ["b", "c", "a"]);
});

Deno.test("a move that means nothing leaves the order alone", () => {
  assertEquals(moveInOrder(["a", "b"], ["a", "b"], "a", "a", "before"), ["a", "b"]);
  assertEquals(moveInOrder(["a", "b"], ["a", "b"], "gone", "a", "before"), ["a", "b"]);
});
