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

Deno.test("loader plan follows D2SE MPQ priorities, including language between ModMPQ1 and ModMPQ2", () => {
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
      layer("mod", "mod", ["one.mpq", "two.mpq", "three.mpq"]),
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
    ["ENG.mpq", 7000],
    ["two.mpq", 8000],
    ["three.mpq", 9000],
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

  assertEquals(load.settings.direct, false);
  assertEquals(load.settings.txt, true);
  assertEquals(load.settings.plugY, true);
  assertEquals(load.plugins.map((plugin) => [plugin.kind, plugin.path, plugin.init, plugin.release]), [
    ["plugy", "PlugY.dll", "_Init@4", "_Release@0"],
    ["d2mod", "D2Mod.dll", 10000, 10001],
    ["custom", "Extra.dll", null, null],
    ["d2seUtility", "D2SE_Utility.dll", 10000, 10001],
    ["d2seMod", "ModSystem.dll", 2, "ModRelease"],
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
  const load = buildLoaderPlan(plan, setup("[Protected]\nD2Core=1.07\n"));
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

Deno.test("PlugY comes from the mod or core first, else from the install's PlugY folder, as D2SE does", () => {
  const text = "[USERSETTINGS]\nEnablePlugY=1\n[Protected]\nD2Core=1.10f\nModAllowPlugY=1\n";
  const plugy = (paths: string[]) =>
    buildLoaderPlan(resolve({ files: [layer("game", "game", paths)], registry: [] }), setup(text)).plugins
      .find((p) => p.kind === "plugy")?.path;
  assertEquals(plugy(["PlugY/PlugY.dll", "PlugY/EmptyPage.dc6"]), "PlugY/PlugY.dll");
  assertEquals(plugy(["PlugY.dll", "PlugY/PlugY.dll"]), "PlugY.dll");
  assertEquals(plugy([]), "PlugY.dll"); // and the missing file is reported as a problem
});
