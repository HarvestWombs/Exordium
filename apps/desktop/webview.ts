/**
 * Keeping the window's WebView2 alive.
 *
 * Found 2026-10-02: after about two days open, through many sleeps, the window went white for good
 * while Exordium itself (the window and this server) kept running. Reproduced by killing the
 * WebView2 GPU process: Chromium restarts it four times, and on the fifth crash it shuts the whole
 * WebView2 browser down. Nothing in the packaged app recreates it, so the page is gone. A sleep and
 * resume can crash the GPU process (a driver reset), so two days of sleeps reach the limit.
 *
 * Two layers:
 * - A watch on the WebView2 processes: if they all disappear, Exordium logs it and starts again.
 *   Games are unaffected; the launcher keeps their sessions.
 * - `--disable-gpu-process-crash-limit`, passed through `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`:
 *   Chromium then restarts the GPU process every time; with it, ten GPU crashes in a row left the
 *   page drawing. It has to be in the environment before the process starts, because laufey
 *   creates the WebView2 alongside the server (34 ms before its first line ran), so setting it from
 *   here is too late. The restart passes it; a fresh start will get it from the updater's stub
 *   (vault: Architecture/Updater.md).
 */

import { appLog } from "./applog.ts";

/** The environment a new Exordium process needs for a WebView2 that survives GPU crashes. */
export function hardenedWebViewEnv(): Record<string, string> {
  const name = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS";
  const flag = "--disable-gpu-process-crash-limit";
  const current = Deno.env.get(name) ?? "";
  return { [name]: current.includes(flag) ? current : `${current} ${flag}`.trim() };
}

const KERNEL32 = {
  CreateProcessW: {
    parameters: ["buffer", "buffer", "pointer", "pointer", "i32", "u32", "pointer", "buffer", "buffer", "buffer"],
    result: "i32",
  },
  CreateToolhelp32Snapshot: { parameters: ["u32", "u32"], result: "pointer" },
  Process32FirstW: { parameters: ["pointer", "buffer"], result: "i32" },
  Process32NextW: { parameters: ["pointer", "buffer"], result: "i32" },
  CloseHandle: { parameters: ["pointer"], result: "i32" },
} as const;

const TH32CS_SNAPPROCESS = 0x2;
/** PROCESSENTRY32W on x64: dwSize at 0, th32ProcessID at 8, th32ParentProcessID at 32, szExeFile at 44. */
const ENTRY_SIZE = 568;

let kernel32: Deno.DynamicLibrary<typeof KERNEL32> | null = null;

/** How many `msedgewebview2.exe` processes `pid` started directly. */
export function webViewChildren(pid: number): number {
  kernel32 ??= Deno.dlopen("kernel32.dll", KERNEL32);
  const snapshot = kernel32.symbols.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (!snapshot || Deno.UnsafePointer.value(snapshot) === -1n) return -1;
  try {
    const entry = new Uint8Array(ENTRY_SIZE);
    const view = new DataView(entry.buffer);
    view.setUint32(0, ENTRY_SIZE, true);
    let count = 0;
    let more = kernel32.symbols.Process32FirstW(snapshot, entry);
    while (more) {
      if (view.getUint32(32, true) === pid) {
        const name = new TextDecoder("utf-16le").decode(entry.subarray(44, 44 + 520)).replace(/\0.*$/s, "");
        if (name.toLowerCase() === "msedgewebview2.exe") count += 1;
      }
      more = kernel32.symbols.Process32NextW(snapshot, entry);
    }
    return count;
  } finally {
    kernel32.symbols.CloseHandle(snapshot);
  }
}

const CREATE_BREAKAWAY_FROM_JOB = 0x01000000;
/** STARTUPINFOW and PROCESS_INFORMATION on x64. */
const STARTUPINFO_SIZE = 104;
const PROCESS_INFORMATION_SIZE = 24;

function wide(text: string): Uint8Array {
  const bytes = new Uint8Array((text.length + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return bytes;
}

/**
 * Starts `exe` as a process of its own, inheriting this one's environment; false when Windows
 * refused. A replacement started with `Deno.Command` ended together with the Exordium it replaced
 * (2026-10-02); one started here with `CreateProcessW` outlives it. The packaged app runs inside a
 * job (`IsProcessInJob`) that refuses breaking away, so the second, plain attempt is the one that
 * normally succeeds.
 */
export function startDetached(exe: string, args: readonly string[], cwd: string): boolean {
  if (Deno.build.os !== "windows") {
    // No jobs elsewhere: a plain spawn with no stdio outlives this process.
    try {
      new Deno.Command(exe, { args: [...args], cwd, stdin: "null", stdout: "null", stderr: "null" }).spawn();
      return true;
    } catch {
      return false;
    }
  }
  kernel32 ??= Deno.dlopen("kernel32.dll", KERNEL32);
  const quote = (arg: string) => /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
  const commandLine = wide([exe, ...args].map(quote).join(" "));
  for (const flags of [CREATE_BREAKAWAY_FROM_JOB, 0]) {
    const startup = new Uint8Array(STARTUPINFO_SIZE);
    new DataView(startup.buffer).setUint32(0, STARTUPINFO_SIZE, true);
    const info = new Uint8Array(PROCESS_INFORMATION_SIZE);
    const ok = kernel32.symbols.CreateProcessW(
      wide(exe),
      commandLine,
      null,
      null,
      0,
      flags,
      null,
      wide(cwd),
      startup,
      info,
    );
    if (!ok) continue;
    const view = new DataView(info.buffer);
    for (const offset of [0, 8]) {
      const handle = Deno.UnsafePointer.create(view.getBigUint64(offset, true));
      if (handle) kernel32.symbols.CloseHandle(handle);
    }
    if (flags === 0) appLog("info", "started inside this process's job (breaking away is not allowed there)");
    return true;
  }
  return false;
}

/**
 * Checks every 15 s that this process still has its WebView2. It arms only once one has been seen,
 * so a dev server (whose page is in a browser) never triggers it. When the WebView2 has been gone
 * for two checks running, `restart` is called once.
 */
export function watchWebView(restart: () => void): void {
  // WebView2 is the Windows shell's; elsewhere there are no msedgewebview2 processes to count.
  if (Deno.build.os !== "windows") return;
  let seen = false;
  let missing = 0;
  const timer = setInterval(() => {
    const count = webViewChildren(Deno.pid);
    if (count < 0) return;
    if (count > 0) {
      seen = true;
      missing = 0;
      return;
    }
    if (!seen) return;
    missing += 1;
    if (missing < 2) return;
    clearInterval(timer);
    appLog("error", "the window's WebView2 has exited (no msedgewebview2 processes left); restarting Exordium");
    restart();
  }, 15_000);
}
