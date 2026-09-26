/**
 * The text form of a box's registry, as the native loader reads and writes it.
 *
 * One value per line: `key <TAB> name <TAB> type <TAB> data`, UTF-8. The key is `HKCU\…` or
 * `HKLM\…`. In every field a backslash, tab, CR, LF and NUL are escaped as `\\`, `\t`, `\r`, `\n`
 * and `\0`, so a line never breaks and a field never splits. Data is a string for `sz` and
 * `expand_sz`, strings joined by NUL for `multi_sz`, decimal for `dword` and `qword`, and hex for
 * `binary`, matching `RegistryValue`. It is this plain so the loader needs no JSON reader for it.
 */

import { normalizeKey, type RegistryEntry, type RegistryValue } from "@exordium/layers";

const TYPES = new Set<RegistryValue["type"]>(["sz", "expand_sz", "multi_sz", "dword", "qword", "binary"]);

export class HiveTextError extends Error {
  override name = "HiveTextError";
}

function escape(field: string): string {
  return field.replace(
    /[\\\t\r\n\0]/g,
    (c) => ({ "\\": "\\\\", "\t": "\\t", "\r": "\\r", "\n": "\\n", "\0": "\\0" })[c]!,
  );
}

function unescape(field: string, line: number): string {
  return field.replace(/\\(.?)/g, (_, c: string) => {
    const out = ({ "\\": "\\", t: "\t", r: "\r", n: "\n", "0": "\0" } as Record<string, string>)[c];
    if (out === undefined) throw new HiveTextError(`Line ${line}: unknown escape "\\${c}"`);
    return out;
  });
}

function dataOf(value: RegistryValue): string {
  switch (value.type) {
    case "multi_sz":
      return value.data.join("\0");
    case "dword":
      return String(value.data >>> 0);
    default:
      return value.data;
  }
}

function valueOf(type: RegistryValue["type"], data: string, line: number): RegistryValue {
  switch (type) {
    case "sz":
    case "expand_sz":
      return { type, data };
    case "multi_sz":
      return { type, data: data === "" ? [] : data.split("\0") };
    case "dword": {
      if (!/^\d+$/.test(data) || Number(data) > 0xffffffff) {
        throw new HiveTextError(`Line ${line}: bad dword "${data}"`);
      }
      return { type, data: Number(data) };
    }
    case "qword": {
      if (!/^\d+$/.test(data) || BigInt(data) > 0xffffffffffffffffn) {
        throw new HiveTextError(`Line ${line}: bad qword "${data}"`);
      }
      return { type, data };
    }
    case "binary": {
      if (!/^([0-9a-f]{2})*$/i.test(data)) throw new HiveTextError(`Line ${line}: bad hex "${data}"`);
      return { type, data: data.toLowerCase() };
    }
  }
}

/** The loader's input: every value, one per line, in the order given. */
export function formatHiveText(entries: readonly RegistryEntry[]): string {
  return entries
    .map((e) => [normalizeKey(e.key), e.name, e.value.type, dataOf(e.value)].map(escape).join("\t") + "\n")
    .join("");
}

/** The loader's output, or a hand-written file, back to entries. */
export function parseHiveText(text: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  const lines = text.replace(/^﻿/, "").split("\n");
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    if (line === "") return;
    const fields = line.split("\t");
    if (fields.length !== 4) throw new HiveTextError(`Line ${index + 1}: expected 4 fields, found ${fields.length}`);
    const [key, name, type, data] = fields.map((f) => unescape(f, index + 1)) as [string, string, string, string];
    if (!TYPES.has(type as RegistryValue["type"])) throw new HiveTextError(`Line ${index + 1}: unknown type "${type}"`);
    entries.push({ key: normalizeKey(key), name, value: valueOf(type as RegistryValue["type"], data, index + 1) });
  });
  return entries;
}
