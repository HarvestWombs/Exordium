import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  catalog,
  coreEntries,
  type CoreEntry,
  CoreInstallError,
  directUrl,
  parseCatalog,
  startCoreInstall,
  writeCatalog,
} from "./cores.ts";

const SHA = "a".repeat(64);

Deno.test("the catalog keeps well-formed entries and drops the rest", () => {
  const parsed = parseCatalog({
    cores: [
      { version: "1.10", core: "1.10f", file: "1.10.zip", size: 10, sha256: SHA.toUpperCase(), url: "https://x/y" },
      { version: "1.10", core: "1.10f", file: "../evil.zip", size: 10, sha256: SHA },
      { version: "1.09", core: "1.09", file: "1.09.zip", size: 0, sha256: SHA },
      { version: "1.08", core: "1.08", file: "1.08.zip", size: 5, sha256: SHA, url: "http://insecure" },
    ],
  });
  assertEquals(parsed.cores, [
    { version: "1.10", core: "1.10f", file: "1.10.zip", size: 10, sha256: SHA, url: "https://x/y" },
    { version: "1.08", core: "1.08", file: "1.08.zip", size: 5, sha256: SHA },
  ]);
});

Deno.test("a Google Drive share link becomes a direct download", () => {
  const direct = "https://drive.usercontent.google.com/download?id=1AbC-d_9&export=download&confirm=t";
  assertEquals(directUrl("https://drive.google.com/file/d/1AbC-d_9/view?usp=sharing"), direct);
  assertEquals(directUrl("https://drive.google.com/open?id=1AbC-d_9"), direct);
  assertEquals(directUrl("https://drive.google.com/uc?export=download&id=1AbC-d_9"), direct);
  assertEquals(directUrl("https://example.com/cores.json"), "https://example.com/cores.json");
});

async function zipOf(dir: string, folder: string, files: Record<string, string>): Promise<string> {
  await Deno.mkdir(`${dir}/${folder}`, { recursive: true });
  for (const [name, text] of Object.entries(files)) await Deno.writeTextFile(`${dir}/${folder}/${name}`, text);
  const zip = `${dir}/${folder}.zip`;
  const tar = Deno.build.os === "windows" ? `${Deno.env.get("SystemRoot") ?? "C:\\Windows"}\\System32\\tar.exe` : "tar";
  const result = await new Deno.Command(tar, { args: ["-a", "-cf", zip, folder], cwd: dir }).output();
  assert(result.success, "tar could not make the test zip");
  await Deno.remove(`${dir}/${folder}`, { recursive: true });
  return zip;
}

Deno.test("writes a catalog in version order", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  try {
    await zipOf(dir, "1.10f", { "Storm.dll": "x" });
    await zipOf(dir, "1.09d", { "Storm.dll": "y" });
    await zipOf(dir, "1.09", { "Storm.dll": "z" });
    const written = await writeCatalog(dir);
    assertEquals(written.cores.map((c) => c.core), ["1.09", "1.09d", "1.10f"]);
    assertEquals(JSON.parse(await Deno.readTextFile(`${dir}/cores.json`)), written);

    // A link added by hand (Drive) survives writing the catalog again.
    written.cores[0]!.url = "https://drive.google.com/file/d/abc/view";
    await Deno.writeTextFile(`${dir}/cores.json`, JSON.stringify(written));
    assertEquals((await writeCatalog(dir)).cores[0]!.url, "https://drive.google.com/file/d/abc/view");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("installs a core into the library from the catalog, and never over one", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  const host = `${dir}/host`;
  const root = `${dir}/Diablo II`;
  await Deno.mkdir(host);
  await Deno.mkdir(`${root}/cores/1.13c`, { recursive: true });
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async (request) => {
    const name = new URL(request.url).pathname.slice(1);
    const bytes = await Deno.readFile(`${host}/${name}`).catch(() => null);
    return bytes ? new Response(bytes) : new Response("missing", { status: 404 });
  });
  const previous = Deno.env.get("EXORDIUM_CORES_URL");
  try {
    await zipOf(host, "1.10f", { "D2Game.dll": "game", "Storm.dll": "storm" });
    await zipOf(host, "1.13c", { "D2Game.dll": "game" });
    await zipOf(host, "1.14d", { "Game.exe": "exe" });
    await writeCatalog(host);
    Deno.env.set("EXORDIUM_CORES_URL", `http://127.0.0.1:${server.addr.port}/cores.json`);
    const list = (await catalog(true))!;

    const before = await coreEntries(root, list, null);
    const status = (entries: CoreEntry[]) => Object.fromEntries(entries.map((e) => [e.core, e.status]));
    // 1.14d is a single-exe core: left out of the tab, so it is not in the entries at all.
    assertEquals(status(before), { "1.10f": "available", "1.13c": "installed" });

    await startCoreInstall(root, "1.10f", `${dir}/downloads`);
    for (let i = 0; i < 100; i++) {
      const job = (await coreEntries(root, list, null)).find((e) => e.core === "1.10f")!.job!;
      if (job.state === "installed" || job.state === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const after = (await coreEntries(root, list, null)).find((e) => e.core === "1.10f")!;
    assertEquals(after.job?.error, undefined);
    assertEquals(after.status, "installed");
    assertEquals(await Deno.readTextFile(`${root}/cores/1.10f/Storm.dll`), "storm");

    await assertRejects(() => startCoreInstall(root, "1.13c", `${dir}/downloads`), CoreInstallError, "already");
    await assertRejects(() => startCoreInstall(root, "1.14d", `${dir}/downloads`), CoreInstallError, "install itself");
  } finally {
    if (previous === undefined) Deno.env.delete("EXORDIUM_CORES_URL");
    else Deno.env.set("EXORDIUM_CORES_URL", previous);
    await server.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a download that does not match its checksum installs nothing", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  const host = `${dir}/host`;
  const root = `${dir}/Diablo II`;
  await Deno.mkdir(host);
  await Deno.mkdir(`${root}/cores`, { recursive: true });
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async (request) => {
    const name = new URL(request.url).pathname.slice(1);
    if (name === "1.07.zip") return new Response("<html>Google Drive can't scan this file</html>".padEnd(300, " "));
    return new Response(await Deno.readFile(`${host}/${name}`));
  });
  const previous = Deno.env.get("EXORDIUM_CORES_URL");
  try {
    await zipOf(host, "1.07", { "D2Game.dll": "game" });
    await writeCatalog(host);
    Deno.env.set("EXORDIUM_CORES_URL", `http://127.0.0.1:${server.addr.port}/cores.json`);
    const list = (await catalog(true))!;
    await startCoreInstall(root, "1.07", `${dir}/downloads`);
    let entry = (await coreEntries(root, list, null))[0]!;
    for (let i = 0; i < 100 && entry.job?.state !== "failed" && entry.job?.state !== "installed"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      entry = (await coreEntries(root, list, null))[0]!;
    }
    assertEquals(entry.job?.state, "failed");
    assertEquals(entry.status, "available");
  } finally {
    if (previous === undefined) Deno.env.delete("EXORDIUM_CORES_URL");
    else Deno.env.set("EXORDIUM_CORES_URL", previous);
    await server.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});
