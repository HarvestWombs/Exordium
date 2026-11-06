import { assertEquals, assertRejects } from "@std/assert";
import { BackupError, deleteBackup, listBackups, readCharacter, restoreBackup, takeBackup } from "./backups.ts";

function d2s(name: string, level: number, classId = 3): Uint8Array {
  const bytes = new Uint8Array(0x40);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xaa55aa55, true);
  view.setUint32(4, 96, true);
  bytes.set(new TextEncoder().encode(name), 0x14);
  bytes[0x24] = 0x20;
  bytes[0x28] = classId;
  bytes[0x2b] = level;
  return bytes;
}

async function scratch(): Promise<{ saves: string; backups: string; done: () => Promise<void> }> {
  const root = (await Deno.makeTempDir()).replace(/\\/g, "/");
  await Deno.mkdir(`${root}/save`);
  return { saves: `${root}/save`, backups: `${root}/backups`, done: () => Deno.remove(root, { recursive: true }) };
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 4, 12, minute));

Deno.test("reads a character from a .d2s header", () => {
  assertEquals(readCharacter(d2s("Harvest", 85)), {
    name: "Harvest",
    className: "Paladin",
    level: 85,
    hardcore: false,
    dead: false,
    expansion: true,
    savedAt: null,
  });
  assertEquals(readCharacter(new Uint8Array(0x40)), null);
});

Deno.test("reads a pre-1.09 character from its older header layout", () => {
  // The first 0x30 bytes of D2SE's 1.00 and 1.07 saves.
  const hex = (text: string) => Uint8Array.from(text.match(/../g)!.map((b) => parseInt(b, 16)));
  const v100 = hex(
    "55aa55aa" + "47000000" + "64667361" + "00000000" + "00000000" + "00000000" + "00000000" + "dd001000" +
      "82000200" + "0100ffff" + "ffffff2b" + "ffffffff",
  );
  const v107 = hex(
    "55aa55aa" + "57000000" + "48617276" + "65737400" + "00000000" + "00000000" + "20000000" + "3f011000" +
      "82000100" + "0200ff01" + "01010125" + "ffff0202",
  );
  const pad = (bytes: Uint8Array) => Uint8Array.from({ length: 0x34 }, (_, i) => bytes[i] ?? 0xff);
  assertEquals(readCharacter(pad(v100)), {
    name: "dfsa",
    className: "Necromancer",
    level: 1,
    hardcore: false,
    dead: false,
    expansion: false,
    savedAt: null,
  });
  const harvest = readCharacter(pad(v107))!;
  assertEquals([harvest.name, harvest.className, harvest.level, harvest.expansion], ["Harvest", "Sorceress", 2, true]);
});

Deno.test("takes nothing from an empty save folder", async () => {
  const { saves, backups, done } = await scratch();
  try {
    const result = await takeBackup(saves, backups, { reason: "closed", title: "T", keep: 30, skipIfUnchanged: true });
    assertEquals(result, { skipped: "empty" });
    assertEquals(await listBackups(backups), []);
  } finally {
    await done();
  }
});

Deno.test("backs up, skips an unchanged folder, and lists newest first", async () => {
  const { saves, backups, done } = await scratch();
  try {
    await Deno.writeFile(`${saves}/Harvest.d2s`, d2s("Harvest", 10));
    await Deno.mkdir(`${saves}/stash`);
    await Deno.writeTextFile(`${saves}/stash/shared.sss`, "gold");
    const options = { reason: "closed" as const, title: "T", keep: 30, skipIfUnchanged: true };

    const first = await takeBackup(saves, backups, { ...options, now: at(0) });
    assertEquals("taken" in first && first.taken.characters.map((c) => c.name), ["Harvest"]);
    assertEquals("taken" in first && first.taken.files, 2);
    assertEquals(await takeBackup(saves, backups, { ...options, now: at(1) }), { skipped: "unchanged" });

    await Deno.writeFile(`${saves}/Harvest.d2s`, d2s("Harvest", 11));
    await takeBackup(saves, backups, { ...options, now: at(2) });
    const list = await listBackups(backups);
    assertEquals(list.map((b) => b.characters[0]!.level), [11, 10]);
  } finally {
    await done();
  }
});

Deno.test("prunes automatic backups beyond the limit but keeps manual ones", async () => {
  const { saves, backups, done } = await scratch();
  try {
    for (let i = 1; i <= 4; i++) {
      await Deno.writeFile(`${saves}/A.d2s`, d2s("A", i));
      const reason = i === 1 ? "manual" : "closed";
      await takeBackup(saves, backups, { reason, title: "T", keep: 2, skipIfUnchanged: true, now: at(i) });
    }
    const list = await listBackups(backups);
    assertEquals(list.map((b) => [b.reason, b.characters[0]!.level]), [["closed", 4], ["closed", 3], ["manual", 1]]);
  } finally {
    await done();
  }
});

Deno.test("restore writes the backup over the folder and deletes nothing", async () => {
  const { saves, backups, done } = await scratch();
  try {
    await Deno.writeFile(`${saves}/A.d2s`, d2s("A", 5));
    const taken = await takeBackup(saves, backups, { reason: "manual", title: "T", keep: 30, skipIfUnchanged: false });
    const id = "taken" in taken ? taken.taken.id : "";

    await Deno.writeFile(`${saves}/A.d2s`, d2s("A", 1));
    await Deno.writeFile(`${saves}/B.d2s`, d2s("B", 1));
    assertEquals(await restoreBackup(backups, id, saves), 1);
    assertEquals(readCharacter(await Deno.readFile(`${saves}/A.d2s`))!.level, 5);
    assertEquals(readCharacter(await Deno.readFile(`${saves}/B.d2s`))!.name, "B");
  } finally {
    await done();
  }
});

Deno.test("a damaged backup restores nothing", async () => {
  const { saves, backups, done } = await scratch();
  try {
    await Deno.writeFile(`${saves}/A.d2s`, d2s("A", 5));
    await Deno.writeFile(`${saves}/B.d2s`, d2s("B", 5));
    const taken = await takeBackup(saves, backups, { reason: "manual", title: "T", keep: 30, skipIfUnchanged: false });
    const id = "taken" in taken ? taken.taken.id : "";
    await Deno.writeFile(`${backups}/${id}/B.d2s`, d2s("B", 99));
    await Deno.writeFile(`${saves}/A.d2s`, d2s("A", 1));

    await assertRejects(() => restoreBackup(backups, id, saves), BackupError, "damaged");
    assertEquals(readCharacter(await Deno.readFile(`${saves}/A.d2s`))!.level, 1);
  } finally {
    await done();
  }
});

Deno.test("refuses ids that are not a backup", async () => {
  const { saves, backups, done } = await scratch();
  try {
    await assertRejects(() => restoreBackup(backups, "../save", saves), BackupError);
    await assertRejects(() => deleteBackup(backups, "nope"), BackupError);
  } finally {
    await done();
  }
});

Deno.test("a read-only file stops the restore before anything is written", async () => {
  const { saves, backups, done } = await scratch();
  try {
    await Deno.writeFile(`${saves}/A.d2s`, d2s("A", 5));
    await Deno.writeFile(`${saves}/B.d2s`, d2s("B", 5));
    const taken = await takeBackup(saves, backups, { reason: "manual", title: "T", keep: 30, skipIfUnchanged: false });
    const id = "taken" in taken ? taken.taken.id : "";
    await Deno.writeFile(`${saves}/A.d2s`, d2s("A", 1));
    await Deno.writeFile(`${saves}/B.d2s`, d2s("B", 1));
    await setReadOnly(`${saves}/B.d2s`, true);
    try {
      await assertRejects(() => restoreBackup(backups, id, saves), BackupError, "B.d2s is read-only");
      assertEquals(readCharacter(await Deno.readFile(`${saves}/A.d2s`))!.level, 1);
    } finally {
      await setReadOnly(`${saves}/B.d2s`, false);
    }
    assertEquals(await restoreBackup(backups, id, saves), 2);
    assertEquals(await restoreBackup(backups, id, saves), 0);
  } finally {
    await done();
  }
});

async function setReadOnly(path: string, on: boolean): Promise<void> {
  if (Deno.build.os === "windows") {
    const args = [on ? "+R" : "-R", path.replace(/\//g, "\\")];
    await new Deno.Command("attrib.exe", { args, stdout: "null", stderr: "null" }).output();
  } else {
    await Deno.chmod(path, on ? 0o444 : 0o644);
  }
}
