import { assertEquals, assertThrows } from "@std/assert";
import { type FileLayer, LayerError, type RegistryLayer, resolve, type Stack } from "./mod.ts";

/** A hash that says which file it stands for, so a failing assertion reads as a sentence. */
const h = (tag: string) => tag.padEnd(64, "0").replace(/[^0-9a-f]/g, "0").slice(0, 64);
const HASH = { core: h("c0"), coreDll: h("c1"), mod: h("a0"), modDll: h("a1"), save: h("5a") };

const core: FileLayer = {
  id: "core-1.10f",
  role: "core",
  entries: [
    { path: "D2Client.dll", hash: HASH.core, size: 100 },
    { path: "D2Game.dll", hash: HASH.coreDll, size: 200 },
    { path: "d2data.mpq", hash: HASH.core, size: 300 },
  ],
};
const mod: FileLayer = {
  id: "black-soul",
  role: "mod",
  entries: [
    { path: "d2game.DLL", hash: HASH.modDll, size: 210 },
    { path: "Patch_D2.mpq", hash: HASH.mod, size: 400 },
    { path: "data\\global\\excel\\MonStats.txt", hash: HASH.mod, size: 50 },
  ],
};
const files = (...layers: FileLayer[]): Stack => ({ files: layers, registry: [] });

Deno.test("a higher layer replaces a lower one's file, matched as Windows matches names", () => {
  const plan = resolve(files(core, mod));
  assertEquals(plan.files.map((f) => [f.path, f.layer]), [
    ["D2Client.dll", "core-1.10f"],
    ["d2data.mpq", "core-1.10f"],
    // The mod's own spelling wins along with its bytes.
    ["d2game.DLL", "black-soul"],
    ["data/global/excel/MonStats.txt", "black-soul"],
    ["Patch_D2.mpq", "black-soul"],
  ]);
  assertEquals(plan.files.find((f) => f.path === "d2game.DLL")?.hash, HASH.modDll);
});

Deno.test("the plan is the same whatever order a layer lists its files in", () => {
  const shuffled: FileLayer = { ...mod, entries: [...mod.entries].reverse() };
  assertEquals(resolve(files(core, shuffled)), resolve(files(core, mod)));
});

Deno.test("a tombstone removes a file, or a whole folder, from the layers below", () => {
  const writable: FileLayer = {
    id: "profile",
    role: "writable",
    entries: [
      { path: "D2Client.dll", deleted: true },
      { path: "DATA/global", deleted: true },
      { path: "save/Hero.d2s", hash: HASH.save, size: 5 },
    ],
  };
  const paths = resolve(files(core, mod, writable)).files.map((f) => f.path);
  assertEquals(paths, ["d2data.mpq", "d2game.DLL", "Patch_D2.mpq", "save/Hero.d2s"]);
});

Deno.test("a file and a folder cannot share a name: the higher layer decides which it is", () => {
  const folderAbove: FileLayer = {
    id: "mod",
    role: "mod",
    entries: [{ path: "d2data.mpq/inside.txt", hash: HASH.mod, size: 1 }],
  };
  assertEquals(resolve(files(core, folderAbove)).files.map((f) => f.path).includes("d2data.mpq"), false);

  const folderBelow: FileLayer = { ...mod, id: "base", role: "core" };
  const fileAbove: FileLayer = { id: "mod", role: "mod", entries: [{ path: "data", hash: HASH.mod, size: 1 }] };
  const plan = resolve(files(folderBelow, fileAbove));
  assertEquals(plan.files.filter((f) => f.path.toLowerCase().startsWith("data")).map((f) => f.path), ["data"]);
});

Deno.test("paths that could reach outside the box are refused", () => {
  for (
    const path of [
      "../D2Client.dll",
      "C:\\Windows\\win.ini",
      "/etc/passwd",
      "a/../../b",
      "save/con.txt",
      "bad:name",
      "tab\tname",
      "trailing./x",
    ]
  ) {
    assertThrows(
      () => resolve(files({ id: "m", role: "mod", entries: [{ path, hash: HASH.mod, size: 1 }] })),
      LayerError,
    );
  }
});

Deno.test("layers must be in role order, with at most one writable layer, on top", () => {
  const writable: FileLayer = { id: "w", role: "writable", entries: [] };
  assertThrows(() => resolve(files(mod, core)), LayerError, "belongs under");
  assertThrows(() => resolve(files(core, writable, mod)), LayerError);
  assertThrows(() => resolve(files(core, { ...core })), LayerError, "both");
  // Two mod layers together are fine: a mod and its patch.
  resolve(files(core, mod, { ...mod, id: "patch" }, writable));
});

Deno.test("a layer listing the same path twice, in any spelling, is refused", () => {
  const twice: FileLayer = {
    id: "m",
    role: "mod",
    entries: [{ path: "a.txt", hash: HASH.mod, size: 1 }, { path: "A.TXT", hash: HASH.mod, size: 1 }],
  };
  assertThrows(() => resolve(files(twice)), LayerError, "twice");
});

Deno.test("hashes and sizes are checked when a layer is read, not at launch", () => {
  assertThrows(
    () => resolve(files({ id: "m", role: "mod", entries: [{ path: "a", hash: "ABC", size: 1 }] })),
    LayerError,
  );
  assertThrows(
    () => resolve(files({ id: "m", role: "mod", entries: [{ path: "a", hash: HASH.mod, size: -1 }] })),
    LayerError,
  );
});

// --- Registry --------------------------------------------------------------------------------------

const D2 = "HKCU\\Software\\Blizzard Entertainment\\Diablo II";
const BNET = "HKEY_CURRENT_USER\\Software\\Battle.net\\Configuration";

const base: RegistryLayer = {
  id: "base-1.10f",
  role: "base",
  entries: [
    { key: D2, name: "InstallPath", value: { type: "sz", data: "C:\\Boxes\\black-soul\\" } },
    { key: D2, name: "Resolution", value: { type: "dword", data: 0 } },
    { key: `${D2}\\VideoConfig`, name: "Render", value: { type: "dword", data: 1 } },
  ],
};
const realm: RegistryLayer = {
  id: "black-soul",
  role: "mod",
  entries: [{
    key: BNET,
    name: "Diablo II Battle.net gateways",
    value: { type: "multi_sz", data: ["0000", "00", "realm.example.net", "-1", "Black Soul Realm"] },
  }],
};
const profile: RegistryLayer = {
  id: "profile",
  role: "profile",
  entries: [{
    key: `hkcu\\software\\blizzard entertainment\\diablo ii\\videoconfig`,
    name: "RENDER",
    value: { type: "dword", data: 3 },
  }],
};

Deno.test("registry layers stack like files: keys and names ignore case, roots are normalised", () => {
  const plan = resolve({ files: [], registry: [base, realm, profile] });
  assertEquals(plan.registry.map((v) => [v.key, v.name, v.value.data, v.layer]), [
    ["HKCU\\Software\\Battle.net\\Configuration", "Diablo II Battle.net gateways", [
      "0000",
      "00",
      "realm.example.net",
      "-1",
      "Black Soul Realm",
    ], "black-soul"],
    [D2, "InstallPath", "C:\\Boxes\\black-soul\\", "base-1.10f"],
    [D2, "Resolution", 0, "base-1.10f"],
    // The root is normalised; the rest keeps the winning layer's spelling.
    ["HKCU\\software\\blizzard entertainment\\diablo ii\\videoconfig", "RENDER", 3, "profile"],
  ]);
});

Deno.test("a registry tombstone removes one value, or a key with everything under it", () => {
  const dropValue: RegistryLayer = {
    id: "w",
    role: "writable",
    entries: [{ key: D2, name: "resolution", deleted: true }],
  };
  assertEquals(resolve({ files: [], registry: [base, dropValue] }).registry.map((v) => v.name), [
    "InstallPath",
    "Render",
  ]);

  const dropKey: RegistryLayer = { id: "w", role: "writable", entries: [{ key: D2, deleted: true }] };
  assertEquals(resolve({ files: [], registry: [base, realm, dropKey] }).registry.map((v) => v.name), [
    "Diablo II Battle.net gateways",
  ]);
});

Deno.test("registry values the registry could not hold are refused", () => {
  const bad = (value: unknown) =>
    resolve({
      files: [],
      registry: [{ id: "m", role: "mod", entries: [{ key: D2, name: "x", value: value as never }] }],
    });
  assertThrows(() => bad({ type: "dword", data: -1 }), LayerError);
  assertThrows(() => bad({ type: "dword", data: 2 ** 32 }), LayerError);
  assertThrows(() => bad({ type: "qword", data: "18446744073709551616" }), LayerError);
  assertThrows(() => bad({ type: "binary", data: "ABC" }), LayerError);
  assertThrows(() => bad({ type: "multi_sz", data: ["a", "", "b"] }), LayerError);
  assertThrows(() => bad({ type: "sz", data: "a\x00b" }), LayerError);
  bad({ type: "qword", data: "18446744073709551615" });
  bad({ type: "binary", data: "00ff10" });
});

Deno.test("only HKCU and HKLM, and never a bare root", () => {
  const at = (key: string) =>
    resolve({
      files: [],
      registry: [{ id: "m", role: "mod", entries: [{ key, name: "", value: { type: "sz", data: "" } }] }],
    });
  assertThrows(() => at("HKEY_CLASSES_ROOT\\exefile"), LayerError);
  assertThrows(() => at("HKCU"), LayerError);
  at("HKEY_LOCAL_MACHINE\\SOFTWARE\\Blizzard Entertainment\\Diablo II");
});
