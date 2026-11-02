import { assertEquals, assertRejects } from "@std/assert";
import { pageDescription } from "./latest-uploads.ts";
import type { Upload } from "../types.ts";

function upload(key: string, source: Upload["source"], page?: string): Upload {
  return {
    key,
    source,
    title: "A mod",
    description: "",
    addedAt: "2026-10-01T00:00:00Z",
    cover: "",
    sourceLabel: "ModDB",
    ...(page ? { page } : {}),
  };
}

async function answering<T>(status: number, body: unknown, run: (asked: string[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = ((url: string) => {
    asked.push(url);
    return Promise.resolve(Response.json(body, { status }));
  }) as typeof fetch;
  try {
    return await run(asked);
  } finally {
    globalThis.fetch = real;
  }
}

Deno.test("a ModDB upload's description comes from its page, asked for once", () =>
  answering(200, { description: "From the page" }, async (asked) => {
    const entry = upload("moddb:a", "moddb", "https://www.moddb.com/mods/a");
    assertEquals(await pageDescription(entry), "From the page");
    assertEquals(await pageDescription(entry), "From the page");
    assertEquals(asked, [`/api/browse/moddb-item?page=${encodeURIComponent("https://www.moddb.com/mods/a")}`]);
  }));

Deno.test("an archive upload's description comes from its item", () =>
  answering(200, { description: "From the item" }, async (asked) => {
    assertEquals(await pageDescription(upload("archive:some-id", "archive")), "From the item");
    assertEquals(asked, ["/api/browse/item?id=some-id"]);
  }));

Deno.test("a page that has none is told apart from a page that cannot be read", async () => {
  await answering(200, {}, async () => {
    assertEquals(await pageDescription(upload("moddb:none", "moddb", "https://www.moddb.com/mods/none")), "");
  });
  await answering(502, {}, async () => {
    await assertRejects(() => pageDescription(upload("moddb:down", "moddb", "https://www.moddb.com/mods/down")));
  });
});

Deno.test("an update has no page to ask", () =>
  answering(200, { description: "never" }, async (asked) => {
    assertEquals(await pageDescription(upload("update:x", "update")), "");
    assertEquals(asked, []);
  }));
