/**
 * What runs the 32-bit game off Windows. Vault: `Architecture/Wine.md`.
 *
 * Every runner comes down to a Wine binary and an environment, except umu-run, which wraps Proton in
 * Steam's container and is given the program to run instead. The prefix is never the runner's: it is
 * Exordium's own, inside its root, so a launch writes nothing the user's other Wine setups can see.
 */

/** `wine`: a Wine build's `bin/wine`. `proton`: Proton's own `files/bin/wine`, run without Steam. */
export type RunnerKind = "wine" | "proton" | "umu";

/** Where a runner was found. `custom` is a path the user typed. */
export type RunnerSource = "system" | "lutris" | "bottles" | "heroic" | "steam" | "custom";

export interface Runner {
  /** Stable across scans: `<source>:<path>`. Settings store this. */
  id: string;
  kind: RunnerKind;
  source: RunnerSource;
  /** What the user sees: the build's folder name, e.g. `wine-ge-8-26` or `Proton 9.0`. */
  label: string;
  /** The program started: `bin/wine` for wine and proton, `umu-run` for umu. */
  program: string;
  /** For umu: the Proton folder to use (`PROTONPATH`), or null for umu's default. */
  protonPath: string | null;
}

/** A program to start: what `Deno.Command` takes. */
export interface RunnerCommand {
  program: string;
  args: string[];
  env: Record<string, string>;
}
