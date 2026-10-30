import { assertEquals, assertThrows } from "@std/assert";
import {
  customRunner,
  type DetectFs,
  detectRunners,
  pickRunner,
  prefixFor,
  prefixInitCommand,
  regAddCommand,
  type Runner,
  toHostPath,
  toWinePath,
  wineCommand,
} from "./mod.ts";

/** A fake filesystem from a list of files; folders are implied by the paths. */
function fakeFs(files: Record<string, string>): DetectFs {
  const paths = Object.keys(files);
  return {
    dirs(path) {
      const prefix = `${path}/`;
      const names = paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split("/"));
      return [...new Set(names.filter((parts) => parts.length > 1).map((parts) => parts[0]!))];
    },
    isFile: (path) => path in files,
    readText: (path) => files[path] ?? null,
  };
}

const HOME = "/home/p";

Deno.test("wine paths: host paths go through Z:, and back", () => {
  assertEquals(toWinePath("/home/p/boxes/soul/game"), "Z:\\home\\p\\boxes\\soul\\game");
  assertEquals(toWinePath("C:/Games/Diablo II"), "C:\\Games\\Diablo II");
  assertThrows(() => toWinePath("relative/path"));
  assertEquals(toHostPath("Z:\\home\\p\\save\\"), "/home/p/save");
  assertEquals(toHostPath("Z:\\"), "/");
  assertEquals(toHostPath("C:\\windows", "/pfx/"), "/pfx/dosdevices/c:/windows");
  assertThrows(() => toHostPath("C:\\windows"));
  assertEquals(toHostPath(toWinePath("/a/b c/d")), "/a/b c/d");
});

Deno.test("detection finds system Wine, launcher builds, Steam Proton and umu, system first", () => {
  const fs = fakeFs({
    "/usr/bin/wine": "",
    "/usr/local/bin/umu-run": "",
    [`${HOME}/.local/share/lutris/runners/wine/wine-ge-8-26/bin/wine`]: "",
    [`${HOME}/.local/share/lutris/runners/wine/broken/readme.txt`]: "",
    [`${HOME}/.local/share/bottles/runners/soda-7.0/bin/wine`]: "",
    [`${HOME}/.config/heroic/tools/proton/GE-Proton9-20/files/bin/wine`]: "",
    [`${HOME}/.local/share/Steam/steamapps/libraryfolders.vdf`]: `"libraryfolders" { "0" { "path" "/mnt/games" } }`,
    "/mnt/games/steamapps/common/Proton 9.0/files/bin/wine": "",
    "/mnt/games/steamapps/common/Proton 5.0/dist/bin/wine": "",
    "/mnt/games/steamapps/common/Half-Life/hl": "",
    [`${HOME}/.steam/root/compatibilitytools.d/GE-Proton10-1/files/bin/wine`]: "",
  });
  const runners = detectRunners(fs, { HOME, PATH: "/usr/local/bin:/usr/bin" });
  assertEquals(runners.map((r) => [r.source, r.kind, r.label]), [
    ["system", "wine", "System Wine"],
    ["lutris", "wine", "wine-ge-8-26"],
    ["bottles", "wine", "soda-7.0"],
    ["heroic", "proton", "GE-Proton9-20"],
    ["steam", "proton", "Proton 5.0"],
    ["steam", "proton", "Proton 9.0"],
    ["steam", "proton", "GE-Proton10-1"],
    ["system", "umu", "umu-run"],
  ]);
  assertEquals(runners[0]!.id, "system:/usr/bin/wine");
  assertEquals(runners[5]!.program, "/mnt/games/steamapps/common/Proton 9.0/files/bin/wine");
});

Deno.test("detection drops the same binary reached twice, and finds nothing on a bare machine", () => {
  const fs = fakeFs({ "/usr/bin/wine": "" });
  assertEquals(detectRunners(fs, { HOME, PATH: "/usr/bin:/usr/bin" }).length, 1);
  assertEquals(detectRunners(fakeFs({}), { HOME, PATH: "/usr/bin" }), []);
});

Deno.test("a custom runner can be a binary, a Wine build, a Proton folder or umu-run", () => {
  const fs = fakeFs({
    "/opt/wine-staging/bin/wine": "",
    "/opt/proton/files/bin/wine": "",
    "/opt/umu/umu-run": "",
  });
  assertEquals(customRunner(fs, "/opt/wine-staging/bin/wine")?.kind, "wine");
  assertEquals(customRunner(fs, "/opt/wine-staging/")?.program, "/opt/wine-staging/bin/wine");
  assertEquals(customRunner(fs, "/opt/proton")?.kind, "proton");
  assertEquals(customRunner(fs, "/opt/umu/umu-run")?.kind, "umu");
  assertEquals(customRunner(fs, "/opt/nothing"), null);
});

Deno.test("picking: the stored id, else a custom path, else the first detected", () => {
  const fs = fakeFs({ "/usr/bin/wine": "", "/opt/w/bin/wine": "" });
  const runners = detectRunners(fs, { HOME, PATH: "/usr/bin" });
  assertEquals(pickRunner(fs, runners, "")?.id, "system:/usr/bin/wine");
  assertEquals(pickRunner(fs, runners, "system:/usr/bin/wine")?.id, "system:/usr/bin/wine");
  assertEquals(pickRunner(fs, runners, "/opt/w")?.program, "/opt/w/bin/wine");
  assertEquals(pickRunner(fs, runners, "lutris:/gone/bin/wine")?.id, "system:/usr/bin/wine");
  assertEquals(pickRunner(fs, [], ""), null);
});

const wine: Runner = {
  id: "system:/usr/bin/wine",
  kind: "wine",
  source: "system",
  label: "System Wine",
  program: "/usr/bin/wine",
  protonPath: null,
};

Deno.test("commands: wine runs the exe in Exordium's prefix; umu gets its game id and Proton", () => {
  assertEquals(wineCommand(wine, "/x/wine/pfx", "/b/Game.exe", ["-w", "-direct"]), {
    program: "/usr/bin/wine",
    args: ["/b/Game.exe", "-w", "-direct"],
    env: { WINEPREFIX: "/x/wine/pfx", WINEDEBUG: "-all" },
  });
  const umu: Runner = { ...wine, kind: "umu", program: "/usr/bin/umu-run", protonPath: "GE-Proton" };
  assertEquals(wineCommand(umu, "/pfx", "/b/Game.exe", []).env, {
    WINEPREFIX: "/pfx",
    WINEDEBUG: "-all",
    GAMEID: "umu-default",
    PROTONPATH: "GE-Proton",
  });
  assertEquals(prefixInitCommand(wine, "/pfx")?.args, ["wineboot", "-u"]);
  assertEquals(prefixInitCommand(umu, "/pfx"), null);
  assertEquals(regAddCommand(wine, "/pfx", ["add", "HKCU\\X", "/f"]).args, ["reg", "add", "HKCU\\X", "/f"]);
});

Deno.test("each runner gets its own prefix folder under Exordium's root", () => {
  assertEquals(
    prefixFor("/home/p/.local/share/Exordium/", wine),
    "/home/p/.local/share/Exordium/wine/system-System_Wine",
  );
  assertEquals(
    prefixFor("/r", { ...wine, source: "steam", label: "Proton 9.0" }),
    "/r/wine/steam-Proton_9.0",
  );
});
