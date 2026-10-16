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
  "--include",
  "../../native/window/build/exordium-window.dll",
  "--include",
  "assets/exordium.ico",
  "server.ts",
];

const isWindows = Deno.build.os === "windows";
const exe = isWindows ? ".exe" : "";
const here = import.meta.dirname ?? Deno.cwd();
const nativeSidecars = ["exordium-window.dll"] as const;
const SEVEN_ZIP_FILES = ["7z.exe", "7z.dll", "License.txt"] as const;

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
  await Deno.mkdir(`${here}/Exordium/native`, { recursive: true });
  for (const stale of ["exordium-launch.exe", "exordium-hook.dll", "exordium-presence.exe"]) {
    await Deno.remove(`${here}/Exordium/native/${stale}`).catch(() => {});
  }
  for (const name of nativeSidecars) {
    await Deno.copyFile(`../../native/window/build/${name}`, `${here}/Exordium/native/${name}`);
  }
  // The 7-Zip Exordium unpacks every archive with (install.ts): run as a program, so a file on disk.
  await Deno.mkdir(`${here}/Exordium/native/7zip`, { recursive: true });
  for (const name of SEVEN_ZIP_FILES) {
    await Deno.copyFile(`../../native/7zip/${name}`, `${here}/Exordium/native/7zip/${name}`);
  }
  console.log(`Copied ${nativeSidecars.length} native sidecars and 7-Zip into Exordium/native.`);
  // GPL-3.0 has every copy carry the licence, and NOTICE holds the attribution terms beside it.
  await Deno.copyFile("../../LICENSE", `${here}/Exordium/LICENSE.txt`);
  await Deno.copyFile("../../NOTICE", `${here}/Exordium/NOTICE.txt`);
} catch (error) {
  console.error(`Could not copy native sidecars: ${error instanceof Error ? error.message : String(error)}`);
  Deno.exit(1);
}

// The launcher is laufey's prebuilt exe, so the icon is written into it afterwards (embed-icon.ts).
// Never fatal: the window still sets its own icon at runtime; only Explorer and shortcuts miss it.
if (isWindows) {
  try {
    const { embedIcon } = await import("./embed-icon.ts");
    const count = embedIcon(`${here}/Exordium/Exordium.exe`, `${here}/assets/exordium.ico`);
    console.log(`Embedded ${count} icon sizes into Exordium.exe.`);
  } catch (error) {
    console.warn(`Could not embed the icon: ${error instanceof Error ? error.message : String(error)}`);
  }
  // `deno desktop` also drops AppIcon.ico beside the exe (from deno.json's desktop.app.icons). Nothing
  // reads it: the exe carries the icon, and the window sets its own (window.ts). Releases never ship it.
  await Deno.remove(`${here}/Exordium/AppIcon.ico`).catch(() => {});
}

try {
  const version = (await Deno.readTextFile(`${here}/Exordium/.downloaded`)).trim();
  console.log(`\nPackaged with laufey ${version}: ${here}/Exordium/Exordium${exe}`);
} catch {
  // Layout differs on this platform; the package itself already succeeded.
}
