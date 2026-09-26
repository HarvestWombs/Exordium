/**
 * Reading `.reg` files, as `reg export` writes them (and D2SE ships them, e.g. `Standard_Realm.reg`).
 *
 * Handles strings, `dword:`, and the `hex` forms Diablo II's keys use: `hex:` binary, `hex(2):`
 * expandable string, `hex(7):` string list and `hex(b):` qword, all UTF-16LE where text. Other
 * `hex(n)` types cannot be represented as a `RegistryValue` and are reported, not guessed.
 */

import { normalizeKey, type RegistryEntry, type RegistryTombstone, type RegistryValue } from "@exordium/layers";

export interface RegFile {
  entries: (RegistryEntry | RegistryTombstone)[];
  /** Values that were skipped, with why. */
  skipped: string[];
}

export class RegFileError extends Error {
  override name = "RegFileError";
}

/** Decodes a `.reg` file's bytes: UTF-16LE with a BOM as `reg export` writes, else UTF-8. */
export function decodeRegFile(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  return new TextDecoder().decode(bytes).replace(/^﻿/, "");
}

/** Logical lines: a trailing backslash continues onto the next line. */
function logicalLines(text: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const raw = text.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    const start = i + 1;
    let line = raw[i]!;
    while (line.endsWith("\\") && !isQuotedValue(line) && i + 1 < raw.length) {
      line = line.slice(0, -1) + raw[++i]!.trimStart();
    }
    out.push({ text: line, line: start });
  }
  return out;
}

/** A string value line ends in a quote; its trailing backslash would be inside the string. */
function isQuotedValue(line: string): boolean {
  return /^(@|"(?:[^"\\]|\\.)*")="/.test(line);
}

function readQuoted(text: string, from: number, line: number): { value: string; end: number } {
  if (text[from] !== '"') throw new RegFileError(`Line ${line}: expected a quoted string`);
  let value = "";
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\") {
      value += text[++i] ?? "";
      continue;
    }
    if (c === '"') return { value, end: i + 1 };
    value += c;
  }
  throw new RegFileError(`Line ${line}: unterminated string`);
}

function hexBytes(list: string, line: number): Uint8Array {
  const parts = list.split(",").map((p) => p.trim()).filter((p) => p !== "");
  const bytes = new Uint8Array(parts.length);
  parts.forEach((p, i) => {
    if (!/^[0-9a-f]{2}$/i.test(p)) throw new RegFileError(`Line ${line}: bad hex byte "${p}"`);
    bytes[i] = parseInt(p, 16);
  });
  return bytes;
}

function utf16(bytes: Uint8Array): string {
  return new TextDecoder("utf-16le").decode(bytes);
}

function parseData(data: string, line: number): RegistryValue | string {
  if (data.startsWith('"')) return { type: "sz", data: readQuoted(data, 0, line).value };
  const dword = /^dword:([0-9a-f]{1,8})$/i.exec(data);
  if (dword) return { type: "dword", data: parseInt(dword[1]!, 16) >>> 0 };
  const hex = /^hex(?:\(([0-9a-f]+)\))?:(.*)$/is.exec(data);
  if (!hex) throw new RegFileError(`Line ${line}: unrecognised value "${data.slice(0, 40)}"`);
  const kind = hex[1] === undefined ? 3 : parseInt(hex[1], 16);
  const bytes = hexBytes(hex[2]!, line);
  switch (kind) {
    case 3:
      return { type: "binary", data: [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("") };
    case 2:
      return { type: "expand_sz", data: utf16(bytes).replace(/\0+$/, "") };
    case 7: {
      const items = utf16(bytes).replace(/\0+$/, "");
      return { type: "multi_sz", data: items === "" ? [] : items.split("\0") };
    }
    case 0xb: {
      if (bytes.length !== 8) throw new RegFileError(`Line ${line}: a qword needs 8 bytes`);
      return { type: "qword", data: new DataView(bytes.buffer).getBigUint64(0, true).toString() };
    }
    case 4: {
      if (bytes.length !== 4) throw new RegFileError(`Line ${line}: a dword needs 4 bytes`);
      return { type: "dword", data: new DataView(bytes.buffer).getUint32(0, true) };
    }
    default:
      return `registry type ${kind} has no RegistryValue form`;
  }
}

export function parseRegFile(text: string): RegFile {
  const entries: (RegistryEntry | RegistryTombstone)[] = [];
  const skipped: string[] = [];
  let key: string | null = null;
  for (const { text: raw, line } of logicalLines(text)) {
    const t = raw.trim();
    if (t === "" || t.startsWith(";") || /^(Windows Registry Editor|REGEDIT4)/.test(t)) continue;
    if (t.startsWith("[")) {
      if (!t.endsWith("]")) throw new RegFileError(`Line ${line}: unterminated key`);
      const body = t.slice(1, -1);
      if (body.startsWith("-")) {
        entries.push({ key: normalizeKey(body.slice(1)), deleted: true });
        key = null;
      } else {
        key = normalizeKey(body);
      }
      continue;
    }
    if (key === null) throw new RegFileError(`Line ${line}: a value outside any key`);
    let name: string;
    let rest: string;
    if (t.startsWith("@=")) {
      name = "";
      rest = t.slice(2);
    } else {
      const quoted = readQuoted(t, 0, line);
      if (t[quoted.end] !== "=") throw new RegFileError(`Line ${line}: expected "=" after the value name`);
      name = quoted.value;
      rest = t.slice(quoted.end + 1);
    }
    if (rest === "-") {
      entries.push({ key, name, deleted: true });
      continue;
    }
    const value = parseData(rest, line);
    if (typeof value === "string") skipped.push(`${key} "${name}": ${value}`);
    else entries.push({ key, name, value });
  }
  return { entries, skipped };
}
