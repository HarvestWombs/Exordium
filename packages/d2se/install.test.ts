import { assert, assertEquals } from "@std/assert";
import { resolve } from "@exordium/layers";
import { classify, hashFile, readD2SE, toLayer } from "./mod.ts";

Deno.test("classification: saves are the player's, D2SE's own files and logs stay behind", () => {
  assertEquals(classify("mod", "save/Hero.d2s"), { kind: "writable" });
  assertEquals(classify("mod", "Language_ENG/data/local/lng/eng/string.tbl"), {
    kind: "language",
    language: "ENG",
    path: "data/local/lng/eng/string.tbl",
  });
  assertEquals(classify("mod", "D2SE_SETUP.ini").kind, "excluded");
  assertEquals(classify("mod", "CustomTbl.log").kind, "excluded");
  assertEquals(classify("mod", "BnetLog.txt").kind, "excluded");
  assertEquals(classify("mod", ".excelsior-backups/x.txt").kind, "excluded");
  assertEquals(classify("mod", "D2Mod.ini"), { kind: "layer" });
  assertEquals(classify("mod", "Screenshots/shot.jpg"), { kind: "layer" }); // not judged: reported by size
  assertEquals(classify("core", "1.10f.7z").kind, "excluded");
  assertEquals(classify("core", "D2Common.idb").kind, "excluded");
  assertEquals(classify("core", "save/Old.d2s").kind, "excluded");
  assertEquals(classify("core", "D2Game.dll"), { kind: "layer" });
  // A core is its own root files and its languages, nothing else.
  assertEquals(classify("core", "data/local/use").kind, "excluded");
  assertEquals(classify("core", "Backup/D2Common.dll").kind, "excluded");
  assertEquals(classify("core", "Language_KOR/KOR.mpq").kind, "language");
});

/** A small D2SE install on disk: one core, one mod, the root's archives. */
async function install(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "exordium-d2se-" });
  const write = async (path: string, text: string) => {
    await Deno.mkdir(`${root}/${path}`.replace(/\/[^/]+$/, ""), { recursive: true });
    await Deno.writeTextFile(`${root}/${path}`, text);
  };
  await write("D2SE.exe", "");
  await write("D2SE.ini", "[USERSETTINGS]\nActiveFolder=Test Mod\n[END]\nendoffile=4711\n");
  await write("d2data.mpq", "game data");
  await write("D2EXP.MPQ", "expansion data");
  await write("Game.exe", "1.14 game, not a layer");
  await write("glide3x.dll", "the install's Glide wrapper");
  await write("D2.LNG", "the install's language resources");
  await write("ijl11.dll", "the install's jpeg library");
  await write("binkw32.dll", "the install's bink library");
  await write("SmackW32.dll", "the install's smack library");
  await write("D2Client.dll", "a stray 1.13c DLL in the root, not a layer");
  await write("PlugY/PlugY.dll", "the install's PlugY");
  await write("PlugY/EmptyPage.dc6", "a PlugY image");
  await write("D2SE/CORES/1.10f/D2Game.dll", "stock 1.10f game");
  await write("D2SE/CORES/1.10f/Patch_D2.mpq", "stock 1.10f patch");
  await write("D2SE/CORES/1.10f/1.10f.7z", "archived core");
  await write("D2SE/CORES/1.10f/D2Mod.dll", "a d2mod the core carries");
  await write("D2SE/CORES/1.10f/Language_DEU/DEU.mpq", "german");
  await write("D2SE/CORES/1.13c/D2Game.dll", "stock 1.13c game");
  await write("D2SE/CORES/Debug Logs/log.txt", "D2SE's own folder, not a core");
  // D2Mod.dll and the German language come from the core: D2SE looks in the mod first, then the core.
  await write(
    "MODS/Core Fallback/D2SE_SETUP.ini",
    "[USERSETTINGS]\nLanguage=DEU\n[Protected]\nD2Core=1.10f\nModUseD2Mod=1\n[END]\nendoffile=4711\n",
  );
  await write(
    "MODS/Own Language/D2SE_SETUP.ini",
    "[USERSETTINGS]\nLanguage=MOD\n[Protected]\nD2Core=1.10f\n[END]\nendoffile=4711\n",
  );
  await write(
    "MODS/Test Mod/D2SE_SETUP.ini",
    "[USERSETTINGS]\nLanguage=ENG\n[Protected]\nD2Core=1.10f\nModUseD2Mod=1\nModMPQ1=Test.mpq\nModMPQ2=Missing.mpq\n[END]\nendoffile=4711\n",
  );
  await write("MODS/Test Mod/D2Game.dll", "modded game");
  await write("MODS/Test Mod/D2Mod.dll", "d2mod");
  await write("MODS/Test Mod/Test.mpq", "mod archive");
  await write("MODS/Test Mod/save/Hero.d2s", "a character");
  await write("MODS/Test Mod/Language_ENG/data/local/string.tbl", "english");
  await write("MODS/Test Mod/BnetLog.txt", "");
  await write("MODS/Broken/readme.txt", "no setup");
  return root;
}

Deno.test("reading an install finds its cores, mods, archives and problems", async () => {
  const root = await install();
  try {
    const found = await readD2SE(root, { hash: false });
    assert(found);
    assertEquals(found.layout.cores, ["1.10f", "1.13c"]);
    assertEquals(found.layout.mods, ["Broken", "Core Fallback", "Own Language", "Test Mod"]);
    assertEquals(found.launcher?.activeFolder, "Test Mod");
    // Only the shared archives: Game.exe at the root is 1.14's and is no layer.
    // The archives, D2.LNG, the video DLLs and the root's renderer wrappers. Never the root's game DLLs
    // or its PlugY folder (a mod brings its own PlugY).
    assertEquals(found.game.map((f) => f.path), [
      "d2data.mpq",
      "D2EXP.MPQ",
      "binkw32.dll",
      "D2.LNG",
      "glide3x.dll",
      "ijl11.dll",
      "SmackW32.dll",
    ]);
    assert(found.missingGameArchives.includes("d2char.mpq"));

    const core = found.cores.find((c) => c.version === "1.10f")!;
    assertEquals(core.scan.layer.map((f) => f.path), ["D2Game.dll", "D2Mod.dll", "Patch_D2.mpq"]);
    assertEquals(core.scan.excluded.map((f) => f.path), ["1.10f.7z"]);
    assertEquals(Object.keys(core.scan.languages), ["DEU"]);

    const mod = found.mods.find((m) => m.folder === "Test Mod")!;
    assertEquals(mod.setup?.loads.mpqs, ["Test.mpq", "Missing.mpq"]);
    assertEquals(mod.scan.layer.map((f) => f.path), ["D2Game.dll", "D2Mod.dll", "Test.mpq"]);
    assertEquals(mod.scan.writable.map((f) => f.path), ["save/Hero.d2s"]);
    assertEquals(Object.keys(mod.scan.languages), ["ENG"]);
    assertEquals(mod.problems.map((p) => p.message), [
      "ModMPQ2 names Missing.mpq, which neither the mod nor its core has.",
    ]);
    assertEquals(found.mods.find((m) => m.folder === "Core Fallback")!.problems, []);
    assertEquals(found.mods.find((m) => m.folder === "Own Language")!.problems, []);

    const broken = found.mods.find((m) => m.folder === "Broken")!;
    assertEquals(broken.setup, null);
    assertEquals(broken.problems[0]?.level, "error");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a hashed import stacks into a box: game, core, mod, saves", async () => {
  const root = await install();
  try {
    const found = (await readD2SE(root, { hash: true, mods: ["test mod"], cores: ["1.10f"] }))!;
    assertEquals(found.mods.length, 1);
    assertEquals(found.cores.length, 1);
    const mod = found.mods[0]!;
    const plan = resolve({
      files: [
        toLayer("game", "game", found.game),
        toLayer("core-1.10f", "core", found.cores[0]!.scan.layer),
        toLayer("test-mod", "mod", mod.scan.layer),
        toLayer("saves", "writable", mod.scan.writable),
      ],
      registry: [],
    });
    assertEquals(plan.files.map((f) => [f.path, f.layer]), [
      ["binkw32.dll", "game"],
      ["D2.LNG", "game"],
      ["d2data.mpq", "game"],
      ["D2EXP.MPQ", "game"],
      ["D2Game.dll", "test-mod"],
      ["D2Mod.dll", "test-mod"],
      ["glide3x.dll", "game"],
      ["ijl11.dll", "game"],
      ["Patch_D2.mpq", "core-1.10f"],
      ["save/Hero.d2s", "saves"],
      ["SmackW32.dll", "game"],
      ["Test.mpq", "test-mod"],
    ]);
    // The hash is the file's real SHA-256.
    const expected = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("modded game"));
    const hex = [...new Uint8Array(expected)].map((b) => b.toString(16).padStart(2, "0")).join("");
    assertEquals(plan.files.find((f) => f.path === "D2Game.dll")?.hash, hex);
    assertEquals(await hashFile(`${root}/MODS/Test Mod/D2Game.dll`), hex);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a folder that is not a D2SE install reads as null", async () => {
  const root = await Deno.makeTempDir();
  try {
    assertEquals(await readD2SE(root, { hash: false }), null);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("hash cache: a second import reads nothing unchanged, and a changed file is read again", async () => {
  const root = await install();
  const cache = new Map();
  const options = { hash: true, hashWritable: false, cores: ["1.10f"], mods: ["Core Fallback"], cache };
  const first = await readD2SE(root, options);
  assert(first);
  // The core and the root both have files named alike; keyed by full path they stay apart.
  assert(cache.has(`${root}/D2SE/CORES/1.10f/D2Game.dll`.replaceAll("\\", "/").toLowerCase()));
  const size = cache.size;
  assert(size > 0);

  // A cached entry that no longer matches the file's size is not trusted.
  const patch = `${root}/D2SE/CORES/1.10f/Patch_D2.mpq`;
  await Deno.writeTextFile(patch, "a longer, changed 1.10f patch");
  const second = await readD2SE(root, options);
  assert(second);
  const core = second.cores[0]!.scan;
  assertEquals(core.hashed, 1);
  assertEquals(core.layer.find((f) => f.path.toLowerCase() === "patch_d2.mpq")?.hash, await hashFile(patch));
  assertEquals(cache.size, size);
  await Deno.remove(root, { recursive: true });
});

Deno.test("Exordium's library reads with its own folders: game, cores, mods", async () => {
  const root = (await Deno.makeTempDir()).replace(/\\/g, "/");
  try {
    const write = async (path: string, text: string) => {
      await Deno.mkdir(`${root}/${path}`.replace(/\/[^/]+$/, ""), { recursive: true });
      await Deno.writeTextFile(`${root}/${path}`, text);
    };
    await write("exordium-library.json", "{}");
    await write("game/d2data.mpq", "data");
    await write("game/PlugY/PlugY.dll", "plugy");
    await write("cores/1.10f/D2Game.dll", "game");
    await write("mods/Some Mod/D2SE_SETUP.ini", "[Protected]\nModName=Some Mod\nD2Core=1.10f\n");
    const imported = (await readD2SE(root, { hash: false }))!;
    assertEquals(imported.layout.library, true);
    assertEquals(imported.layout.folders, { game: "game", cores: "cores", mods: "mods" });
    // In the box the game files sit at the root; they are read from the library's game folder. A PlugY
    // left there by an older setup is not part of it.
    assertEquals(imported.game.map((f) => [f.path, f.source]), [["d2data.mpq", "game/d2data.mpq"]]);
    assertEquals(imported.cores.map((c) => [c.version, c.folder]), [["1.10f", "cores/1.10f"]]);
    assertEquals(imported.mods.map((m) => m.folder), ["Some Mod"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
