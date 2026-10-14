# Exordium

A launcher for Legacy Diablo II and its mods. Exordium keeps its own copy of the game, every patch from 1.00 to 1.13d, and your mods, and runs each mod in its own sealed **box**. Mods never touch each other, your Diablo II install, or your machine's Diablo II settings.

> **Status:** in development, not released yet. Windows only.

## What it does

- **One library, every version.** First launch links your Diablo II install, copies the game archives into Exordium's own library, and downloads the cores (patches) you pick. After that your install is only ever read.
- **A box per mod.** Each title runs from its own folder, assembled from links to the game, its core and the mod. Each box also gets a private registry: a mod's video, gateway and Glide settings stay with that mod.
- **Its own game loader.** `exordium-game.exe` stands in for `Game.exe` on every core from 1.00 to 1.13d. It opens the MPQ stack and loads PlugY, D2Mod and the mod's own DLLs, then hands over to the game. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not loaded.
- **D2SE import.** Finds the mods in an existing D2SE install and reviews each one in a converter before copying or moving it into the library. The converter writes an `exordium.mod.json` the mod carries from then on.
- **Browse and install.** Mods from the Internet Archive and ModDB, with screenshots, descriptions and one-click install, plus a downloads page.
- **Cores catalog.** Every patch 1.00 to 1.13d, downloaded from [Exordium-Cores](https://github.com/HarvestWombs/Exordium-Cores) and checked against published SHA-256 checksums.
- **Battle.net stays closed.** Unless a mod declares its own realm, the main-menu Battle.net button is greyed out and every route onto official Battle.net is blocked, on every core. TCP/IP and custom realms are untouched.
- **Save backups.** A copy of a title's saves when its last running copy closes, or by hand, with restore.
- **Several copies at once,** Discord Rich Presence, light and dark themes, and an updater that installs only Ed25519-signed releases.

1.14d boxes still launch, but through Blizzard's own `Game.exe`, so none of the loader's features apply to them.

## Requirements

- Windows 10 or 11
- Your own copy of Diablo II, and Lord of Destruction for the expansion cores

Exordium ships no game files. The cores it downloads are the per-patch DLLs, `Game.exe` and `Patch_D2.mpq`. The game's own archives always come from your install.

## For mod authors

A mod describes itself in `exordium.mod.json` at its root: title, core, art, launch settings, which MPQs and plugins to load, an optional realm, and where updates come from. See [`docs/exordium.mod.example.json`](docs/exordium.mod.example.json) and the schema beside it. Mods from D2SE work without one; the converter writes it on import.

## Building from source

You need [Deno](https://deno.com) 2 and, for the native parts, Visual Studio 2022 with the C++ x86 tools.

```
deno task verify        # fmt check, lint, type check, tests
deno task build:loader  # native/loader/build/exordium-game.exe
deno task build:window  # native/window/build/exordium-window.dll, the desktop window hook
```

Run the native builds from a normal PowerShell. Git Bash's `PATH` breaks `vcvars32.bat`.

### Running

Build the loader first. Then, as a local web app:

```
cd apps/desktop
deno task build          # the UI, into dist/
deno run -A server.ts    # then open http://127.0.0.1:8235
```

`deno task dev` in `apps/desktop` does the same with hot reload (Vite on 5273, the server on 8235).

As the desktop app: `deno task desktop` in `apps/desktop` packages everything into `apps/desktop/Exordium/Exordium.exe`, with the UI and the loader embedded. Packaging needs the canary Deno, installed once with `deno upgrade canary --output ~/.deno/bin/deno-canary.exe`. Stable Deno packs a laufey build that crashes at window creation on Windows. Close the app before rebuilding; Windows locks its files while it runs.

### Releasing

```
deno task release --keygen    # once: the signing key, kept outside the repository
deno task release             # release/Exordium-<version>-win-x64.zip, signed
deno task release --publish   # ...and the GitHub release v<version>
```

Bump the version in `apps/desktop/deno.json` first. The updater only accepts releases signed with a key in `RELEASE_PUBLIC_KEYS` (`apps/desktop/updater.ts`). Lose the private key and installed copies can no longer update, so keep an offline backup.

## Layout

| Path | What |
|---|---|
| `apps/desktop` | The app: a Deno server (`server.ts`) and a React UI (`src/`), packaged into a WebView2 window. Library setup, browsing, cores, the converter, launching, backups, the updater. |
| `native/loader` | `exordium-game.exe`, the C++ game loader: private registry, MPQ stack, plugins, Battle.net lockdown, module handoff. |
| `native/window` | `exordium-window.dll`, the desktop app's window hook: a custom title bar that keeps Windows' snapping, Win+arrows and animations. |
| `packages/layers` | The layer model: stacks, resolution into a plan, fingerprints, diffs. Pure data, no Windows needed. |
| `packages/d2se` | Reading D2SE installs and Exordium libraries: settings, cores, mods, what each mod loads, and problems. |
| `packages/library` | The library: registering imports, the pre-launch change check, artwork, pinned versions. |
| `packages/box` | Realising a plan as the folder a game runs in: links, the saves junction, reuse, the after-run check. |
| `packages/registry` | Each box's private registry: layers, hive text, `.reg` import, capturing what a run changed. |
| `packages/launch` | The loader plan: archives, language, plugins, settings and the Battle.net decision that `exordium-game.exe` consumes. |
| `docs` | The `exordium.mod.json` and update-feed schemas and examples. |

## Design notes

The architecture and the reverse-engineering behind the loader live in the HarvestLabs vault (`ExcelsiorDeno/docs/vault`):

- `Projects/Exordium/Current State.md`: where the project is
- `Projects/Exordium/Architecture/`: Layers, Launcher, Registry, Library, Application, ModDB Source
- `Projects/Exordium/Decisions/`: why a profile is a box of layers, and other choices
- `Shared/Diablo-II/`: engine findings, such as how the Battle.net button is greyed in each core

## License

[MIT](LICENSE). Diablo II is a trademark of Blizzard Entertainment. Exordium is not affiliated with or endorsed by Blizzard.
