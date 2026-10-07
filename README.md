# Exordium

The launcher and runtime platform for legacy Diablo II (1.07–1.13c). Each profile runs in a **box**: a stack of file layers (game, core, mod, writable) and registry layers (base, mod, profile, writable), so mods never touch each other, your install, or your machine's Diablo II settings.

**Status:** early. The layer model, D2SE import, library, box and loader plan exist; the native loader and app do not yet.

## Design

The architecture lives in the HarvestLabs vault (`ExcelsiorDeno/docs/vault`), not here:

- `Projects/Exordium/Current State.md` — where the project is and what comes next
- `Projects/Exordium/Architecture/` — Layers, Launcher, Registry, Library, Updater, Application
- `Projects/Exordium/Decisions/A Profile Is a Box of Layers.md` — why a box, and the options rejected

## Packages

| Package | What |
|---|---|
| `@exordium/layers` | The layer model: stacks, resolution into a plan, fingerprints, diffs. Pure data, no Windows needed. |
| `@exordium/d2se` | Reading an existing D2SE install, read-only: its settings, cores, mods, what D2SE loads for each mod, and problems. |
| `@exordium/library` | What Exordium knows: referenced entries registered from an import, the pre-launch change check, and a content-addressed store for pinned versions, in `%LOCALAPPDATA%\Exordium`. |
| `@exordium/box` | Realising a plan as a folder the game runs in: links to referenced folders and the store, the saves junction, reuse, and the after-run check. |
| `@exordium/launch` | The pure loader contract: D2SE-derived archive, language, plugin and handoff plan that native `exordium-game.exe` will consume. |

## Commands

```
deno task test          # run the tests
deno task verify        # fmt check, lint, type check, tests
deno task build:loader  # build native/loader/build/exordium-game.exe (Visual Studio 2022, from PowerShell)
deno task build:window  # build native/window/build/exordium-window.dll, the desktop window hook (same)
```

### Running the app

The loader must be built first (`deno task build:loader`), and for the desktop window the window hook
(`deno task build:window`).

As a local web app, which works today:

```
cd apps/desktop
deno task build                  # the UI, into dist/
deno run -A server.ts            # then open http://127.0.0.1:8235
```

`deno task dev` in `apps/desktop` does the same with hot reload (Vite on 5273, the server on 8235).

As a desktop window: `deno task desktop` in `apps/desktop` bundles the app into `apps/desktop/Exordium/Exordium.exe`,
with the UI and the loader embedded; run that exe. Packaging needs the canary deno, installed once with
`deno upgrade canary --output ~/.deno/bin/deno-canary.exe`: stable deno packs laufey v0.5.0, which crashes at window
creation on Windows, and canary packs v0.6.1, which works (`package-app.ts`, the same approach as Excelsior). Close the
app before rebuilding; Windows locks its files while it runs.
