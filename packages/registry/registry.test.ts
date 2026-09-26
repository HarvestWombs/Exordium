import { assertEquals, assertThrows } from "@std/assert";
import { type RegistryEntry, resolve } from "@exordium/layers";
import {
  boxLayer,
  capturedChanges,
  decodeRegFile,
  DIABLO_KEY,
  formatHiveText,
  GAME_KEYS,
  GLIDE_KEY,
  HiveTextError,
  machineSnapshot,
  parseHiveText,
  parseRegFile,
  readWritableLayer,
  settingsLayer,
  writeWritableLayer,
} from "./mod.ts";

const D2 = DIABLO_KEY;
const GATEWAYS = "HKCU\\Software\\Battle.net\\Configuration";

Deno.test("hive text round-trips every value type, including awkward characters", () => {
  const entries: RegistryEntry[] = [
    { key: D2, name: "InstallPath", value: { type: "sz", data: "C:\\Box\\game\\" } },
    { key: D2, name: "", value: { type: "sz", data: "tab\there, newline\nthere, back\\slash" } },
    { key: D2, name: "Path", value: { type: "expand_sz", data: "%APPDATA%\\x" } },
    {
      key: GATEWAYS,
      name: "Diablo II Battle.net gateways",
      value: { type: "multi_sz", data: ["1002", "01", "127.0.0.1", "-1", "Local"] },
    },
    { key: D2, name: "Gamma", value: { type: "dword", data: 0xfffffffe } },
    { key: D2, name: "Big", value: { type: "qword", data: "18446744073709551615" } },
    { key: D2, name: "Blob", value: { type: "binary", data: "00ff10" } },
    { key: D2, name: "Empty list", value: { type: "multi_sz", data: [] } },
  ];
  const text = formatHiveText(entries);
  assertEquals(text.split("\n").length, entries.length + 1); // one line each, nothing broke a line
  assertEquals(parseHiveText(text), entries);
});

Deno.test("hive text refuses what it cannot represent", () => {
  // In the text form a key's own backslashes are escaped too.
  assertThrows(() => parseHiveText("HKCU\\\\X\tA\tdword\t-1\n"), HiveTextError, "bad dword");
  assertThrows(() => parseHiveText("HKCU\\\\X\tA\tlink\tx\n"), HiveTextError, "unknown type");
  assertThrows(() => parseHiveText("HKCU\\\\X\tA\tsz\n"), HiveTextError, "expected 4 fields");
  assertThrows(() => parseHiveText("HKCU\\X\tA\tsz\tx\n"), HiveTextError, "unknown escape");
});

/** What `reg export` writes, as UTF-16LE with a BOM. */
function exported(text: string): Uint8Array {
  const body = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) new DataView(body.buffer).setUint16(i * 2, text.charCodeAt(i), true);
  return new Uint8Array([0xff, 0xfe, ...body]);
}

Deno.test("a reg export is read: strings, dwords, string lists, qwords, continuations, deletions", () => {
  const reg = [
    "Windows Registry Editor Version 5.00",
    "",
    "[HKEY_CURRENT_USER\\Software\\Blizzard Entertainment\\Diablo II]",
    '"InstallPath"="I:\\\\Program Files\\\\Diablo II\\\\"',
    '"Preferred Realm"="HU"',
    '"Gamma"=dword:0000009c',
    '@="default"',
    '"Big"=hex(b):01,00,00,00,00,00,00,00',
    '"Path"=hex(2):25,00,41,00,25,00,00,00',
    '"Odd"=hex(5):00,00,00,01',
    '"Gone"=-',
    "",
    "[HKEY_CURRENT_USER\\Software\\Battle.net\\Configuration]",
    '"Diablo II Battle.net gateways"=hex(7):31,00,30,00,00,00,4c,00,\\',
    "  6f,00,63,00,61,00,6c,00,00,00,00,00",
    "",
    "[-HKEY_CURRENT_USER\\Software\\Old]",
  ].join("\r\n");
  const { entries, skipped } = parseRegFile(decodeRegFile(exported(reg)));
  assertEquals(entries, [
    { key: D2, name: "InstallPath", value: { type: "sz", data: "I:\\Program Files\\Diablo II\\" } },
    { key: D2, name: "Preferred Realm", value: { type: "sz", data: "HU" } },
    { key: D2, name: "Gamma", value: { type: "dword", data: 0x9c } },
    { key: D2, name: "", value: { type: "sz", data: "default" } },
    { key: D2, name: "Big", value: { type: "qword", data: "1" } },
    { key: D2, name: "Path", value: { type: "expand_sz", data: "%A%" } },
    { key: D2, name: "Gone", deleted: true },
    { key: GATEWAYS, name: "Diablo II Battle.net gateways", value: { type: "multi_sz", data: ["10", "Local"] } },
    { key: "HKCU\\Software\\Old", deleted: true },
  ]);
  assertEquals(skipped.length, 1); // REG_DWORD_BIG_ENDIAN has no RegistryValue form
});

Deno.test("the box owns InstallPath and Save Path, and a run's changes to them are not kept", () => {
  const box = boxLayer("C:/Users/p/AppData/Local/Exordium/boxes/soul/game");
  assertEquals(box.entries, [
    {
      key: D2,
      name: "InstallPath",
      value: { type: "sz", data: "C:\\Users\\p\\AppData\\Local\\Exordium\\boxes\\soul\\game\\" },
    },
    {
      key: D2,
      name: "Save Path",
      value: { type: "sz", data: "C:\\Users\\p\\AppData\\Local\\Exordium\\boxes\\soul\\game\\save\\" },
    },
  ]);
  const base = {
    id: "machine",
    role: "base" as const,
    entries: [
      { key: D2, name: "Save Path", value: { type: "sz" as const, data: "I:\\Diablo II\\Save\\" } },
      { key: D2, name: "Gamma", value: { type: "dword" as const, data: 156 } },
      { key: D2, name: "Light Quality", value: { type: "dword" as const, data: 1 } },
    ],
  };
  const lower = resolve({ files: [], registry: [base, box] }).registry;
  const after: RegistryEntry[] = [
    { key: D2, name: "InstallPath", value: { type: "sz", data: "somewhere the game wrote" } },
    { key: D2, name: "Save Path", value: { type: "sz", data: "C:\\...\\save\\" } },
    { key: D2, name: "Gamma", value: { type: "dword", data: 200 } }, // changed in the options menu
    { key: D2, name: "Always Run", value: { type: "dword", data: 1 } }, // new
    // Light Quality is gone
  ];
  assertEquals(capturedChanges(lower, after).entries, [
    { key: D2, name: "Gamma", value: { type: "dword", data: 200 } },
    { key: D2, name: "Always Run", value: { type: "dword", data: 1 } },
    { key: D2, name: "Light Quality", deleted: true },
  ]);
});

Deno.test("a profile's writable layer survives on disk and starts empty", async () => {
  const root = await Deno.makeTempDir({ prefix: "exordium-registry-" });
  try {
    assertEquals((await readWritableLayer(root, "soul")).entries, []);
    const layer = {
      id: "writable",
      role: "writable" as const,
      entries: [{ key: D2, name: "Gamma", value: { type: "dword" as const, data: 7 } }],
    };
    await writeWritableLayer(root, "soul", layer);
    assertEquals(await readWritableLayer(root, "soul"), layer);
    await assertRejectsSync(() => readWritableLayer(root, "../escape"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

async function assertRejectsSync(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error("expected a rejection");
}

Deno.test("the machine's own Diablo II keys can be read without writing anything", async () => {
  // Read-only, straight from the registry. On a machine without the game this is empty.
  const snapshot = await machineSnapshot(GAME_KEYS);
  for (const entry of snapshot.entries) {
    if ("value" in entry) formatHiveText([entry]); // every value read has a hive form
  }
  assertEquals(snapshot.entries.some((e) => "deleted" in e), false);
});

Deno.test("the mod layer carries what D2SE sets: hardcore, and the Glide wrapper's window", () => {
  assertEquals(settingsLayer({ renderer: "glide", windowed: true, hardcore: false }).entries, [
    { key: D2, name: "AllowHardcore", value: { type: "dword", data: 0 } },
    { key: GLIDE_KEY, name: "windowed", value: { type: "dword", data: 1 } },
  ]);
  assertEquals(settingsLayer({ renderer: "ddraw", windowed: true, hardcore: true }).entries, [
    { key: D2, name: "AllowHardcore", value: { type: "dword", data: 1 } },
  ]);
});
