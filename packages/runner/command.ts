import type { Runner, RunnerCommand } from "./types.ts";

/**
 * The environment every run gets. `WINEDEBUG=-all` because Wine's default trace channels write to
 * stderr on every frame of some renderers, and nothing reads it. `WINEDLLOVERRIDES` is left alone:
 * the box holds the DLLs the mod ships (ddraw, glide3x), and Wine prefers a DLL beside the exe.
 */
function baseEnv(runner: Runner, prefix: string): Record<string, string> {
  const env: Record<string, string> = { WINEPREFIX: prefix, WINEDEBUG: "-all" };
  if (runner.kind === "umu") {
    env.GAMEID = "umu-default";
    if (runner.protonPath) env.PROTONPATH = runner.protonPath;
  }
  return env;
}

/** Runs `exe` (a host path) with `args` in `prefix`. Wine takes a host path for the program itself. */
export function wineCommand(runner: Runner, prefix: string, exe: string, args: readonly string[]): RunnerCommand {
  return { program: runner.program, args: [exe, ...args], env: baseEnv(runner, prefix) };
}

/**
 * Creates or updates the prefix. umu-run does this itself on its first run, so it gets none: the
 * caller skips the step when this returns null.
 */
export function prefixInitCommand(runner: Runner, prefix: string): RunnerCommand | null {
  if (runner.kind === "umu") return null;
  return { program: runner.program, args: ["wineboot", "-u"], env: baseEnv(runner, prefix) };
}

/** `reg add` inside the prefix: the 1.14 path's registry, which goes to the prefix's own HKCU. */
export function regAddCommand(runner: Runner, prefix: string, regArgs: readonly string[]): RunnerCommand {
  return { program: runner.program, args: ["reg", ...regArgs], env: baseEnv(runner, prefix) };
}

/** The prefix folder for `runner`: one per runner, since Wine versions upgrade a prefix one way. */
export function prefixFor(root: string, runner: Runner): string {
  const name = `${runner.source}-${runner.label}`.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  return `${root.replace(/\/+$/, "")}/wine/${name}`;
}
