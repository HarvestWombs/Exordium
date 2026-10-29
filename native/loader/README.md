# Exordium native loader

`exordium-game.exe` is the 32-bit process a box's game runs in, on every core from 1.00 to 1.13d. Exordium is 64-bit and
Diablo II's DLLs are 32-bit, so each game needs a process of its own; this is it. It:

- reads `exordium-loader.json` from the box's `game` folder;
- installs the box's private registry (`RegOverridePredefKey` on a hive of its own);
- follows `Game.exe`'s startup order: `FOG_SetLogPrefix`, `FOG_InitErrorMgr`, MPQ config and async data, the archive
  stack, then the real D2Win startup exports, sound, plugin init, and `D2Launch`'s module loop;
- loads D2Mod, PlugY and the mod's own DLLs in plan order, calling each plugin's init only once its signature has been
  checked against the binary;
- patches the game in memory: the Battle.net lockdown (D2Launch), Cactus's MPQ fix (Storm, so every core reads the 1.14
  installer's archives), and the per-core config offsets for `-skiptobnet`, `-act` and `-seed`;
- puts the title's icon on the game window.

The startup exports are versioned. D2SE's `FUN_00401a40` resolves them from tables indexed as
`functionIndex * 0x28 + coreIndex * 4`; for example 1.10f uses D2Win `#10000` / `#10001`, while 1.13c uses `#10142` /
`#10052`. Exordium keeps a table per core (`core_ordinals` in `src/main.cpp`).

1.14 is not handled here: that runtime folded the classic DLLs into one executable, so a 1.14 box runs Blizzard's own
`Game.exe`, with no loader and no plugins.

## In a box

The box's `Game.exe` is a symlink to `exordium-game.exe` stamped with that core's own `Game.exe` file version, because
plugins such as D2GL identify the game by `GetFileVersionInfo("game.exe")`. `deno task build:loader` writes one stamped
copy per core into `build/game/<core>/Game.exe` (`apps/desktop/stamp-game.ts`), packaging ships them in `native/game`,
and the box links its core's copy like any other file. A symlinked exe still loads its DLLs from the link's folder and
reports the link as its path, so the game and its plugins see the box.

It is linked like `Game.exe`: no DEP (D2Mod plugins run code from data pages), fixed base, and `Storm.dll` as a
load-time import (`src/storm.def`). A `LoadLibrary`'d Storm seeds its MPQ crypt table wrongly and can read no archive.
The game's flags must be real process arguments, because plugins read `GetCommandLineA()`.

It must run with Windows 7 behaviour. On Windows 8+, pre-1.14 Fog validates its critical sections, finds
`DebugInfo == -1`, and dies of a stack overflow inside `FOG_InitErrorMgr`. The desktop server starts it with `--detach`,
and it relaunches itself once under `__COMPAT_LAYER=WIN7RTM`, as D2SE.exe runs. Details: the vault's
`Shared/Diablo-II/Process Startup.md`.

Besides running a game it answers `--detach` (start the game and print its process id), `--wait <pid>` and `--dump-hive`
(read a run's registry back), which the desktop server uses. `src/common.hpp` holds the log, the config reader, the
registry hive and import patching.

A vectored exception handler logs the first exceptions to `exordium-loader.log`. On a stack overflow it also logs the
return addresses and the text left on the stack.

## Build

```powershell
deno task build:loader
```

Visual Studio 2022 with the C++ x86 tools. Run it from a normal PowerShell; Git Bash's `PATH` breaks `vcvars32.bat`.
