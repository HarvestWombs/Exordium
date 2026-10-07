import { assertEquals } from "@std/assert";
import { webViewChildren } from "./webview.ts";

Deno.test("a process without a window has no WebView2 children", () => {
  assertEquals(webViewChildren(Deno.pid), 0);
});
