import { assert, assertEquals, assertRejects } from "@std/assert";
import { readD2SE } from "@exordium/d2se";
import { resolve } from "@exordium/layers";
import { entriesFromD2SE, entryLayer, Library, pin } from "@exordium/library";
import { BoxError, Boxes, type BoxSpec, librarySources } from "./mod.ts";

interface Fixture {
  root: string;
  install: string;
  mod: string;
  library: Library;
  boxes: Boxes;
  write(path: string, text: string): Promise<void>;
  cleanup(): Promise<void>;
}

/** A D2SE install, a library of referenced entries, and an empty boxes folder. */
async function fixture(): Promise<Fixture> {
  const root = (await Deno.makeTempDir({ prefix: "exordium-box-" })).replace(/\\/g, "/");
  const install = `${root}/Diablo II`;
  const write = async (path: string, text: string) => {
    const full = `${install}/${path}`;
    await Deno.mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(full, text);
  };
  await write("D2SE.exe", "");
  await write("d2data.mpq", "game data");
  await write("D2SE/CORES/1.10f/D2Game.dll", "stock game");
  await write("D2SE/CORES/1.10f/Patch_D2.mpq", "stock patch");
  await write("MODS/Soul/D2SE_SETUP.ini", "[Protected]\nD2Core=1.10f\nModTitle=Soul\n[END]\nendoffile=4711\n");
  await write("MODS/Soul/D2Game.dll", "modded game");
  await write("MODS/Soul/D2Mod.ini", "[D2MOD]\nCubeOps=CubeOps.dll\n");
  await write("MODS/Soul/data/global/excel/MonStats.txt", "a table");
  await write("MODS/Soul/save/Hero.d2s", "a character that must survive everything");
  const exordium = `${root}/AppData/Exordium`;
  return {
    root,
    install,
    mod: `${install}/MODS/Soul`,
    library: await Library.open(exordium),
    boxes: await Boxes.open(exordium),
    write,
    cleanup: () => Deno.remove(root, { recursive: true }),
  };
}

async function spec(f: Fixture, id = "soul"): Promise<BoxSpec> {
  const entries = entriesFromD2SE((await readD2SE(f.install, { hash: true, hashWritable: false }))!);
  const plan = resolve({ files: entries.map(entryLayer), registry: [] });
  const mod = entries.find((e) => e.kind === "mod")!;
  return { id, plan, source: librarySources(f.library, entries), saves: mod.saves };
}

Deno.test("a box presents every layer as links, and save is the mod's own folder", async () => {
  const f = await fixture();
  try {
    const box = await f.boxes.realise(await spec(f));
    assertEquals(box.reused, false);
    assertEquals(box.counts, { hardlink: 5, symlink: 0, copy: 0 });
    assertEquals(await Deno.readTextFile(`${box.folder}/D2Game.dll`), "modded game");
    assertEquals(await Deno.readTextFile(`${box.folder}/Patch_D2.mpq`), "stock patch");
    assertEquals(await Deno.readTextFile(`${box.folder}/d2data.mpq`), "game data");
    // The saves are the mod's, read and written through the junction.
    assertEquals(await Deno.readTextFile(`${box.folder}/save/Hero.d2s`), "a character that must survive everything");
    await Deno.writeTextFile(`${box.folder}/save/New.d2s`, "made in Exordium");
    assertEquals(await Deno.readTextFile(`${f.mod}/save/New.d2s`), "made in Exordium");
  } finally {
    await f.cleanup();
  }
});

Deno.test("characters survive rebuilding and removing a box", async () => {
  const f = await fixture();
  try {
    await f.boxes.realise(await spec(f));
    await f.write("MODS/Soul/D2Game.dll", "modded game, edited"); // forces a rebuild
    const rebuilt = await f.boxes.realise(await spec(f));
    assertEquals(rebuilt.reused, false);
    assertEquals(await Deno.readTextFile(`${f.mod}/save/Hero.d2s`), "a character that must survive everything");
    await f.boxes.remove("soul");
    assertEquals(await Deno.readTextFile(`${f.mod}/save/Hero.d2s`), "a character that must survive everything");
    // Removing the box removed links only; the mod itself is whole.
    assertEquals(await Deno.readTextFile(`${f.mod}/D2Game.dll`), "modded game, edited");
  } finally {
    await f.cleanup();
  }
});

Deno.test("an unchanged plan reuses the box; a changed one rebuilds it", async () => {
  const f = await fixture();
  try {
    await f.boxes.realise(await spec(f));
    assertEquals((await f.boxes.realise(await spec(f))).reused, true);
    await f.write("MODS/Soul/data/global/excel/Skills.txt", "a new table");
    const rebuilt = await f.boxes.realise(await spec(f));
    assertEquals(rebuilt.reused, false);
    assertEquals(await Deno.readTextFile(`${rebuilt.folder}/data/global/excel/Skills.txt`), "a new table");
  } finally {
    await f.cleanup();
  }
});

Deno.test("a referenced mod is written through like D2SE writes it, and that is only reported", async () => {
  const f = await fixture();
  try {
    const box = await f.boxes.realise(await spec(f));
    // A plugin saving its settings: under D2SE this lands in the mod folder, and so it does here.
    await Deno.writeTextFile(`${box.folder}/D2Mod.ini`, "[D2MOD]\nCubeOps=CubeOps.dll\nNew=New.dll\n");
    assertEquals(await Deno.readTextFile(`${f.mod}/D2Mod.ini`), "[D2MOD]\nCubeOps=CubeOps.dll\nNew=New.dll\n");
    await Deno.writeTextFile(`${box.folder}/D2Mod.log`, "a log the run made");
    const after = await f.boxes.afterRun("soul");
    assertEquals(after.writtenThrough.map((w) => [w.path, w.protected]), [["D2Mod.ini", false]]);
    assertEquals(after.newFiles, ["D2Mod.log"]);
    assertEquals((await f.boxes.state("soul"))?.learnedCopy, []);
  } finally {
    await f.cleanup();
  }
});

Deno.test("a pinned version is protected: its settings are copied, and a write-through is learned", async () => {
  const f = await fixture();
  try {
    const entries = entriesFromD2SE((await readD2SE(f.install, { hash: true, hashWritable: false }))!);
    for (const e of entries) await f.library.save(e);
    const pinned = await pin(f.library, entries.find((e) => e.kind === "mod")!.id, { label: "v1" });
    const stack = entries.map((e) => (e.kind === "mod" ? pinned : e));
    const plan = resolve({ files: stack.map(entryLayer), registry: [] });
    const box = await f.boxes.realise({
      id: "soul-pinned",
      plan,
      source: librarySources(f.library, stack),
      saves: pinned.saves,
      protect: (_file, source) => source.startsWith(f.library.store),
    });
    assertEquals(box.counts, { hardlink: 4, symlink: 0, copy: 1 }); // D2Mod.ini is copied
    // Writing to a protected hardlink would reach the store: caught, and learned.
    await Deno.writeTextFile(`${box.folder}/D2Game.dll`, "corrupted");
    const after = await f.boxes.afterRun("soul-pinned");
    assertEquals(after.writtenThrough.map((w) => [w.path, w.protected]), [["D2Game.dll", true]]);
    assertEquals((await f.boxes.state("soul-pinned"))?.learnedCopy, ["D2Game.dll"]);
  } finally {
    await f.cleanup();
  }
});

Deno.test("a link the game replaced is noticed, and the next launch rebuilds from the plan", async () => {
  const f = await fixture();
  try {
    const box = await f.boxes.realise(await spec(f));
    await Deno.remove(`${box.folder}/D2Game.dll`);
    await Deno.writeTextFile(`${box.folder}/D2Game.dll`, "the game's own replacement");
    const after = await f.boxes.afterRun("soul");
    assertEquals(after.replaced, ["D2Game.dll"]);
    assertEquals(after.writtenThrough, []); // the mod's own file was not touched
    const again = await f.boxes.realise(await spec(f));
    assertEquals(again.reused, false);
    assertEquals(await Deno.readTextFile(`${again.folder}/D2Game.dll`), "modded game");
  } finally {
    await f.cleanup();
  }
});

Deno.test("symlink and copy modes work when hardlinks are not available", async () => {
  const f = await fixture();
  try {
    const symlinked = await f.boxes.realise({ ...(await spec(f, "sym")) }, { modes: ["symlink", "copy"] });
    assertEquals(symlinked.counts.hardlink, 0);
    assert(symlinked.counts.symlink + symlinked.counts.copy === 5);
    assertEquals(await Deno.readTextFile(`${symlinked.folder}/D2Game.dll`), "modded game");
    const copied = await f.boxes.realise({ ...(await spec(f, "copy")) }, { modes: ["copy"] });
    assertEquals(copied.counts, { hardlink: 0, symlink: 0, copy: 5 });
  } finally {
    await f.cleanup();
  }
});

Deno.test("a plan that puts files in save is refused, and deletes never leave the boxes folder", async () => {
  const f = await fixture();
  try {
    const base = await spec(f);
    const bad = {
      ...base,
      plan: { ...base.plan, files: [...base.plan.files, { ...base.plan.files[0]!, path: "save/Evil.d2s" }] },
    };
    await assertRejects(() => f.boxes.realise(bad), BoxError, "save");
    await assertRejects(() => f.boxes.realise({ ...base, id: "../escape" }), BoxError, "not a valid box id");
    assertEquals(await Deno.readTextFile(`${f.mod}/save/Hero.d2s`), "a character that must survive everything");
  } finally {
    await f.cleanup();
  }
});

Deno.test("a file held open in the old box never leaves a half-deleted box behind", async () => {
  const f = await fixture();
  try {
    const first = await f.boxes.realise(await spec(f));
    const held = await Deno.open(`${first.folder}/D2Game.dll`, { read: true });
    try {
      await f.write("MODS/Soul/D2Game.dll", "modded game, edited"); // forces a rebuild
      const outcome = await f.boxes.realise(await spec(f)).then(() => "rebuilt", (e) => (e as Error).name);
      // Either the swap happened and the old box is swept later, or it refused cleanly; never half.
      // (The fixture hardlinks, so D2Game.dll reads as edited either way; wholeness is the point.)
      assertEquals(["rebuilt", "BoxError"].includes(outcome), true);
      assertEquals(await Deno.readTextFile(`${first.folder}/D2Game.dll`), "modded game, edited");
      assertEquals(await Deno.readTextFile(`${first.folder}/d2data.mpq`), "game data");
      assertEquals(await Deno.readTextFile(`${first.folder}/Patch_D2.mpq`), "stock patch");
      assertEquals(
        await Deno.readTextFile(`${first.folder}/save/Hero.d2s`),
        "a character that must survive everything",
      );
    } finally {
      held.close();
    }
    const again = await f.boxes.realise(await spec(f)); // and the next launch sweeps what was left
    assertEquals(await Deno.readTextFile(`${again.folder}/D2Game.dll`), "modded game, edited");
    const leftovers = [];
    for await (const e of Deno.readDir(f.boxes.folder("soul"))) {
      if (/\.(old|building)$/.test(e.name)) leftovers.push(e.name);
    }
    assertEquals(leftovers, []);
    assertEquals(await Deno.readTextFile(`${f.mod}/save/Hero.d2s`), "a character that must survive everything");
  } finally {
    await f.cleanup();
  }
});

Deno.test("removing a box deletes its links, never what they point at, junctions included", async () => {
  const f = await fixture();
  try {
    const box = await f.boxes.realise(await spec(f), { modes: ["symlink"] });
    // A junction the game or a plugin might have made, besides save.
    await f.write("Elsewhere/keep.txt", "not the box's");
    await Deno.symlink(`${f.install}/Elsewhere`, `${box.folder}/other`, { type: "junction" });
    await f.boxes.remove("soul");
    assertEquals(await Deno.readTextFile(`${f.install}/Elsewhere/keep.txt`), "not the box's");
    assertEquals(await Deno.readTextFile(`${f.mod}/save/Hero.d2s`), "a character that must survive everything");
    assertEquals(await Deno.readTextFile(`${f.mod}/D2Game.dll`), "modded game");
    await assertRejects(() => Deno.lstat(f.boxes.folder("soul")), Deno.errors.NotFound);
  } finally {
    await f.cleanup();
  }
});

Deno.test("a mod's data folder is one junction: never walked, never planned, never deleted", async () => {
  const f = await fixture();
  try {
    await f.write("MODS/Soul/data/global/tiles/act1.dt1", "a tile");
    const imported = (await readD2SE(f.install, { hash: true, hashWritable: false, linkData: true }))!;
    const scan = imported.mods[0]!.scan;
    assertEquals(scan.data, "data");
    assertEquals(scan.layer.some((file) => file.path.toLowerCase().startsWith("data/")), false);

    const base = await spec(f);
    const plan = resolve({
      files: entriesFromD2SE(imported).map(entryLayer),
      registry: [],
    });
    const folders = [{ path: "data", target: `${f.mod}/data` }];
    const box = await f.boxes.realise({ ...base, plan, folders });
    assertEquals(await Deno.readTextFile(`${box.folder}/data/global/tiles/act1.dt1`), "a tile");
    assertEquals((await Deno.lstat(`${box.folder}/data`)).isSymlink, true);
    assertEquals((await f.boxes.realise({ ...base, plan, folders })).reused, true);
    assertEquals((await f.boxes.afterRun("soul")).newFiles, []);

    // A plan that still carries data files cannot also link the folder.
    await assertRejects(() => f.boxes.realise({ ...base, folders }), BoxError, "linked whole");

    await f.boxes.remove("soul");
    assertEquals(await Deno.readTextFile(`${f.mod}/data/global/tiles/act1.dt1`), "a tile");
    assertEquals(await Deno.readTextFile(`${f.mod}/data/global/excel/MonStats.txt`), "a table");
  } finally {
    await f.cleanup();
  }
});
