import { assert, assertEquals, assertRejects } from "@std/assert";
import { readD2SE } from "@exordium/d2se";
import { resolve } from "@exordium/layers";
import {
  allFiles,
  entriesFromD2SE,
  entryLayer,
  hasChanges,
  Library,
  LibraryError,
  pin,
  refresh,
  register,
  sourcePath,
  verifyStored,
} from "./mod.ts";

interface Fixture {
  root: string;
  install: string;
  library: Library;
  write(path: string, text: string): Promise<void>;
  cleanup(): Promise<void>;
}

/** A D2SE install and an empty library, both in a temporary folder. */
async function fixture(): Promise<Fixture> {
  const root = (await Deno.makeTempDir({ prefix: "exordium-library-" })).replace(/\\/g, "/");
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
  await write(
    "MODS/Black Soul/D2SE_SETUP.ini",
    "[USERSETTINGS]\nLanguage=MOD\n[Protected]\nD2Core=1.10f\nModTitle=The Black Soul\nModMajorVersion=1\nModMPQ1=Soul.mpq\n[END]\nendoffile=4711\n",
  );
  await write("MODS/Black Soul/D2Game.dll", "modded game");
  await write("MODS/Black Soul/Soul.mpq", "mod archive");
  await write("MODS/Black Soul/save/Hero.d2s", "a character");
  const library = await Library.open(`${root}/AppData/Exordium`);
  return { root, install, library, write, cleanup: () => Deno.remove(root, { recursive: true }) };
}

async function registered(f: Fixture) {
  const imported = (await readD2SE(f.install, { hash: true, hashWritable: false }))!;
  const entries = entriesFromD2SE(imported, new Date("2026-09-26T00:00:00Z"));
  await register(f.library, entries);
  return entries;
}

Deno.test("an import registers referenced entries: nothing is copied, saves are linked not listed", async () => {
  const f = await fixture();
  try {
    const entries = await registered(f);
    assertEquals(entries.map((e) => [e.kind, e.source.kind]), [["game", "referenced"], ["core", "referenced"], [
      "mod",
      "referenced",
    ]]);
    const mod = entries.find((e) => e.kind === "mod")!;
    assertEquals(mod.name, "The Black Soul");
    assertEquals(mod.core, "1.10f");
    assertEquals(mod.files.map((file) => file.path), ["D2Game.dll", "Soul.mpq"]);
    assertEquals(mod.saves, `${f.install}/MODS/Black Soul/save`);
    assertEquals(mod.setup?.loads.mpqs, ["Soul.mpq"]);
    // Only the small index was written; the store is empty.
    assertEquals([...Deno.readDirSync(f.library.store)], []);
    assertEquals((await f.library.list()).map((e) => e.id), entries.map((e) => e.id).sort());
    // Registering again changes nothing.
    const again = await register(f.library, entriesFromD2SE((await readD2SE(f.install, { hash: true }))!));
    assert(again.every((r) => r.action === "unchanged"));
  } finally {
    await f.cleanup();
  }
});

Deno.test("entries stack into a box: game, core, mod", async () => {
  const f = await fixture();
  try {
    const entries = await registered(f);
    const plan = resolve({ files: entries.map(entryLayer), registry: [] });
    assertEquals(plan.files.map((file) => [file.path, file.role]), [
      ["d2data.mpq", "game"],
      ["D2Game.dll", "mod"],
      ["Patch_D2.mpq", "core"],
      ["Soul.mpq", "mod"],
    ]);
  } finally {
    await f.cleanup();
  }
});

Deno.test("a selected language overlays core and mod language folders", async () => {
  const f = await fixture();
  try {
    await f.write("D2SE/CORES/1.10f/Language_ENG/ENG.mpq", "core english");
    await f.write("MODS/Black Soul/Language_ENG/ENG.mpq", "mod english");
    await f.write("MODS/Black Soul/Language_ENG/PlugY.dll", "language plugy");
    const entries = await registered(f);

    const plain = resolve({ files: entries.map(entryLayer), registry: [] });
    assertEquals(plain.files.some((file) => file.path === "ENG.mpq"), false);

    const english = resolve({ files: entries.map((entry) => entryLayer(entry, { language: "ENG" })), registry: [] });
    assertEquals(english.files.filter((file) => file.path === "ENG.mpq").map((file) => file.role), ["mod"]);
    assertEquals(english.files.filter((file) => file.path === "PlugY.dll").map((file) => file.role), ["mod"]);
  } finally {
    await f.cleanup();
  }
});

Deno.test("the pre-launch check sees a modder's edits and re-reads only what changed", async () => {
  const f = await fixture();
  try {
    const mod = (await registered(f)).find((e) => e.kind === "mod")!;

    const unchanged = await refresh(mod);
    assertEquals(unchanged.hashed, 0);
    assert(!hasChanges(unchanged.changes));

    await f.write("MODS/Black Soul/Soul.mpq", "mod archive, edited");
    await f.write("MODS/Black Soul/data/global/excel/MonStats.txt", "new table");
    await Deno.remove(`${f.install}/MODS/Black Soul/D2Game.dll`);
    await f.write("MODS/Black Soul/D2SE_SETUP.ini", "[Protected]\nD2Core=1.10f\nModTitle=The Black Soul II\n");

    const edited = await refresh(mod);
    assertEquals(edited.changes.changed, ["Soul.mpq"]);
    assertEquals(edited.changes.added, ["data/global/excel/MonStats.txt"]);
    assertEquals(edited.changes.removed, ["D2Game.dll"]);
    assertEquals(edited.changes.setup, true);
    assertEquals(edited.entry.name, "The Black Soul II");
    assertEquals(edited.hashed, 2);
  } finally {
    await f.cleanup();
  }
});

Deno.test("a folder that is gone says so instead of launching something half there", async () => {
  const f = await fixture();
  try {
    const mod = (await registered(f)).find((e) => e.kind === "mod")!;
    await Deno.remove(`${f.install}/MODS/Black Soul`, { recursive: true });
    await assertRejects(() => refresh(mod), LibraryError, "is gone");
  } finally {
    await f.cleanup();
  }
});

Deno.test("pinning copies into the store by hash, and later edits do not reach the pin", async () => {
  const f = await fixture();
  try {
    const mod = (await registered(f)).find((e) => e.kind === "mod")!;
    const pinned = await pin(f.library, mod.id, { label: "Release 1.0" });
    assertEquals(pinned.id, `${mod.id}@release-1.0`);
    assertEquals(pinned.source.kind, "stored");
    assertEquals(pinned.saves, mod.saves); // characters are still the mod's own

    for (const file of allFiles(pinned)) {
      const path = sourcePath(f.library, pinned, file);
      assert(path.startsWith(f.library.store));
      assertEquals(
        await Deno.readTextFile(path),
        await Deno.readTextFile(`${f.install}/MODS/Black Soul/${file.source}`),
      );
    }
    await f.write("MODS/Black Soul/Soul.mpq", "edited after pinning");
    assertEquals(await verifyStored(f.library, pinned), []);
    assertEquals((await f.library.get(pinned.id))?.source.kind, "stored");

    // Pinning the same content twice stores it once.
    const unchangedCore = (await f.library.list()).find((e) => e.kind === "core")!;
    const first = await pin(f.library, unchangedCore.id);
    const second = await pin(f.library, unchangedCore.id);
    assertEquals(first.id, second.id);
  } finally {
    await f.cleanup();
  }
});

Deno.test("pinning refuses a file that changed since the last check", async () => {
  const f = await fixture();
  try {
    const mod = (await registered(f)).find((e) => e.kind === "mod")!;
    await f.write("MODS/Black Soul/Soul.mpq", "changed behind the manifest's back");
    await assertRejects(() => pin(f.library, mod.id), LibraryError, "refresh before pinning");
    // Nothing half-stored is left behind.
    const leftovers: string[] = [];
    for await (const dir of Deno.readDir(f.library.store)) {
      for await (const file of Deno.readDir(`${f.library.store}/${dir.name}`)) {
        if (file.name.endsWith(".tmp")) leftovers.push(file.name);
      }
    }
    assertEquals(leftovers, []);
  } finally {
    await f.cleanup();
  }
});

Deno.test("a damaged stored file is reported", async () => {
  const f = await fixture();
  try {
    const core = (await registered(f)).find((e) => e.kind === "core")!;
    const pinned = await pin(f.library, core.id);
    const victim = pinned.files[0]!;
    await Deno.writeTextFile(f.library.storePath(victim.hash), "bit rot");
    assertEquals(await verifyStored(f.library, pinned), [victim.source]);
  } finally {
    await f.cleanup();
  }
});
