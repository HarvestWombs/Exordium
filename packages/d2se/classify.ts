/**
 * Which files in a D2SE folder become what, on import.
 *
 * A mod folder on a modder's own machine holds a lot besides the mod: saves, logs, D2SE's own
 * settings, backups, screenshots. The rules below decide the obvious cases and leave everything
 * else in the mod — Exordium does not judge what a mod needs, and the content-addressed library
 * stores a duplicate once. What is excluded is always reported with a reason, and the per-folder
 * size summary is there so a user can exclude a dev folder themselves.
 *
 * - `layer`     — part of the core or mod as shipped.
 * - `writable`  — the player's own files: saves, which seed the profile's writable layer.
 * - `language`  — inside a `Language_<code>` folder, which D2SE applies only for the chosen language.
 * - `excluded`  — not imported, with the reason.
 */

export type Classification =
  | { kind: "layer" }
  | { kind: "writable" }
  | { kind: "language"; language: string; path: string }
  | { kind: "excluded"; reason: string };

export type FolderKind = "core" | "mod";

const LOGS = /^(.*\.log|debuglog.*\.txt|bnetlog\.txt)$/i;

/**
 * `path` is relative to the core or mod folder, `/`-separated. Folder names are matched ignoring
 * case, as Windows does.
 */
export function classify(kind: FolderKind, path: string): Classification {
  const segments = path.split("/");
  const top = segments[0]!.toLowerCase();
  const atRoot = segments.length === 1;
  const name = segments[segments.length - 1]!;

  const language = /^language_(.+)$/i.exec(segments[0]!);
  if (language && !atRoot) {
    return { kind: "language", language: language[1]!.toUpperCase(), path: segments.slice(1).join("/") };
  }

  if (top === "save") {
    // A mod's saves are the player's characters; a core's are from playing it unmodded, which no
    // profile owns — kept where they are rather than guessed into one.
    return kind === "mod"
      ? { kind: "writable" }
      : { kind: "excluded", reason: "saves from unmodded play; left in place" };
  }

  if (atRoot) {
    if (LOGS.test(name)) return { kind: "excluded", reason: "a log the game or a plugin writes" };
    if (/^d2se_setup\.ini$/i.test(name)) return { kind: "excluded", reason: "D2SE's settings; read into the profile" };
    if (kind === "core") {
      if (/\.(7z|zip)$/i.test(name)) return { kind: "excluded", reason: "D2SE's archived copy of the core" };
      if (/^d2xylauncher\.exe$/i.test(name)) return { kind: "excluded", reason: "D2SE's own tool" };
      if (/\.idb$/i.test(name)) return { kind: "excluded", reason: "a disassembler database, not game data" };
      if (/\.(jpe?g|png)$/i.test(name)) return { kind: "excluded", reason: "a screenshot" };
    }
  }

  if (!atRoot) {
    if (["crashdump", "debug logs", ".excelsior-backups"].includes(top)) {
      return { kind: "excluded", reason: `"${segments[0]}" is written by tools, not shipped` };
    }
    if (kind === "core" && ["backup", "documentation"].includes(top)) {
      return { kind: "excluded", reason: `"${segments[0]}" is not part of the core` };
    }
  }

  return { kind: "layer" };
}
