/**
 * Packages the desktop app with the `deno` running this script.
 *
 * The version picks the laufey build that goes in the package: stable 2.9.4 brings v0.5.0, which
 * crashes at window creation on Windows (0xC0000409 in ucrtbase) right after the server binds its
 * port, even for an empty app, while stable 2.9.8 brings v0.7.0, which works. An older deno would
 * build without complaint and give an exe that dies on launch, so it is refused here.
 */

const MINIMUM_DENO = [2, 9, 8];

const PACKAGE_ARGS = [
  "desktop",
  "-A",
  "--include",
  "dist",
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

function olderThanMinimum(version: string): boolean {
  const parts = version.split(/[.+-]/).slice(0, 3).map(Number);
  for (const [index, minimum] of MINIMUM_DENO.entries()) {
    const part = parts[index] ?? 0;
    if (part !== minimum) return part < minimum;
  }
  return false;
}

if (olderThanMinimum(Deno.version.deno)) {
  console.error(
    `Packaging needs deno ${MINIMUM_DENO.join(".")} or newer; this is ${Deno.version.deno}. Run: deno upgrade`,
  );
  Deno.exit(1);
}

const { code } = await new Deno.Command(Deno.execPath(), {
  args: PACKAGE_ARGS,
  cwd: here,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).output();
if (code !== 0) {
  console.error("\nPackaging failed. If it mentions access denied, Exordium is still running — close it first.");
  Deno.exit(code);
}

try {
  await Deno.mkdir(`${here}/Exordium/native`, { recursive: true });
  for (const name of nativeSidecars) {
    await Deno.copyFile(`../../native/window/build/${name}`, `${here}/Exordium/native/${name}`);
  }
  // The 7-Zip Exordium unpacks every archive with (install.ts): run as a program, so a file on disk.
  await Deno.mkdir(`${here}/Exordium/native/7zip`, { recursive: true });
  for (const name of SEVEN_ZIP_FILES) {
    await Deno.copyFile(`../../native/7zip/${name}`, `${here}/Exordium/native/7zip/${name}`);
  }
  // The loader as each core's Game.exe (stamp-game.ts), which boxes symlink: files on disk.
  await Deno.remove(`${here}/Exordium/native/game`, { recursive: true }).catch(() => {});
  let games = 0;
  for await (const core of Deno.readDir("../../native/loader/build/game")) {
    if (!core.isDirectory) continue;
    await Deno.mkdir(`${here}/Exordium/native/game/${core.name}`, { recursive: true });
    await Deno.copyFile(
      `../../native/loader/build/game/${core.name}/Game.exe`,
      `${here}/Exordium/native/game/${core.name}/Game.exe`,
    );
    games++;
  }
  console.log(
    `Copied ${nativeSidecars.length} native sidecars, 7-Zip and ${games} loader Game.exe copies into Exordium/native.`,
  );
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
