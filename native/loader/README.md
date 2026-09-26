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
1.14 is not in this table: that runtime folded the classic DLLs into the executable, so it needs a different
compatibility path.

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
