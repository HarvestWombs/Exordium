import { assert, assertEquals } from "@std/assert";
import { findMods, folderName, installArchive, unpackArchive, zipUnpackedSize } from "./install.ts";
import { quoteArgument, runHidden } from "./native.ts";

Deno.test("arguments are quoted the way CommandLineToArgvW reads them back", () => {
  assertEquals(quoteArgument("plain"), "plain");
  assertEquals(quoteArgument("C:\\Program Files\\x"), '"C:\\Program Files\\x"');
  assertEquals(quoteArgument('say "hi"'), '"say \\"hi\\""');
  assertEquals(quoteArgument("C:\\dir with space\\"), '"C:\\dir with space\\\\"');
  assertEquals(quoteArgument(""), '""');
});

Deno.test("folder names drop what Windows refuses", () => {
  assertEquals(folderName('D2SE: Zy-El "v4.8" / fix.'), "D2SE Zy-El v4.8 fix");
  assertEquals(folderName("???"), "Mod");
});

async function tree(root: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    const full = `${root}/${path}`;
    await Deno.mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(full, text);
  }
}

Deno.test("a mod is found however deep the archive put it, and several are all found", async () => {
  const root = (await Deno.makeTempDir()).replace(/\\/g, "/");
  try {
    await tree(root, {
      "Readme.txt": "",
      "Diablo II/MODS/First/D2SE_SETUP.ini": "",
      "Diablo II/MODS/Second/d2se_setup.ini": "",
      "Diablo II/MODS/Second/data/global/excel/x.txt": "",
    });
    assertEquals((await findMods(root)).map((p) => p.split("/").pop()).sort(), ["First", "Second"]);
    assertEquals(await findMods(`${root}/Diablo II/MODS/Second/data`), []);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a zip holding a mod is unpacked into MODS, and an existing mod is never overwritten", async () => {
  if (Deno.build.os !== "windows") return;
  const root = (await Deno.makeTempDir()).replace(/\\/g, "/");
  try {
    await tree(`${root}/src`, {
      "Cool Mod/D2SE_SETUP.ini": "[Protected]\nD2Core=1.10f\n",
      "Cool Mod/Cool.mpq": "archive bytes",
    });
    const zip = `${root}/cool.zip`;
    // Windows' tar writes zip when asked (-a picks the format from the extension).
    assertEquals(
      await runHidden(`${Deno.env.get("SystemRoot")}\\System32\\tar.exe`, [
        "-a",
        "-cf",
        zip,
        "-C",
        `${root}/src`,
        "Cool Mod",
      ]),
      0,
    );

    const mods = `${root}/MODS`;
    await Deno.mkdir(mods);
    const first = await installArchive(zip, `${root}/work`, mods, "Cool Mod");
    assertEquals(first.installed.map((m) => [m.name, m.files]), [["Cool Mod", 2]]);
    assertEquals(await Deno.readTextFile(`${mods}/Cool Mod/Cool.mpq`), "archive bytes");
    assert(!(await Deno.stat(`${root}/work`).catch(() => null)), "the unpacked copy is removed after installing");

    await Deno.writeTextFile(`${mods}/Cool Mod/Cool.mpq`, "the player's edit");
    const second = await installArchive(zip, `${root}/work`, mods, "Cool Mod");
    assertEquals(second.installed, []);
    assertEquals(second.skipped.map((s) => s.name), ["Cool Mod"]);
    assertEquals(await Deno.readTextFile(`${mods}/Cool Mod/Cool.mpq`), "the player's edit");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

/** Windows' tar writes a zip of `folders` under `from`; -a picks the format from the extension. */
async function zipFolders(zip: string, from: string, folders: string[]) {
  const tar = `${Deno.env.get("SystemRoot")}\\System32\\tar.exe`;
  assertEquals(await runHidden(tar, ["-a", "-cf", zip, "-C", from, ...folders]), 0);
}

Deno.test("an archive unpacked for review lists its mods, or itself named for its title", async () => {
  if (Deno.build.os !== "windows") return;
  const root = (await Deno.makeTempDir()).replace(/\\/g, "/");
  try {
    await tree(`${root}/src`, {
      "Cool Mod/D2SE_SETUP.ini": "[Protected]\nD2Core=1.10f\n",
      "Cool Mod/Cool.mpq": "archive bytes",
      "Loose/Old.mpq": "an old mod with no setup",
    });
    const zip = `${root}/cool.zip`;
    await zipFolders(zip, `${root}/src`, ["Cool Mod"]);
    // The zip's own directory says what it unpacks to: the two files' bytes.
    assertEquals(await zipUnpackedSize(zip), "[Protected]\nD2Core=1.10f\n".length + "archive bytes".length);
    assertEquals(await zipUnpackedSize(`${root}/src/Loose/Old.mpq`), 0);

    const written: number[] = [];
    const mods = await unpackArchive(zip, `${root}/work`, "cool", (bytes) => written.push(bytes));
    assertEquals(mods, [`${root}/work/unpacked/Cool Mod`]);
    assertEquals(await Deno.readTextFile(`${mods[0]}/Cool.mpq`), "archive bytes");
    assert(written.at(-1)! > 0);

    // No D2SE_SETUP.ini or exordium.mod.json anywhere: all of it is the mod, named after the title.
    const loose = `${root}/loose.zip`;
    await zipFolders(loose, `${root}/src/Loose`, ["Old.mpq"]);
    assertEquals(await unpackArchive(loose, `${root}/work2`, "Old Mod"), [`${root}/work2/Old Mod`]);
    assertEquals(await Deno.readTextFile(`${root}/work2/Old Mod/Old.mpq`), "an old mod with no setup");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
