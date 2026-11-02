import { assert, assertEquals } from "@std/assert";
import { autoscrollSpeed } from "./autoscroll.ts";

Deno.test("nothing scrolls inside the dead zone", () => {
  assertEquals(autoscrollSpeed(0), 0);
  assertEquals(autoscrollSpeed(14), 0);
  assertEquals(autoscrollSpeed(-14), 0);
});

Deno.test("the page follows the pointer's side, faster further out", () => {
  assert(autoscrollSpeed(40) > 0);
  assert(autoscrollSpeed(-40) < 0);
  assertEquals(autoscrollSpeed(-40), -autoscrollSpeed(40));
  assert(autoscrollSpeed(200) > autoscrollSpeed(40) * 4);
});
