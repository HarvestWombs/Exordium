/**
 * `exordium-window.dll` (native/window): the desktop window's hook, and running console programs
 * without a console window. Loaded once and shared.
 *
 * Deno can only `dlopen` a real file, and inside the packaged app the DLL is an embedded file, so its
 * bytes are written to Exordium's own folder first. The name carries a hash of the contents: a
 * running older copy keeps its file locked, and a new build must not need to overwrite it.
 */

import { exordiumRoot } from "./paths.ts";

const SYMBOLS = {
  ExordiumWindowAttach: { parameters: ["pointer", "i32", "i32"], result: "i32" },
  // Waits for the program: off Deno's main thread, so a long extraction does not stall the server.
  ExordiumRunHidden: { parameters: ["buffer", "buffer"], result: "i32", nonblocking: true },
} as const;

export type Native = Deno.DynamicLibrary<typeof SYMBOLS>;

let loading: Promise<Native | null> | null = null;

export function nativeLibrary(): Promise<Native | null> {
  loading ??= (async () => {
    if (Deno.build.os !== "windows") return null;
    try {
      const bytes = await Deno.readFile(new URL("../../native/window/build/exordium-window.dll", import.meta.url));
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const tag = [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const folder = `${exordiumRoot}/bin`.replace(/\//g, "\\");
      const path = `${folder}\\exordium-window-${tag}.dll`;
      await Deno.mkdir(folder, { recursive: true });
      const existing = await Deno.stat(path).catch(() => null);
      if (existing?.size !== bytes.length) await Deno.writeFile(path, bytes);
      return Deno.dlopen(path, SYMBOLS);
    } catch {
      return null;
    }
  })();
  return loading;
}

function wide(text: string): Uint8Array {
  const buffer = new Uint8Array((text.length + 1) * 2);
  const view = new DataView(buffer.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return buffer;
}

/** One argument as CommandLineToArgvW reads it back: quoted when needed, quotes and trailing backslashes escaped. */
export function quoteArgument(value: string): string {
  if (value !== "" && !/[\s"]/.test(value)) return value;
  let out = '"';
  let backslashes = 0;
  for (const char of value) {
    if (char === "\\") {
      backslashes++;
      continue;
    }
    if (char === '"') out += "\\".repeat(backslashes * 2 + 1) + '"';
    else out += "\\".repeat(backslashes) + char;
    backslashes = 0;
  }
  return `${out}${"\\".repeat(backslashes * 2)}"`;
}

/**
 * Runs a console program and resolves to its exit code, with no console window. Without the DLL
 * (it failed to load, or not Windows) it falls back to Deno.Command, with no stdio: the packaged app
 * has no console handles to inherit.
 */
export async function runHidden(program: string, args: readonly string[], cwd = ""): Promise<number> {
  const native = await nativeLibrary();
  if (native) {
    const commandLine = [program, ...args].map(quoteArgument).join(" ");
    return await native.symbols.ExordiumRunHidden(wide(commandLine), wide(cwd));
  }
  const { code } = await new Deno.Command(program, {
    args: [...args],
    ...(cwd ? { cwd } : {}),
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).output();
  return code;
}
