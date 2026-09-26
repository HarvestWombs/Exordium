/**
 * Packages the desktop app with the canary `deno`, the same way Excelsior does.
 *
 * Stable deno 2.9.4 packages laufey v0.5.0, which crashes at window creation on Windows
 * (0xC0000409 in ucrtbase) right after the server binds its port — even for an empty app.
 * Canary packages v0.6.1, which works. The binary is resolved here rather than through PATH
 * because `deno task` under Git Bash can't spawn a PATH-resolved `deno-canary`.
 *
 * Install the canary binary once:
 *   deno upgrade canary --output ~/.deno/bin/deno-canary.exe
 */

const PACKAGE_ARGS = [
  "desktop",
  "-A",
  "--include",
  "dist",
  "--include",
  "../../native/loader/build/exordium-game.exe",
  "server.ts",
];

const isWindows = Deno.build.os === "windows";
const exe = isWindows ? ".exe" : "";
const here = import.meta.dirname ?? Deno.cwd();

function candidatePaths(): string[] {
  const paths: string[] = [];
  const override = Deno.env.get("DENO_CANARY");
  if (override) paths.push(override);
  const home = Deno.env.get(isWindows ? "USERPROFILE" : "HOME");
  if (home) paths.push(`${home}/.deno/bin/deno-canary${exe}`);
  return paths;
}

function findCanary(): string {
  for (const path of candidatePaths()) {
    try {
      if (Deno.statSync(path).isFile) return path;
    } catch {
      continue;
    }
  }
  return "deno-canary";
}

let code: number;
try {
  ({ code } = await new Deno.Command(findCanary(), {
    args: PACKAGE_ARGS,
    cwd: here,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).output());
} catch (error) {
  console.error(
    [
      "",
      `Could not run the canary deno (tried: ${candidatePaths().join(", ") || "PATH only"}).`,
      `  ${error instanceof Error ? error.message : String(error)}`,
      "",
      "Install it once:  deno upgrade canary --output ~/.deno/bin/deno-canary.exe",
      "Or point DENO_CANARY at an existing build.",
      "",
    ].join("\n"),
  );
  Deno.exit(1);
}
if (code !== 0) {
  console.error("\nPackaging failed. If it mentions access denied, Exordium is still running — close it first.");
  Deno.exit(code);
}

try {
  const version = (await Deno.readTextFile(`${here}/Exordium/.downloaded`)).trim();
  console.log(`\nPackaged with laufey ${version}: ${here}/Exordium/Exordium${exe}`);
} catch {
  // Layout differs on this platform; the package itself already succeeded.
}
