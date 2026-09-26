/**
 * Reads the machine's registry directly through advapi32, read-only.
 *
 * Replaces `reg export`, which ran reg.exe once per key on every Play: a console program, so from
 * the desktop app (which has no console) each run flashed a terminal window. The values come out
 * exactly as the `.reg` parser gives them, subkeys included, so nothing downstream changes.
 */

import { normalizeKey, type RegistryEntry, type RegistryValue } from "@exordium/layers";
import type { RegFile } from "./reg-file.ts";

const SYMBOLS = {
  RegOpenKeyExW: { parameters: ["pointer", "buffer", "u32", "u32", "buffer"], result: "i32" },
  RegEnumValueW: {
    parameters: ["pointer", "u32", "buffer", "buffer", "pointer", "buffer", "buffer", "buffer"],
    result: "i32",
  },
  RegEnumKeyExW: {
    parameters: ["pointer", "u32", "buffer", "buffer", "pointer", "pointer", "pointer", "pointer"],
    result: "i32",
  },
  RegCloseKey: { parameters: ["pointer"], result: "i32" },
} as const;

type Advapi32 = Deno.DynamicLibrary<typeof SYMBOLS>;

// The predefined roots are sign-extended 32-bit handles.
const ROOTS: Record<string, bigint> = {
  HKCU: 0xffffffff80000001n,
  HKLM: 0xffffffff80000002n,
};
const KEY_READ = 0x20019;
const ERROR_SUCCESS = 0;
const ERROR_FILE_NOT_FOUND = 2;
const ERROR_MORE_DATA = 234;
const ERROR_NO_MORE_ITEMS = 259;
/** A value or key name is at most 16383 characters. */
const NAME_CHARS = 16384;

const REG_SZ = 1;
const REG_EXPAND_SZ = 2;
const REG_BINARY = 3;
const REG_DWORD = 4;
const REG_MULTI_SZ = 7;
const REG_QWORD = 11;

function utf16z(value: string): Uint8Array {
  const buffer = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(buffer.buffer);
  for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i), true);
  return buffer;
}

const utf16 = (bytes: Uint8Array) => new TextDecoder("utf-16le").decode(bytes);

/** A value's bytes as the `.reg` parser would give them; null for a type a RegistryValue cannot hold. */
function toValue(type: number, bytes: Uint8Array): RegistryValue | null {
  switch (type) {
    case REG_SZ:
      return { type: "sz", data: utf16(bytes).replace(/\0+$/, "") };
    case REG_EXPAND_SZ:
      return { type: "expand_sz", data: utf16(bytes).replace(/\0+$/, "") };
    case REG_MULTI_SZ: {
      const items = utf16(bytes).replace(/\0+$/, "");
      return { type: "multi_sz", data: items === "" ? [] : items.split("\0") };
    }
    case REG_DWORD:
      return bytes.length === 4
        ? { type: "dword", data: new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) }
        : null;
    case REG_QWORD:
      return bytes.length === 8
        ? { type: "qword", data: new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true).toString() }
        : null;
    case REG_BINARY:
      return { type: "binary", data: [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("") };
  }
  return null;
}

function openKey(api: Advapi32, root: bigint, path: string): Deno.PointerValue | null {
  const out = new BigUint64Array(1);
  const status = api.symbols.RegOpenKeyExW(
    Deno.UnsafePointer.create(root),
    utf16z(path),
    0,
    KEY_READ,
    new Uint8Array(out.buffer),
  );
  if (status === ERROR_FILE_NOT_FOUND) return null;
  if (status !== ERROR_SUCCESS) throw new Error(`RegOpenKeyExW failed with ${status}`);
  return Deno.UnsafePointer.create(out[0]!);
}

function readKey(api: Advapi32, handle: Deno.PointerValue, key: string, into: RegFile): string[] {
  const name = new Uint8Array(NAME_CHARS * 2);
  const nameLength = new Uint32Array(1);
  const type = new Uint32Array(1);
  const dataLength = new Uint32Array(1);
  let data = new Uint8Array(64 * 1024);

  for (let index = 0;; index++) {
    nameLength[0] = NAME_CHARS;
    dataLength[0] = data.length;
    const status = api.symbols.RegEnumValueW(
      handle,
      index,
      name,
      new Uint8Array(nameLength.buffer),
      null,
      new Uint8Array(type.buffer),
      data,
      new Uint8Array(dataLength.buffer),
    );
    if (status === ERROR_NO_MORE_ITEMS) break;
    if (status === ERROR_MORE_DATA) {
      data = new Uint8Array(dataLength[0]! * 2);
      index--;
      continue;
    }
    if (status !== ERROR_SUCCESS) throw new Error(`RegEnumValueW failed with ${status} under ${key}`);
    const valueName = utf16(name.subarray(0, nameLength[0]! * 2));
    const value = toValue(type[0]!, data.slice(0, dataLength[0]!));
    if (value) into.entries.push({ key, name: valueName, value } satisfies RegistryEntry);
    else into.skipped.push(`${key}\\${valueName}: registry type ${type[0]} is not supported`);
  }

  const subkeys: string[] = [];
  for (let index = 0;; index++) {
    nameLength[0] = NAME_CHARS;
    const status = api.symbols.RegEnumKeyExW(
      handle,
      index,
      name,
      new Uint8Array(nameLength.buffer),
      null,
      null,
      null,
      null,
    );
    if (status === ERROR_NO_MORE_ITEMS) break;
    if (status !== ERROR_SUCCESS) throw new Error(`RegEnumKeyExW failed with ${status} under ${key}`);
    subkeys.push(utf16(name.subarray(0, nameLength[0]! * 2)));
  }
  return subkeys;
}

/** Every value under `keys`, subkeys included; a key that does not exist is skipped. Writes nothing. */
export function readMachineKeys(keys: readonly string[]): RegFile {
  const result: RegFile = { entries: [], skipped: [] };
  const api = Deno.dlopen("advapi32.dll", SYMBOLS);
  try {
    const visit = (root: bigint, rootName: string, path: string) => {
      const handle = openKey(api, root, path);
      if (handle === null) return;
      try {
        for (const sub of readKey(api, handle, `${rootName}\\${path}`, result)) {
          visit(root, rootName, `${path}\\${sub}`);
        }
      } finally {
        api.symbols.RegCloseKey(handle);
      }
    };
    for (const key of keys) {
      const normal = normalizeKey(key);
      const rootName = normal.slice(0, normal.indexOf("\\"));
      visit(ROOTS[rootName]!, rootName, normal.slice(rootName.length + 1));
    }
  } finally {
    api.close();
  }
  return result;
}
