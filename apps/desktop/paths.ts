/**
 * Where Exordium keeps its own state. Release builds are portable-first: files live beside
 * Exordium.exe. Development runs keep them in `.exordium/` under the repo. AppData is only a
 * fallback when the preferred folder is not writable, or when EXORDIUM_HOME explicitly points there.
 */

function slash(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function parent(path: string): string {
  return slash(path).replace(/\/[^/]*$/, "");
}

export function isPackagedExe(): boolean {
  return !/(^|[\\/])deno(\.exe)?$/i.test(Deno.execPath());
}

function writable(folder: string): boolean {
  try {
    Deno.mkdirSync(folder, { recursive: true });
    const probe = `${folder}/.exordium-write-${crypto.randomUUID()}`;
    Deno.writeTextFileSync(probe, "");
    Deno.removeSync(probe);
    return true;
  } catch {
    return false;
  }
}

function fallbackRoot(): string {
  return slash(`${Deno.env.get("LOCALAPPDATA") ?? Deno.cwd()}/Exordium`);
}

export function resolveExordiumRoot(): string {
  const override = Deno.env.get("EXORDIUM_HOME")?.trim();
  if (override) return slash(override);

  const preferred = isPackagedExe() ? parent(Deno.execPath()) : slash(`${Deno.cwd()}/.exordium`);
  if (writable(preferred)) return preferred;

  return fallbackRoot();
}

export const exordiumRoot = resolveExordiumRoot();
