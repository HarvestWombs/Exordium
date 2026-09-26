import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { diffPlans, fingerprint, isEmptyDiff, resolve, type Stack } from "./mod.ts";

const h = (tag: string) => tag.padEnd(64, "0").slice(0, 64);
const D2 = "HKCU\\Software\\Blizzard Entertainment\\Diablo II";

function stack(): Stack {
  return {
    files: [
      { id: "core", role: "core", entries: [{ path: "D2Game.dll", hash: h("c0"), size: 10 }] },
      { id: "mod", role: "mod", entries: [{ path: "Patch_D2.mpq", hash: h("a0"), size: 20 }] },
      { id: "profile", role: "writable", entries: [{ path: "save/Hero.d2s", hash: h("5a"), size: 5 }] },
    ],
    registry: [
      { id: "base", role: "base", entries: [{ key: D2, name: "Resolution", value: { type: "dword", data: 0 } }] },
      { id: "profile-w", role: "writable", entries: [{ key: D2, name: "Gamma", value: { type: "dword", data: 155 } }] },
    ],
  };
}

Deno.test("a fingerprint ignores the writable layers: two players on the same mod match", async () => {
  const mine = stack();
  const theirs = stack();
  theirs.files[2]!.entries = [{ path: "save/Other.d2s", hash: h("5b"), size: 9 }];
  theirs.registry[1]!.entries = [{ key: D2, name: "Gamma", value: { type: "dword", data: 90 } }];
  assertEquals(await fingerprint(mine), await fingerprint(theirs));
});

Deno.test("a fingerprint changes with any read-only byte, and with nothing else", async () => {
  const before = await fingerprint(stack());

  const changedFile = stack();
  changedFile.files[1]!.entries = [{ path: "Patch_D2.mpq", hash: h("a1"), size: 20 }];
  const afterFile = await fingerprint(changedFile);
  assertNotEquals(afterFile.files, before.files);
  assertEquals(afterFile.registry, before.registry);
  assertNotEquals(afterFile.combined, before.combined);

  const changedSetting = stack();
  changedSetting.registry[0]!.entries = [{ key: D2, name: "Resolution", value: { type: "dword", data: 1 } }];
  const afterSetting = await fingerprint(changedSetting);
  assertEquals(afterSetting.files, before.files);
  assertNotEquals(afterSetting.registry, before.registry);
});

Deno.test("spelling is not identity: the same install in another case has the same fingerprint", async () => {
  const shouted = stack();
  shouted.files[1]!.entries = [{ path: "PATCH_D2.MPQ", hash: h("a0"), size: 20 }];
  shouted.registry[0]!.entries = [{ key: D2.toUpperCase(), name: "RESOLUTION", value: { type: "dword", data: 0 } }];
  assertEquals(await fingerprint(shouted), await fingerprint(stack()));
});

Deno.test("a fingerprint is hex SHA-256", async () => {
  const { files, registry, combined } = await fingerprint(stack());
  for (const value of [files, registry, combined]) assert(/^[0-9a-f]{64}$/.test(value));
});

Deno.test("a diff reports content, not layers or spelling", () => {
  const before = resolve(stack());
  const next = stack();
  next.files[1]!.entries = [
    { path: "PATCH_D2.mpq", hash: h("a1"), size: 21 }, // changed
    { path: "D2Game.dll", hash: h("c0"), size: 10 }, // same bytes, now from the mod: not a change
    { path: "data/global/excel/MonStats.txt", hash: h("a2"), size: 3 }, // added
  ];
  next.files[2]!.entries = []; // the save is gone
  const diff = diffPlans(before, resolve(next));
  assertEquals(diff.files.added.map((f) => f.path), ["data/global/excel/MonStats.txt"]);
  assertEquals(diff.files.removed.map((f) => f.path), ["save/Hero.d2s"]);
  assertEquals(diff.files.changed.map((c) => [c.before.hash, c.after.hash]), [[h("a0"), h("a1")]]);
  assert(isEmptyDiff(diffPlans(before, resolve(stack()))));
});

Deno.test("a diff reports registry values by key and name", () => {
  const before = resolve(stack());
  const next = stack();
  next.registry[0]!.entries = [
    { key: D2, name: "resolution", value: { type: "dword", data: 1 } },
    { key: D2, name: "InstallPath", value: { type: "sz", data: "C:\\Boxes\\x\\" } },
  ];
  const diff = diffPlans(before, resolve(next));
  assertEquals(diff.registry.changed.map((c) => [c.before.value.data, c.after.value.data]), [[0, 1]]);
  assertEquals(diff.registry.added.map((v) => v.name), ["InstallPath"]);
  assertEquals(diff.registry.removed, []);
});
