/**
 * D2SE's ini files, read the way D2SE writes them.
 *
 * Sections in brackets, `key=value` lines, whole-line comments starting `#` or `;`. Section and key
 * names are compared ignoring case. A key repeated in a section keeps its last value. Values are
 * trimmed but otherwise untouched — `ModReadme=documentation\readme.txt` keeps its backslash, and
 * `ModMinorVersion=.0` its dot.
 *
 * D2SE ends every file it writes with `[END]` / `endoffile=4711` and treats a file without it as
 * corrupt. That marker is reported (`intact`), not required: a hand-edited file that lost it is
 * still worth reading.
 */

export interface IniSection {
  /** As spelled in the file; `""` for keys before any section. */
  name: string;
  entries: Map<string, { key: string; value: string }>;
}

export interface Ini {
  sections: Map<string, IniSection>;
  /** Whether the file ends with D2SE's `endoffile=4711` integrity marker. */
  intact: boolean;
}

/** D2SE's ini files are ANSI; a BOM, if some editor added one, is dropped. */
export function decodeIni(bytes: Uint8Array): string {
  return new TextDecoder("windows-1252").decode(bytes).replace(/^﻿|^ï»¿/, "");
}

export function parseIni(text: string): Ini {
  const sections = new Map<string, IniSection>();
  let current: IniSection = { name: "", entries: new Map() };
  sections.set("", current);
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const header = /^\[(.*)\]$/.exec(line);
    if (header) {
      const name = header[1]!.trim();
      const existing = sections.get(name.toLowerCase());
      current = existing ?? { name, entries: new Map() };
      if (!existing) sections.set(name.toLowerCase(), current);
      continue;
    }
    const at = line.indexOf("=");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    current.entries.set(key.toLowerCase(), { key, value: line.slice(at + 1).trim() });
  }
  const end = sections.get("end");
  return { sections, intact: end?.entries.get("endoffile")?.value === "4711" };
}

/** A value, or `null` when the section or key is absent. An empty value is `""`, not `null`. */
export function iniValue(ini: Ini, section: string, key: string): string | null {
  return ini.sections.get(section.toLowerCase())?.entries.get(key.toLowerCase())?.value ?? null;
}

/** A value, or `null` when absent or empty — how D2SE treats `RealmGateway=` and `ModMPQ2=`. */
export function iniText(ini: Ini, section: string, key: string): string | null {
  const value = iniValue(ini, section, key);
  return value === null || value === "" ? null : value;
}

/** `1` is on, `0` is off; anything else — absent, empty, unreadable — is the stated default. */
export function iniFlag(ini: Ini, section: string, key: string, fallback: boolean): boolean {
  const value = iniValue(ini, section, key);
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

export function iniNumber(ini: Ini, section: string, key: string): number | null {
  const value = iniValue(ini, section, key);
  if (value === null || !/^-?\d+$/.test(value)) return null;
  return Number(value);
}
