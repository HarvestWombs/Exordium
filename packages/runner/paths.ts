/**
 * Paths as the game sees them under Wine. A new prefix maps `Z:` to the host's `/`, so any host path
 * is reachable as `Z:\` plus the path with backslashes; that is what the loader config and the
 * registry's `InstallPath`/`Save Path` must hold, since the 32-bit loader opens them itself.
 */

/** `/home/p/boxes/soul` → `Z:\home\p\boxes\soul`. A path that already has a drive is only re-slashed. */
export function toWinePath(hostPath: string): string {
  if (/^[A-Za-z]:[\\/]/.test(hostPath)) return hostPath.replace(/\//g, "\\");
  if (!hostPath.startsWith("/")) throw new Error(`Not an absolute host path: ${hostPath}`);
  return `Z:${hostPath.replace(/\/+/g, "\\")}`;
}

/**
 * `Z:\home\p\x` → `/home/p/x`. Other drives resolve through the prefix's `dosdevices` folder, where
 * Wine keeps each drive as a link (`c:` → `../drive_c`); without a prefix they cannot be resolved.
 */
export function toHostPath(winePath: string, prefix?: string): string {
  const match = /^([A-Za-z]):(?:[\\/](.*))?$/.exec(winePath);
  if (!match) throw new Error(`Not a Wine path with a drive: ${winePath}`);
  const drive = match[1]!.toLowerCase();
  const rest = (match[2] ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (drive === "z") return `/${rest}`;
  if (!prefix) throw new Error(`Drive ${drive.toUpperCase()}: needs the prefix to resolve.`);
  return `${prefix.replace(/\/+$/, "")}/dosdevices/${drive}:${rest ? `/${rest}` : ""}`;
}
