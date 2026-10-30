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

/** The per-user data folder: `%LOCALAPPDATA%`, `~/Library/Application Support`, or `$XDG_DATA_HOME`. */
export function userDataFolder(): string {
  const home = Deno.env.get("HOME");
  if (Deno.build.os === "windows") return slash(Deno.env.get("LOCALAPPDATA") ?? Deno.cwd());
  if (Deno.build.os === "darwin") return home ? `${slash(home)}/Library/Application Support` : Deno.cwd();
  const xdg = Deno.env.get("XDG_DATA_HOME");
  if (xdg) return slash(xdg);
  return home ? `${slash(home)}/.local/share` : Deno.cwd();
}

function fallbackRoot(): string {
  return `${userDataFolder()}/Exordium`;
}

export function resolveExordiumRoot(): string {
  const override = Deno.env.get("EXORDIUM_HOME")?.trim();
  if (override) return slash(override);

  const preferred = isPackagedExe() ? parent(Deno.execPath()) : slash(`${Deno.cwd()}/.exordium`);
  if (writable(preferred)) return preferred;

  return fallbackRoot();
}

export const exordiumRoot = resolveExordiumRoot();
