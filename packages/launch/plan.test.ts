import { assertEquals } from "@std/assert";
import { parseIni, readModSetup } from "@exordium/d2se";
import { resolve } from "@exordium/layers";
import type { FileLayer } from "@exordium/layers";
import { buildLoaderPlan, gameCommandLine, gameVersion } from "./mod.ts";

const H = "0".repeat(64);

function layer(id: string, role: FileLayer["role"], paths: string[]): FileLayer {
  return { id, role, entries: paths.map((path) => ({ path, hash: H, size: 1 })) };
}

function setup(text: string) {
  return readModSetup(parseIni(text));
}

Deno.test("mod MPQs stack in order, and the language MPQ sits above them all", () => {
  const plan = resolve({
    files: [
      layer("game", "game", [
        "d2data.mpq",
        "d2sfx.mpq",
        "d2speech.mpq",
        "d2char.mpq",
        "d2music.mpq",
        "d2video.mpq",
        "d2exp.mpq",
        "d2Xmusic.mpq",
        "d2Xtalk.mpq",
        "d2Xvideo.mpq",
      ]),
      layer("core", "core", ["D2Launch.dll", "D2Client.dll", "D2Multi.dll", "patch_d2.mpq", "ENG.mpq"]),
      layer("mod", "mod", ["one.mpq", "two.mpq", "three.mpq", "four.mpq", "five.mpq"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(
    plan,
    setup(`
[USERSETTINGS]
Language=ENG
[Protected]
D2Core=1.10f
ModUsePatch_D2=1
ModMPQ1=one.mpq
ModMPQ2=two.mpq
ModMPQ3=three.mpq
ModMPQ4=four.mpq
ModMPQ5=five.mpq
`),
  );

  assertEquals(load.archives.map((archive) => [archive.path, archive.priority]), [
    ["d2data.mpq", 1000],
    ["d2sfx.mpq", 1000],
    ["d2speech.mpq", 1000],
    ["d2char.mpq", 1000],
    ["d2music.mpq", 1000],
    ["d2video.mpq", 1000],
    ["d2exp.mpq", 3000],
    ["d2Xmusic.mpq", 3000],
    ["d2Xtalk.mpq", 3000],
    ["d2Xvideo.mpq", 3000],
    ["patch_d2.mpq", 5000],
    ["one.mpq", 6000],
    ["two.mpq", 7000],
    ["three.mpq", 8000],
    // No limit of three: each further MPQ sits above the last.
    ["four.mpq", 9000],
    ["five.mpq", 10000],
    // The language MPQ above them all.
    ["ENG.mpq", 11000],
  ]);
  assertEquals(load.problems, []);
});

Deno.test("Language=MOD suppresses the language MPQ overlay", () => {
  const plan = resolve({
    files: [
      layer("game", "game", ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"]),
      layer("core", "core", ["D2Launch.dll", "D2Client.dll", "D2Multi.dll", "patch_d2.mpq"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(plan, setup("[USERSETTINGS]\nLanguage=MOD\n[Protected]\n"), { expansion: false });
  assertEquals(load.archives.some((archive) => archive.kind === "language"), false);
  assertEquals(load.problems.filter((problem) => problem.level === "error"), []);
});

Deno.test("plugins and launch flags come from D2SE setup permissions", () => {
  const plan = resolve({
    files: [
      layer("game", "game", ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"]),
      layer("core", "core", ["D2Launch.dll", "D2Client.dll", "D2Multi.dll", "patch_d2.mpq", "PlugY.dll"]),
      layer("mod", "mod", ["D2Mod.dll", "Extra.dll", "D2SE_Utility.dll", "ModSystem.dll"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(
    plan,
    setup(`
[USERSETTINGS]
EnablePlugY=1
Direct=1
Txt=1
[Protected]
D2Core=1.10f
Modable=0
ModForceTxt=1
ModAllowPlugY=1
ModUseD2Mod=1
ModDll1=Extra.dll
ModUseD2SEUtility=1
ModUseD2SE=1
D2SEDllName=ModSystem.dll
`),
    { expansion: false },
  );

  // Not Modable, no ModForceDirect, but PlugY is on: D2SE turns -direct on for PlugY.
  assertEquals(load.settings.direct, true);
  assertEquals(load.settings.txt, true);
  assertEquals(load.settings.plugY, true);
  assertEquals(load.plugins.map((plugin) => [plugin.kind, plugin.path, plugin.init, plugin.release]), [
    ["plugy", "PlugY.dll", "_Init@4", "_Release@0"],
    ["d2mod", "D2Mod.dll", 10000, 10001],
    ["custom", "Extra.dll", null, null],
  ]);
  // D2SE's own plugin systems (ModUseD2SEUtility, ModUseD2SE) are not loaded, even when the mod ships them.
  assertEquals(load.problems, []);
});

Deno.test("custom plugin DLLs are not limited to D2SE's first three slots", () => {
  const plan = resolve({
    files: [
      layer("game", "game", ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"]),
      layer("core", "core", ["D2Launch.dll", "D2Client.dll", "D2Multi.dll", "patch_d2.mpq"]),
      layer("mod", "mod", ["One.dll", "Two.dll", "Three.dll", "Four.dll"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(
    plan,
    setup(`
[Protected]
D2Core=1.10f
ModDll1=One.dll
ModDll2=Two.dll
ModDll3=Three.dll
ModDll4=Four.dll
`),
    { expansion: false },
  );

  assertEquals(load.plugins.map((plugin) => [plugin.kind, plugin.path]), [
    ["custom", "One.dll"],
    ["custom", "Two.dll"],
    ["custom", "Three.dll"],
    ["custom", "Four.dll"],
  ]);
  assertEquals(load.problems, []);
});

Deno.test("missing required loader inputs are reported before native launch", () => {
  const plan = resolve({
    files: [
      layer("game", "game", ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"]),
      layer("core", "core", ["D2Launch.dll", "D2Client.dll"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(
    plan,
    setup("[USERSETTINGS]\nLanguage=ENG\n[Protected]\nD2Core=1.10f\nModMPQ1=missing.mpq\n"),
    {
      expansion: false,
    },
  );

  assertEquals(load.problems.map((problem) => problem.message), [
    "patch archive load needs patch_d2.mpq, which is not in the box.",
    "mod archive load needs missing.mpq, which is not in the box.",
    "language archive load needs ENG.mpq, which is not in the box.",
    "game DLL handoff needs D2Multi.dll, which is not in the box.",
  ]);
});

Deno.test("the core names the version Game.exe gives Fog's error manager", () => {
  assertEquals(gameVersion("1.10f"), "v1.10");
  assertEquals(gameVersion("1.13c"), "v1.13");
  assertEquals(gameVersion("1.09d"), "v1.09");
  assertEquals(gameVersion(null), null);
  assertEquals(gameVersion("Debug Logs"), null);
});

Deno.test("a core whose Game.exe version is unknown is warned about, not guessed", () => {
  const plan = resolve({ files: [], registry: [] });
  const load = buildLoaderPlan(plan, setup("[Protected]\nD2Core=1.99\n"));
  assertEquals(load.gameExeVersion, null);
  assertEquals(load.problems.filter((problem) => problem.level === "warning").length, 1);
});

Deno.test("the command line names the renderer, and -w only means a DirectDraw window", () => {
  const line = (text: string) =>
    gameCommandLine(buildLoaderPlan(resolve({ files: [], registry: [] }), setup(text)).settings);
  // The Black Soul: Glide in a window. The wrapper owns the window; D2GL refuses -w outright.
  assertEquals(
    line("[USERSETTINGS]\nRenderer=3\nWindowMode=1\nDirect=1\nTxt=1\n[Protected]\nD2Core=1.10f\nModable=1\n"),
    "-3dfx -direct -txt",
  );
  assertEquals(line("[USERSETTINGS]\nRenderer=0\nWindowMode=1\n[Protected]\nD2Core=1.10f\nModable=1\n"), "-w");
  assertEquals(
    line("[USERSETTINGS]\nRenderer=1\nWindowMode=1\nNoSound=1\n[Protected]\nD2Core=1.10f\nModable=1\n"),
    "-d3d -ns",
  );
  assertEquals(line("[USERSETTINGS]\nRenderer=3\nWindowMode=1\n[Protected]\nD2Core=1.10f\n"), "-3dfx");
});

Deno.test("optional game command switches are appended after the core launch flags", () => {
  const command = gameCommandLine({
    renderer: "ddraw",
    windowed: true,
    noSound: true,
    direct: true,
    txt: false,
    hardcore: true,
    plugY: false,
    language: null,
    skipToBNet: true,
    seed: "123456",
    startAct: 5,
  });
  assertEquals(command, "-w -ns -direct -skiptobnet -act5 -seed 123456");
});

Deno.test("PlugY is whichever layer has it, at the root or in a PlugY folder; none starts without it", () => {
  const text = "[USERSETTINGS]\nEnablePlugY=1\n[Protected]\nD2Core=1.10f\nModAllowPlugY=1\n";
  const load = (layers: [string, string[]][]) =>
    buildLoaderPlan(
      resolve({ files: layers.map(([id, paths]) => layer(id, id === "mod" ? "mod" : "core", paths)), registry: [] }),
      setup(text),
    );
  const plugy = (layers: [string, string[]][]) => load(layers).plugins.find((p) => p.kind === "plugy")?.path;
  assertEquals(plugy([["mod", ["PlugY/PlugY.dll", "PlugY/EmptyPage.dc6"]]]), "PlugY/PlugY.dll");
  assertEquals(plugy([["mod", ["PlugY.dll", "PlugY/PlugY.dll"]]]), "PlugY.dll");
  // One the player put in the core's folder, or the PlugY folder from Settings.
  assertEquals(plugy([["core", ["PlugY.dll"]], ["mod", []]]), "PlugY.dll");
  assertEquals(plugy([["plugy", ["PlugY.dll", "PlugY/EmptyPage.dc6"]], ["mod", []]]), "PlugY.dll");
  assertEquals(plugy([["mod", []]]), undefined);
  const missing = load([["mod", []]]).problems.find((p) =>
    p.message.startsWith("PlugY is turned on, but no PlugY.dll")
  );
  assertEquals(missing?.level, "warning");
});

Deno.test("a 1.14 core runs Blizzard's Game.exe: no DLL handoff, and no plugins built for the old DLLs", () => {
  const plan = resolve({
    files: [
      layer("game", "game", ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"]),
      layer("core", "core", ["Game.exe", "patch_d2.mpq"]),
      layer("mod", "mod", ["one.mpq", "D2Mod.dll"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(
    plan,
    setup("[USERSETTINGS]\n[Protected]\nD2Core=1.14d\nModMPQ1=one.mpq\nModUseD2Mod=1\n"),
    { expansion: false },
  );
  assertEquals(load.singleExe, true);
  assertEquals(load.gameDlls, []);
  assertEquals(load.gameExeVersion, [1, 14, 3, 71]);
  assertEquals(load.archives.find((archive) => archive.kind === "mod")?.path, "one.mpq");
  assertEquals(load.problems.map((problem) => problem.message), [
    "D2Mod is built for the pre-1.14 game DLLs; core 1.14d has none for it to load into.",
    "Custom mod and language MPQs are not supported yet on core 1.14d; it runs through Blizzard's single Game.exe.",
  ]);
});

Deno.test("a 1.00 core runs through the Exordium loader", () => {
  const plan = resolve({
    files: [
      layer("game", "game", ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"]),
      layer("core", "core", ["Game.exe", "D2Launch.dll", "D2Client.dll", "D2Multi.dll", "patch_d2.mpq"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(plan, setup("[USERSETTINGS]\n[Protected]\nD2Core=1.00\n"), { expansion: false });
  assertEquals(load.singleExe, false);
  assertEquals(load.nativeGameExe, false);
  assertEquals(load.gameDlls, ["D2Launch.dll", "D2Client.dll", "D2Multi.dll"]);
  assertEquals(load.gameExeVersion, [1, 0, 0, 1]);
  assertEquals(load.problems, []);
});

Deno.test("early cores use the loader for custom MPQs and plugins", () => {
  const plan = resolve({
    files: [
      layer("game", "game", ["d2data.mpq", "d2sfx.mpq", "d2speech.mpq", "d2char.mpq", "d2music.mpq", "d2video.mpq"]),
      layer("core", "core", ["Game.exe", "D2Launch.dll", "D2Client.dll", "D2Multi.dll", "patch_d2.mpq", "D2Mod.dll"]),
      layer("mod", "mod", ["mod.mpq"]),
    ],
    registry: [],
  });
  const load = buildLoaderPlan(
    plan,
    setup("[USERSETTINGS]\nLanguage=ENG\n[Protected]\nD2Core=1.06b\nModMPQ1=mod.mpq\nModUseD2Mod=1\n"),
    { expansion: false },
  );
  assertEquals(load.nativeGameExe, false);
  assertEquals(load.problems.map((problem) => problem.message), [
    "language archive load needs ENG.mpq, which is not in the box.",
  ]);
});

Deno.test("battlenet is allowed only for a mod with a custom realm gateway", () => {
  const plan = resolve({ files: [], registry: [] });
  const base = "[USERSETTINGS]\nLanguage=MOD\n[Protected]\nD2Core=1.10f\n";
  // No realm: the usual mod. Exordium must not be a way onto official Battle.net.
  assertEquals(buildLoaderPlan(plan, setup(base)).battlenetAllowed, false);
  // A realm section with no gateway address does not count.
  assertEquals(buildLoaderPlan(plan, setup(`${base}RealmSelected=1\n`)).battlenetAllowed, false);
  // A declared custom realm gateway: allowed.
  const withRealm = buildLoaderPlan(plan, setup(`${base}RealmGateway=realm.example.net\n`));
  assertEquals(withRealm.battlenetAllowed, true);
});

Deno.test("the base releases 1.00 and 1.07 load patch_d2.mpq only when it is there", () => {
  const plan = resolve({ files: [], registry: [] });
  const patch = (core: string) =>
    buildLoaderPlan(plan, setup(`[Protected]\nD2Core=${core}\n`)).archives.find((a) => a.kind === "patch");
  assertEquals(patch("1.00")?.required, false);
  assertEquals(patch("1.07")?.required, false);
  assertEquals(patch("1.10f")?.required, true);
});
