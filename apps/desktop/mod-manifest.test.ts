import { assertEquals } from "@std/assert";
import { parseIni, readModSetup } from "@exordium/d2se";
import { exordiumManifestFromD2SE } from "./mod-manifest.ts";

Deno.test("D2SE setup becomes an editable Exordium manifest with resolved launch settings", () => {
  const setup = readModSetup(parseIni(`
[USERSETTINGS]
Renderer=3
WindowMode=1
EnablePlugY=1
Direct=0
Txt=1
Language=ENG

[Protected]
D2Core=1.10f
ModName=Short Name
ModTitle=Long Title
ModMajorVersion=1
ModMinorVersion=.2
ModRevision=.3
ModDescription=A D2SE mod.
ModReadme=readme.txt
ModHP=https://example.test
ModBoard=https://forum.example.test
ModUseD2Mod=1
ModMPQ1=one.mpq
ModDll1=Plugin.dll
ModAllowPlugY=1
Modable=1
RealmGateway=realm.example.test
UpdateFile=updates.ini
UpdateMirror1=https://mirror.example.test
[END]
endoffile=4711
`));

  const manifest = exordiumManifestFromD2SE(setup);

  assertEquals(manifest.title, "Long Title");
  assertEquals(manifest.core, "1.10f");
  assertEquals(manifest.version, "1.2.3");
  assertEquals(manifest.launch, {
    renderer: "glide",
    windowed: true,
    noSound: false,
    hardcore: true,
    plugY: true,
    direct: true,
    txt: true,
    language: "ENG",
    skipToBNet: false,
    seed: null,
    startAct: null,
  });
  assertEquals(manifest.loads, {
    nefex: false,
    d2mod: true,
    d2extra: false,
    dlls: ["Plugin.dll"],
    mpqs: ["one.mpq"],
  });
  assertEquals(manifest.update, {
    endpoint: null,
    manifest: null,
    channel: "stable",
    automatic: false,
    background: true,
  });
  assertEquals(manifest.art, { banner: null, icon: null, portrait: null });
  assertEquals(manifest.links, [
    { label: "Homepage", url: "https://example.test" },
    { label: "Forum", url: "https://forum.example.test" },
  ]);
  assertEquals(manifest.realm, {
    gateway: "realm.example.test",
    timezone: null,
    gatewayName: null,
    selected: null,
    port: null,
  });
  // D2SE's own update file and mirrors are not carried over: Exordium reads only its own feed.
  assertEquals("d2seUpdate" in manifest, false);
});
