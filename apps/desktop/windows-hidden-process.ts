const CREATE_NO_WINDOW = 0x08000000;
const WAIT_TIMEOUT = 0x00000102;
const WAIT_MS = 120_000;

const SYMBOLS = {
  CreateProcessW: {
    parameters: ["pointer", "buffer", "pointer", "pointer", "i32", "u32", "pointer", "pointer", "buffer", "buffer"],
    result: "bool",
  },
  WaitForSingleObject: { parameters: ["pointer", "u32"], result: "u32" },
  CloseHandle: { parameters: ["pointer"], result: "bool" },
} as const;

type Kernel32 = Deno.DynamicLibrary<typeof SYMBOLS>;

let kernel32: Kernel32 | null = null;
let failed = false;

function lib(): Kernel32 | null {
  if (kernel32) return kernel32;
  if (failed) return null;
  try {
    kernel32 = Deno.dlopen("kernel32.dll", SYMBOLS);
    return kernel32;
  } catch {
    failed = true;
    return null;
  }
}

function utf16z(value: string): Uint8Array {
  const buffer = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(buffer.buffer);
  for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value.charCodeAt(i), true);
  return buffer;
}

export function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function spawnAndWait(commandLine: string): boolean {
  const kernel = lib();
  if (!kernel) return false;
  const startup = new Uint8Array(104);
  new DataView(startup.buffer).setUint32(0, 104, true);
  const process = new Uint8Array(24);
  const ok = kernel.symbols.CreateProcessW(
    null,
    utf16z(commandLine),
    null,
    null,
    0,
    CREATE_NO_WINDOW,
    null,
    null,
    startup,
    process,
  );
  if (!ok) return false;
  const view = new DataView(process.buffer);
  const hProcess = Deno.UnsafePointer.create(view.getBigUint64(0, true));
  const hThread = Deno.UnsafePointer.create(view.getBigUint64(8, true));
  try {
    return kernel.symbols.WaitForSingleObject(hProcess, WAIT_MS) !== WAIT_TIMEOUT;
  } finally {
    if (hProcess) kernel.symbols.CloseHandle(hProcess);
    if (hThread) kernel.symbols.CloseHandle(hThread);
  }
}

export async function runPowerShellHidden(script: string): Promise<string | null> {
  if (Deno.build.os !== "windows") return null;
  let scriptPath: string | null = null;
  let outPath: string | null = null;
  let errPath: string | null = null;
  try {
    scriptPath = await Deno.makeTempFile({ prefix: "exordium-", suffix: ".ps1" });
    outPath = await Deno.makeTempFile({ prefix: "exordium-", suffix: ".txt" });
    errPath = `${outPath}.err`;
    await Deno.writeTextFile(
      scriptPath,
      `$ErrorActionPreference = 'Stop'\n` +
        `$OutFile = ${powerShellLiteral(outPath)}\n` +
        `try {\n${script}\n} catch {\n` +
        `  Set-Content -LiteralPath ${powerShellLiteral(errPath)} -Value ($_ | Out-String) -Encoding utf8\n}\n`,
    );
    if (!spawnAndWait(`powershell.exe -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass -File "${scriptPath}"`)) {
      return null;
    }
    const failure = await Deno.readTextFile(errPath).catch(() => null);
    if (failure !== null) {
      console.error(`[hidden powershell] script failed:\n${failure}`);
      return null;
    }
    const text = await Deno.readTextFile(outPath);
    return text.trim() || null;
  } catch {
    return null;
  } finally {
    if (scriptPath) await Deno.remove(scriptPath).catch(() => {});
    if (outPath) await Deno.remove(outPath).catch(() => {});
    if (errPath) await Deno.remove(errPath).catch(() => {});
  }
}
