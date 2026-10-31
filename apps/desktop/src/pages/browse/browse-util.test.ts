import { assertEquals } from "@std/assert";
import { formatClock } from "./browse-util.ts";

Deno.test("time left reads as a clock", () => {
  assertEquals(formatClock(4), "00:04");
  assertEquals(formatClock(100), "01:40");
  assertEquals(formatClock(3599.2), "1:00:00");
  assertEquals(formatClock(3723), "1:02:03");
});
