import { assertEquals } from "@std/assert";
import { decodeIni, iniValue, launchSettings, parseIni, readLauncherSettings, readModSetup } from "./mod.ts";

const fixture = async (name: string) => decodeIni(await Deno.readFile(new URL(`./testdata/${name}`, import.meta.url)));

Deno.test("The Black Soul's real D2SE_SETUP.ini reads as the mod it describes", async () => {
  const setup = readModSetup(parseIni(await fixture("black-soul.D2SE_SETUP.ini")));
  assertEquals(setup.createdFor, "2.2.0");
  assertEquals(setup.intact, true);
  assertEquals(setup.mod.core, "1.10f");
  assertEquals(setup.mod.title, "The Black Soul");
  assertEquals(setup.mod.version, "1.0.0");
  assertEquals(setup.mod.readme, "documentation\\readme.txt");
  assertEquals(setup.player, {
    renderer: "glide",
    rendererCode: 3,
    windowed: true,
    noSound: false,
    hardcore: true,
    plugY: false,
    direct: true,
    txt: true,
    language: "ENG",
  });
  // What D2SE loads on the mod's behalf — the part plain Game.exe would miss.
  assertEquals(setup.loads, {
    nefex: false,
    d2mod: true,
    d2extra: false,
    dlls: [],
    patchD2: true,
    mpqs: ["MortalBorne.mpq"],
  });
  // Every realm field is empty, and `#ModMPQ2=` is a comment, not an empty value.
  assertEquals(setup.realm, null);
  assertEquals(setup.update, null);
});

Deno.test("launch settings apply the modder's permissions to the player's choices", async () => {
  const setup = readModSetup(parseIni(await fixture("black-soul.D2SE_SETUP.ini")));
  assertEquals(launchSettings(setup), {
    renderer: "glide",
    windowed: true,
    noSound: false,
    direct: true,
    txt: true,
    hardcore: true,
    plugY: false,
    language: "ENG",
    skipToBNet: false,
    seed: null,
    startAct: null,
  });

  // Not Modable: the player's -direct/-txt choice is ignored, the forced values win.
  const locked = readModSetup(parseIni(`
[USERSETTINGS]
Direct=1
Txt=1
EnablePlugY=1
EnableHC=1
[Protected]
Modable=0
ModForceTxt=1
ModAllowPlugY=0
ModAllowHC=0
`));
  const settings = launchSettings(locked);
  assertEquals([settings.direct, settings.txt, settings.plugY, settings.hardcore], [false, true, false, false]);

  // Not Modable and nothing said: player choices are ignored and force flags are off unless written.
  const bare = launchSettings(readModSetup(parseIni("[USERSETTINGS]\nDirect=0\n[Protected]\nD2Core=1.10f\n")));
  assertEquals([bare.direct, bare.txt], [false, false]);
  const off = launchSettings(readModSetup(parseIni("[Protected]\nModable=0\nModForceDirect=0\nModForceTxt=0\n")));
  assertEquals([off.direct, off.txt], [false, false]);

  // PlugY turns -direct on, as D2SE does, but not -txt: Synthesis's setup. EnablePlugY defaults on.
  const synthesis = launchSettings(
    readModSetup(parseIni("[USERSETTINGS]\nDirect=1\nTxt=1\n[Protected]\nModable=0\nModAllowPlugY=1\n")),
  );
  assertEquals([synthesis.direct, synthesis.txt, synthesis.plugY], [true, false, true]);
  const plugYOff = launchSettings(
    readModSetup(parseIni("[USERSETTINGS]\nEnablePlugY=0\n[Protected]\nModable=0\nModAllowPlugY=1\n")),
  );
  assertEquals([plugYOff.direct, plugYOff.plugY], [false, false]);
});

Deno.test("an empty setup gets the defaults the file's own comments state", () => {
  const setup = readModSetup(parseIni(""));
  assertEquals(setup.intact, false);
  assertEquals(setup.mod.core, null);
  assertEquals(setup.player.renderer, "glide");
  assertEquals(setup.player.hardcore, true);
  assertEquals(setup.mod.allowHardcore, true);
  assertEquals(setup.loads.patchD2, true);
  assertEquals(setup.player.windowed, false);
});

Deno.test("realm, extra DLLs and update mirrors are read when a mod sets them", () => {
  const setup = readModSetup(parseIni(`
[Protected]
ModDll1=first.dll
ModDll2=second.dll
ModDll4=unreachable.dll
ModMPQ1=a.mpq
ModMPQ3=c.mpq
RealmGateway=realm.example.net
RealmPort=6112
UpdateFile=update.txt
UpdateMirror1=https://mirror.example/one
`));
  assertEquals(setup.loads.dlls, ["first.dll", "second.dll"]);
  assertEquals(setup.loads.mpqs, ["a.mpq", "c.mpq"]);
  assertEquals(setup.realm?.gateway, "realm.example.net");
  assertEquals(setup.realm?.port, "6112");
  assertEquals(setup.update, { file: "update.txt", mirrors: ["https://mirror.example/one"] });
});

Deno.test("the ini reader ignores case, comments and CRLF, and keeps the last of a repeated key", () => {
  const ini = parseIni(
    "[protected]\r\n# comment\r\n; another\r\nd2core=1.09d\r\nD2CORE=1.10f\r\n[END]\r\nendoffile=4711\r\n",
  );
  assertEquals(iniValue(ini, "Protected", "D2Core"), "1.10f");
  assertEquals(ini.intact, true);
});

Deno.test("a byte-order mark added by an editor is not part of the first section name", () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("[D2SE]\nCreatedFor=2.2.0\n")]);
  assertEquals(iniValue(parseIni(decodeIni(bytes)), "D2SE", "CreatedFor"), "2.2.0");
});

Deno.test("D2SE.ini names the mod D2SE last ran", async () => {
  const launcher = readLauncherSettings(parseIni(await fixture("D2SE.ini")));
  assertEquals(launcher.activeFolder, "The Black Soul1");
  assertEquals(launcher.commandLine, null);
  assertEquals(launcher.intact, true);
});
