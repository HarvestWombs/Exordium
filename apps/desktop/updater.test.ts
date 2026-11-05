import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  compareVersions,
  FILE_LIST,
  type FileList,
  newestFeedTag,
  pickRelease,
  type Release,
  releaseNotes,
  sha256Hex,
  SIGNATURE_FILE,
  sweepUpdate,
  UpdateError,
  Updater,
  verifySignature,
} from "./updater.ts";

/** A release key made for these tests; `keys` is what an app built with it would accept. */
const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
const keys = [(await crypto.subtle.exportKey("jwk", pair.publicKey)).x!];
const stranger = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;

async function signed(bytes: Uint8Array<ArrayBuffer>, key: CryptoKey): Promise<string> {
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, bytes));
  return btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.test("a signature verifies only for the key that made it and the bytes it signed", async () => {
  const data = new TextEncoder().encode("file list");
  const signature = await signed(data, pair.privateKey);
  assert(await verifySignature(data, signature, keys));
  assert(!(await verifySignature(new TextEncoder().encode("file lisT"), signature, keys)));
  assert(!(await verifySignature(data, await signed(data, stranger.privateKey), keys)));
  assert(!(await verifySignature(data, "not base64!", keys)));
});

Deno.test("versions compare as semver, pre-releases before their release", () => {
  assert(compareVersions("0.2.0", "0.1.9") > 0);
  assert(compareVersions("v1.0.0", "1.0.0") === 0);
  assert(compareVersions("1.0.0-beta.2", "1.0.0-beta.10") < 0);
  assert(compareVersions("1.0.0-beta", "1.0.0") < 0);
  assert(compareVersions("1.0.0-alpha", "1.0.0-beta") < 0);
  assert(compareVersions("1.10.0", "1.9.0") > 0);
});

function release(tag: string, extra: Partial<Release> = {}): Release {
  return {
    tag_name: tag,
    name: null,
    body: "notes",
    draft: false,
    prerelease: false,
    published_at: "2026-10-10T00:00:00Z",
    html_url: `https://github.com/x/y/releases/${tag}`,
    assets: [{
      name: `Exordium-${tag.slice(1)}-win-x64.zip`,
      size: 10,
      url: "https://api/asset",
      browser_download_url: "https://dl/asset",
      digest: `sha256:${"a".repeat(64)}`,
    }],
    ...extra,
  };
}

Deno.test("the newest newer release with the app's zip is picked; pre-releases only when asked", () => {
  const releases = [
    release("v0.3.0-beta.1", { prerelease: true }),
    release("v0.2.0"),
    release("v0.2.5", { draft: true }),
    release("v0.2.1", { assets: [] }),
    release("v0.1.0"),
  ];
  assertEquals(pickRelease(releases, "0.1.0", false)?.version, "0.2.0");
  assertEquals(pickRelease(releases, "0.1.0", true)?.version, "0.3.0-beta.1");
  assertEquals(pickRelease(releases, "0.2.0", false), null);
  assertEquals(pickRelease(releases, "0.1.0", false)?.asset.sha256, "a".repeat(64));
});

async function zipOf(
  dir: string,
  files: Record<string, string>,
  version: string,
  signer: CryptoKey | null = pair.privateKey,
): Promise<Uint8Array> {
  const stage = `${dir}/stage`;
  const list: FileList = { version, files: [] };
  for (const [path, text] of Object.entries(files)) {
    const bytes = new TextEncoder().encode(text);
    await Deno.mkdir(`${stage}/${path}`.replace(/\/[^/]+$/, ""), { recursive: true });
    await Deno.writeFile(`${stage}/${path}`, bytes);
    list.files.push({ path, size: bytes.length, sha256: await sha256Hex(bytes) });
  }
  const listBytes = new TextEncoder().encode(JSON.stringify(list));
  await Deno.writeFile(`${stage}/${FILE_LIST}`, listBytes);
  if (signer) await Deno.writeTextFile(`${stage}/${SIGNATURE_FILE}`, await signed(listBytes, signer));
  const tar = Deno.build.os === "windows" ? `${Deno.env.get("SystemRoot") ?? "C:\\Windows"}\\System32\\tar.exe` : "tar";
  const top = (await Array.fromAsync(Deno.readDir(stage))).map((e) => e.name);
  const result = await new Deno.Command(tar, { args: ["-a", "-cf", `${dir}/out.zip`, ...top], cwd: stage }).output();
  assert(result.success, "tar could not make the test zip");
  await Deno.remove(stage, { recursive: true });
  return await Deno.readFile(`${dir}/out.zip`);
}

function fakeGitHub(zip: Uint8Array, digest: string, version: string) {
  const server: Deno.HttpServer<Deno.NetAddr> = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, (
    request,
  ): Response => {
    const path = new URL(request.url).pathname;
    const base: string = `http://127.0.0.1:${server.addr.port}`;
    if (path === "/repos/me/app/releases") {
      return Response.json([{
        ...release(`v${version}`),
        assets: [{
          name: `Exordium-${version}-win-x64.zip`,
          size: zip.length,
          url: `${base}/api-asset`,
          browser_download_url: `${base}/asset.zip`,
          digest: `sha256:${digest}`,
        }],
      }]);
    }
    if (path === "/asset.zip") return new Response(zip.slice());
    return new Response("missing", { status: 404 });
  });
  return server;
}

Deno.test("an update downloads, is checked, swaps the app's files and leaves everything else", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  const app = `${dir}/app`;
  await Deno.mkdir(`${app}/native`, { recursive: true });
  await Deno.writeTextFile(`${app}/Exordium.exe`, "old exe");
  await Deno.writeTextFile(`${app}/native/gone.dll`, "removed in the new version");
  await Deno.writeTextFile(`${app}/exordium.json`, "player state");
  const oldList: FileList = {
    version: "0.1.0",
    files: [{ path: "Exordium.exe", size: 7, sha256: "0".repeat(64) }, {
      path: "native/gone.dll",
      size: 1,
      sha256: "0".repeat(64),
    }],
  };
  await Deno.writeTextFile(`${app}/${FILE_LIST}`, JSON.stringify(oldList));

  const zip = await zipOf(dir, { "Exordium.exe": "new exe", "native/window.dll": "new dll" }, "0.2.0");
  const server = fakeGitHub(zip, await sha256Hex(zip as Uint8Array<ArrayBuffer>), "0.2.0");
  try {
    const updater = new Updater({
      appDir: app,
      repo: "me/app",
      api: `http://127.0.0.1:${server.addr.port}`,
      publicKeys: keys,
    });
    updater.setCurrent("0.1.0");
    assertEquals((await updater.check(false)).phase, "available");
    const ready = await updater.download();
    assertEquals(ready.error, null);
    assertEquals(ready.phase, "ready");

    assertEquals(await updater.apply(), "0.2.0");
    assertEquals(await Deno.readTextFile(`${app}/Exordium.exe`), "new exe");
    assertEquals(await Deno.readTextFile(`${app}/native/window.dll`), "new dll");
    assertEquals(await Deno.readTextFile(`${app}/exordium.json`), "player state");
    assertEquals(await Deno.readTextFile(`${app}/Exordium.exe.exordium-old`), "old exe");
    assertEquals((JSON.parse(await Deno.readTextFile(`${app}/${FILE_LIST}`)) as FileList).version, "0.2.0");
    assert(!(await Deno.stat(`${app}/native/gone.dll`).then(() => true, () => false)));

    assertEquals(await sweepUpdate(app), 2);
    assert(!(await Deno.stat(`${app}/Exordium.exe.exordium-old`).then(() => true, () => false)));
    assertEquals(await Deno.readTextFile(`${app}/exordium.json`), "player state");
  } finally {
    await server.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a download that does not match GitHub's checksum is never applied", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  const app = `${dir}/app`;
  await Deno.mkdir(app, { recursive: true });
  await Deno.writeTextFile(`${app}/Exordium.exe`, "old exe");
  const zip = await zipOf(dir, { "Exordium.exe": "new exe" }, "0.2.0");
  const server = fakeGitHub(zip, "b".repeat(64), "0.2.0");
  try {
    const updater = new Updater({
      appDir: app,
      repo: "me/app",
      api: `http://127.0.0.1:${server.addr.port}`,
      publicKeys: keys,
    });
    updater.setCurrent("0.1.0");
    await updater.check(false);
    const failed = await updater.download();
    assertEquals(failed.phase, "failed");
    assert(failed.error?.includes("checksum"));
    await assertRejects(() => updater.apply(), UpdateError, "No update is ready");
    assertEquals(await Deno.readTextFile(`${app}/Exordium.exe`), "old exe");
  } finally {
    await server.shutdown();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("no releases yet is a quiet failure, not a crash", async () => {
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, () => new Response("", { status: 404 }));
  try {
    const updater = new Updater({
      appDir: "C:/nowhere",
      repo: "me/app",
      api: `http://127.0.0.1:${server.addr.port}`,
      publicKeys: keys,
    });
    const state = await updater.check(false);
    assertEquals(state.phase, "failed");
    assert(state.error?.includes("me/app"));
  } finally {
    await server.shutdown();
  }
});

for (
  const [name, signer, message] of [
    ["an unsigned update", null, "not signed"],
    ["an update signed with another key", stranger.privateKey, "signature is not"],
  ] as const
) {
  Deno.test(`${name} is refused before anything is replaced`, async () => {
    const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
    const app = `${dir}/app`;
    await Deno.mkdir(app, { recursive: true });
    await Deno.writeTextFile(`${app}/Exordium.exe`, "old exe");
    const zip = await zipOf(dir, { "Exordium.exe": "new exe" }, "0.2.0", signer);
    const server = fakeGitHub(zip, await sha256Hex(zip as Uint8Array<ArrayBuffer>), "0.2.0");
    try {
      const updater = new Updater({
        appDir: app,
        repo: "me/app",
        api: `http://127.0.0.1:${server.addr.port}`,
        publicKeys: keys,
      });
      updater.setCurrent("0.1.0");
      await updater.check(false);
      const failed = await updater.download();
      assertEquals(failed.phase, "failed");
      assert(failed.error?.includes(message), failed.error ?? "");
      assertEquals(await Deno.readTextFile(`${app}/Exordium.exe`), "old exe");
    } finally {
      await server.shutdown();
      await Deno.remove(dir, { recursive: true });
    }
  });
}

Deno.test("patch notes keep the newest releases, the installed one always, drafts never", () => {
  const list = [
    release("v0.2.1", { body: "two one" }),
    release("v0.3.0-beta.1", { prerelease: true }),
    release("v0.2.3", { name: "Exordium 0.2.3", body: "## Fixes\n- window" }),
    release("v0.2.4", { draft: true }),
    release("v0.2.2"),
  ];
  assertEquals(releaseNotes(list, "0.2.2", false).map((r) => r.version), ["0.2.3", "0.2.2", "0.2.1"]);
  assertEquals(releaseNotes(list, "0.2.2", true).map((r) => r.version), ["0.3.0-beta.1", "0.2.3", "0.2.2", "0.2.1"]);
  // Running a pre-release: its own notes stay, though pre-releases are not offered.
  assertEquals(releaseNotes(list, "0.3.0-beta.1", false)[0]?.version, "0.3.0-beta.1");
  const newest = releaseNotes(list, "0.2.2", false)[0]!;
  assertEquals([newest.name, newest.notes], ["Exordium 0.2.3", "## Fixes\n- window"]);
  assertEquals(releaseNotes([release("v0.2.1", { name: null })], "0.2.1", false)[0]?.name, "Exordium 0.2.1");
});

Deno.test("the releases feed names its newest version tag", () => {
  const atom = `<feed>
    <entry><link rel="alternate" type="text/html" href="https://github.com/x/y/releases/tag/v0.2.2"/></entry>
    <entry><link rel="alternate" type="text/html" href="https://github.com/x/y/releases/tag/v0.2.10"/></entry>
    <entry><link rel="alternate" type="text/html" href="https://github.com/x/y/releases/tag/nightly"/></entry>
  </feed>`;
  assertEquals(newestFeedTag(atom), "0.2.10");
  assertEquals(newestFeedTag("<feed></feed>"), null);
});
