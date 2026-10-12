import { assert, assertEquals } from "@std/assert";
import { findD2SE } from "@exordium/d2se";
import { checkInstall, copyJob, createLibrary, isLibrary, startCopy } from "./library-setup.ts";

async function until(id: string) {
  for (let i = 0; i < 200; i++) {
    const job = copyJob(id)!;
    if (job.state !== "copying") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the copy did not finish");
}

async function fakeInstall(dir: string, files: string[]) {
  await Deno.mkdir(`${dir}/D2SE/CORES/1.10f`, { recursive: true });
  await Deno.mkdir(`${dir}/D2SE/CORES/Debug Logs`, { recursive: true });
  await Deno.mkdir(`${dir}/MODS/Some Mod`, { recursive: true });
  await Deno.mkdir(`${dir}/MODS/Not A Mod`, { recursive: true });
  for (const name of files) await Deno.writeTextFile(`${dir}/${name}`, name);
  await Deno.writeTextFile(`${dir}/D2SE/CORES/1.10f/D2Game.dll`, "game");
  await Deno.writeTextFile(`${dir}/MODS/Some Mod/D2SE_SETUP.ini`, "[Protected]\nModName=Some Mod\n");
  await Deno.writeTextFile(`${dir}/D2SE.exe`, "d2se");
}

Deno.test("an install is read, not changed: its game files, cores and mods", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  try {
    await fakeInstall(dir, ["d2data.mpq", "d2exp.mpq", "D2.LNG", "glide3x.dll"]);
    const check = await checkInstall(dir);
    assertEquals(check.problem, null);
    assertEquals(check.gameFiles.map((f) => f.name).sort(), ["D2.LNG", "d2data.mpq", "d2exp.mpq", "glide3x.dll"]);
    assert(check.missing.includes("d2char.mpq"));
    assertEquals(check.cores.map((c) => c.version), ["1.10f"]);
    assertEquals(check.mods, ["Some Mod"]);
    assertEquals(check.d2se, true);

    const classic = await checkInstall(`${dir}/MODS`);
    assert(classic.problem?.includes("d2data.mpq"));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the library is a D2SE layout with a marker, and copies never replace what is there", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  const install = `${dir}/install`;
  const library = `${dir}/library`;
  try {
    await fakeInstall(install, ["d2data.mpq", "d2exp.mpq"]);
    await createLibrary(library, install);
    assert(await isLibrary(library));
    assert(!(await isLibrary(install)));
    // The D2SE reader takes the library as an install, with no D2SE.exe in it.
    assertEquals((await findD2SE(library))?.mods, []);

    const game = await until(
      startCopy(
        "game",
        "Game files",
        ["d2data.mpq", "d2exp.mpq"].map((n) => ({
          from: `${install}/${n}`,
          to: `${library}/${n}`,
        })),
        { skipExisting: true },
      ).id,
    );
    assertEquals(game.state, "done");
    assertEquals(game.copied, game.total);
    assertEquals(await Deno.readTextFile(`${library}/d2data.mpq`), "d2data.mpq");

    const core = await until(
      startCopy("core", "1.10f", [{ from: `${install}/D2SE/CORES/1.10f`, to: `${library}/cores/1.10f` }]).id,
    );
    assertEquals(core.state, "done");
    assertEquals(await Deno.readTextFile(`${library}/cores/1.10f/D2Game.dll`), "game");

    await Deno.writeTextFile(`${library}/cores/1.10f/D2Game.dll`, "mine");
    const again = await until(
      startCopy("core", "1.10f again", [{ from: `${install}/D2SE/CORES/1.10f`, to: `${library}/cores/1.10f` }]).id,
    );
    assertEquals(again.state, "failed");
    assertEquals(await Deno.readTextFile(`${library}/cores/1.10f/D2Game.dll`), "mine");
    assert(!(await Deno.stat(`${library}/cores/1.10f.partial`).then(() => true, () => false)));
    // The install was only read.
    assertEquals(await Deno.readTextFile(`${install}/D2SE/CORES/1.10f/D2Game.dll`), "game");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("startCopy move puts the folder in place and removes the source", async () => {
  const dir = (await Deno.makeTempDir()).replace(/\\/g, "/");
  const from = `${dir}/src/Some Mod`;
  const to = `${dir}/lib/mods/Some Mod`;
  try {
    await Deno.mkdir(`${from}/save`, { recursive: true });
    await Deno.writeTextFile(`${from}/D2SE_SETUP.ini`, "[Protected]\n");
    await Deno.writeTextFile(`${from}/save/Hero.d2s`, "hero");
    let wrote = false;
    const job = startCopy("mod", "Some Mod", [{ from, to }], {
      move: true,
      then: () => {
        wrote = true;
        return Deno.writeTextFile(`${to}/exordium.mod.json`, "{}");
      },
    });
    for (let i = 0; i < 200 && copyJob(job.id)!.state === "copying"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assertEquals(copyJob(job.id)!.state, "done");
    assertEquals(wrote, true);
    assertEquals(await Deno.readTextFile(`${to}/save/Hero.d2s`), "hero");
    assertEquals(await Deno.readTextFile(`${to}/exordium.mod.json`), "{}");
    // The source is gone (moved, not copied).
    assertEquals(await Deno.stat(from).then(() => true, () => false), false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
