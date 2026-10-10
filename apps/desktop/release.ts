/**
 * Makes a release of the packaged app for the updater (updater.ts), and optionally publishes it.
 *
 *   deno task desktop                 package Exordium/ first
 *   deno task release                 write release/Exordium-<version>-win-x64.zip
 *   deno task release --publish       ...and create the GitHub release v<version> with it (gh CLI)
 *   deno task release --keygen        once: make the signing key (see below)
 *
 * The version is this folder's deno.json `version`: bump it before releasing. The zip holds only the
 * app's own files (APP_FILES), never what a run leaves beside them (exordium.json, boxes, logs...),
 * plus exordium-files.json listing each with its size and SHA-256, and exordium-files.json.sig, its
 * Ed25519 signature. Release notes come from release-notes.md beside this file when it exists, else
 * GitHub writes them from the commits.
 *
 * The signing key is a private JWK outside the repository: `EXORDIUM_SIGNING_KEY` names the file,
 * else `%USERPROFILE%\.exordium\release-signing-key.jwk`. `--keygen` writes it and prints the public
 * half, which goes into RELEASE_PUBLIC_KEYS (updater.ts). Lose the key and installed copies can no
 * longer be updated: keep a backup of it somewhere safe and offline.
 */

import {
  APP_VERSION,
  FILE_LIST,
  type FileList,
  RELEASE_PUBLIC_KEYS,
  sha256Hex,
  SIGNATURE_FILE,
  UPDATE_REPO,
  verifySignature,
} from "./updater.ts";

/** What packaging makes (package-app.ts): files at the top, and whole folders. */
const APP_FILES = ["Exordium.exe", "Exordium.dll", ".downloaded", ".deno-desktop-app"];
const APP_FOLDERS = ["native", "bin"];

const here = (import.meta.dirname ?? Deno.cwd()).replace(/\\/g, "/");
const app = `${here}/Exordium`;
const out = `${here}/release`;
const keyFile = (Deno.env.get("EXORDIUM_SIGNING_KEY") ??
  `${Deno.env.get("USERPROFILE") ?? Deno.env.get("HOME") ?? "."}/.exordium/release-signing-key.jwk`).replace(
    /\\/g,
    "/",
  );

if (Deno.args.includes("--keygen")) {
  if (await Deno.stat(keyFile).then(() => true, () => false)) {
    console.error(`${keyFile} already exists; not replacing a signing key.`);
    Deno.exit(1);
  }
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  await Deno.mkdir(keyFile.replace(/\/[^/]+$/, ""), { recursive: true });
  await Deno.writeTextFile(keyFile, JSON.stringify(jwk, null, 2) + "\n", { createNew: true });
  console.log(`Wrote the private signing key to ${keyFile}. Back it up offline; never commit it.`);
  console.log(`Public key, for RELEASE_PUBLIC_KEYS in updater.ts:\n  "${jwk.x}"`);
  Deno.exit(0);
}

/** The signing key, checked to be one this app's builds accept, so a release is never unverifiable. */
async function signingKey(): Promise<CryptoKey> {
  const text = await Deno.readTextFile(keyFile).catch(() => null);
  if (!text) {
    console.error(
      `No signing key at ${keyFile}. Make one with "deno task release --keygen", or set EXORDIUM_SIGNING_KEY.`,
    );
    Deno.exit(1);
  }
  const jwk = JSON.parse(text) as JsonWebKey;
  if (!jwk.x || !RELEASE_PUBLIC_KEYS.includes(jwk.x)) {
    console.error(
      `The key in ${keyFile} is not in RELEASE_PUBLIC_KEYS (updater.ts): installed copies would refuse it.`,
    );
    Deno.exit(1);
  }
  return await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
}

const key = await signingKey();

async function filesIn(folder: string, prefix: string): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of Deno.readDir(`${folder}/${prefix}`)) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory) found.push(...await filesIn(folder, path));
    else if (entry.isFile && !entry.name.endsWith(".exordium-old")) found.push(path);
  }
  return found;
}

const paths: string[] = [];
for (const name of APP_FILES) {
  if (await Deno.stat(`${app}/${name}`).then((s) => s.isFile, () => false)) paths.push(name);
  else if (name.endsWith(".exe") || name.endsWith(".dll")) {
    console.error(`No ${app}/${name}: run "deno task desktop" first.`);
    Deno.exit(1);
  }
}
for (const folder of APP_FOLDERS) {
  if (await Deno.stat(`${app}/${folder}`).then((s) => s.isDirectory, () => false)) {
    paths.push(...await filesIn(app, folder));
  }
}

const stage = `${out}/Exordium-${APP_VERSION}`;
await Deno.remove(stage, { recursive: true }).catch(() => {});
const list: FileList = { version: APP_VERSION, files: [] };
for (const path of paths.sort()) {
  const bytes = await Deno.readFile(`${app}/${path}`);
  list.files.push({ path, size: bytes.length, sha256: await sha256Hex(bytes) });
  await Deno.mkdir(`${stage}/${path}`.replace(/\/[^/]+$/, ""), { recursive: true });
  await Deno.writeFile(`${stage}/${path}`, bytes);
}
const listBytes = new TextEncoder().encode(JSON.stringify(list, null, 2) + "\n");
await Deno.writeFile(`${stage}/${FILE_LIST}`, listBytes);
const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, listBytes));
const signatureText = btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(
  /=+$/,
  "",
);
if (!(await verifySignature(listBytes, signatureText, RELEASE_PUBLIC_KEYS))) {
  console.error("The signature does not verify against RELEASE_PUBLIC_KEYS; nothing was written.");
  Deno.exit(1);
}
await Deno.writeTextFile(`${stage}/${SIGNATURE_FILE}`, signatureText + "\n");

const zip = `${out}/Exordium-${APP_VERSION}-win-x64.zip`;
await Deno.remove(zip).catch(() => {});
const tar = `${Deno.env.get("SystemRoot") ?? "C:\\Windows"}\\System32\\tar.exe`;
const top = (await Array.fromAsync(Deno.readDir(stage))).map((entry) => entry.name);
const packed = await new Deno.Command(tar, { args: ["-a", "-cf", zip, ...top], cwd: stage }).output();
if (!packed.success) {
  console.error(new TextDecoder().decode(packed.stderr));
  Deno.exit(1);
}
await Deno.remove(stage, { recursive: true });
const size = (await Deno.stat(zip)).size;
console.log(`Wrote ${zip}: ${list.files.length} files, ${(size / 1024 / 1024).toFixed(1)} MB.`);

if (Deno.args.includes("--publish")) {
  const repo = Deno.env.get("EXORDIUM_UPDATE_REPO") ?? UPDATE_REPO;
  const notes = `${here}/release-notes.md`;
  const hasNotes = await Deno.stat(notes).then((s) => s.isFile, () => false);
  const args = [
    "release",
    "create",
    `v${APP_VERSION}`,
    zip,
    "--repo",
    repo,
    "--title",
    `Exordium ${APP_VERSION}`,
    ...(hasNotes ? ["--notes-file", notes] : ["--generate-notes"]),
    ...(/-/.test(APP_VERSION) ? ["--prerelease"] : []),
  ];
  const result = await new Deno.Command("gh", { args, stdout: "inherit", stderr: "inherit" }).output();
  if (!result.success) Deno.exit(result.code);
} else {
  console.log(`Publish with:  deno task release --publish   (gh release create v${APP_VERSION} on ${UPDATE_REPO})`);
}
