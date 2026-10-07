# Exordium native loader

`exordium-game.exe` is the 32-bit process that runs inside a realised box.

This first version is a diagnostic loader. It proves the process architecture and DLL loading boundary before the D2SE
MPQ and `D2Launch` game-loop handoff are filled in:

- starts as a 32-bit Windows executable;
- runs from the box's `game` directory;
- reads `exordium-loader.json`;
- attempts the private registry hive override when a hive is provided;
- loads game DLLs and plugin DLLs in plan order;
- calls plugin init exports when configured;
- resolves `D2Launch.dll!QueryInterface` and logs whether the handoff surface is present.

Startup follows `Game.exe` / D2SE order: `FOG_SetLogPrefix`, `FOG_InitErrorMgr`, MPQ config and async data, the archive
stack, then D2Win window and sprite startup. Those exports are versioned. D2SE's `FUN_00401a40` resolves them from
tables indexed as `functionIndex * 0x28 + coreIndex * 4`; for example 1.10f uses D2Win `#10000` / `#10001`, while 1.13c
uses `#10142` / `#10052`.

The D2SE core slot order is `1.07`, `1.08`, `1.09b`, `1.09d`, `1.10f`, `1.11b`, `1.12a`, `1.13c`. The last two table
slots are empty. Exordium currently maps the shared 1.07-1.10f ABI plus the separate 1.11b, 1.12a and 1.13c entries.
1.14 is not in this table: that runtime folded the classic DLLs into the executable, so it takes a different path. The
early 1.00-1.06b cores also take a different path because D2SE ships each of them with its own original `Game.exe`.

- For 1.07-1.13d, `exordium-game.exe` is installed as the box's `Game.exe`. The desktop server starts it with
  `--detach`, and the process relaunches itself with the Windows 7 layer when needed.
- For 1.00-1.06b, the box keeps the core's original `Game.exe`. `exordium-launch.exe` starts it suspended, loads
  `exordium-hook.dll`, and the hook only installs the box's private registry before the game runs. Custom MPQs and
  plugins still need real early-core bootstrap tables before they can work here.
- For 1.14, the box keeps Blizzard's `Game.exe`. `exordium-launch.exe` starts it suspended, loads `exordium-hook.dll`,
  runs `ExordiumHookStart`, and resumes the game only if that returns 0. The hook gives the game the box's registry,
  lets several copies run, and re-points two calls in 1.14d's startup (checked byte for byte first) so the mod's and
  language MPQs open after the game's own archives, through the game's own `ARCHIVE_LoadMPQFile`, and close before them.

`exordium-launch.exe` answers `--detach`, `--wait` and `--dump-hive` and keeps session/play-time records for the boxes
that use it (vault: `Projects/Exordium/Decisions/Sessions Are Kept by the Launcher.md`). When Rich Presence is enabled,
it starts `exordium-presence.exe`, a small helper that only speaks Discord's local IPC and exits when the game or
launcher exits. `src/common.hpp` holds what the native pieces share: the log, the config reader, the registry hive,
import patching, and the commands Exordium runs.

It must run with Windows 7 behaviour. On Windows 8+, pre-1.14 Fog validates its critical sections, finds
`DebugInfo == -1`, and dies of a stack overflow inside `FOG_InitErrorMgr`. The desktop server starts the loader with
`__COMPAT_LAYER=WIN7RTM`, as D2SE.exe runs; started without it, the loader relaunches itself once under that layer.
Details: the vault's `Shared/Diablo-II/Process Startup.md`.

In a box the loader is named `Game.exe`, with its version resource stamped to the core's `Game.exe` version, because
D2GL identifies the game by `GetFileVersionInfo("game.exe")`. It is linked like `Game.exe`: no DEP (D2Mod plugins run
code from data pages), fixed base, and `Storm.dll` as a load-time import (`src/storm.def`). A `LoadLibrary`'d Storm
seeds its MPQ crypt table wrongly and can read no archive. The game's flags must be real process arguments, because
plugins read `GetCommandLineA()`.

A vectored exception handler logs the first exceptions to `exordium-loader.log`. On a stack overflow it also logs the
return addresses and the text left on the stack.

Build:

```powershell
deno task build:loader
```
