# Exordium

The launcher and runtime platform for legacy Diablo II (1.07–1.13c). Each profile runs in a **box**: a stack of file layers (core, mod, writable) and registry layers (base, mod, profile, writable), so mods never touch each other, your install, or your machine's Diablo II settings.

**Status:** early. Only the layer model exists so far.

## Design

The architecture lives in the HarvestLabs vault (`ExcelsiorDeno/docs/vault`), not here:

- `Projects/Exordium/Current State.md` — where the project is and what comes next
- `Projects/Exordium/Architecture/` — Layers, Launcher, Registry, Library, Updater, Application
- `Projects/Exordium/Decisions/A Profile Is a Box of Layers.md` — why a box, and the options rejected

## Packages

| Package | What |
|---|---|
| `@exordium/layers` | The layer model: stacks, resolution into a plan, fingerprints, diffs. Pure data, no Windows needed. |

## Commands

```
deno task test     # run the tests
deno task verify   # fmt check, lint, type check, tests
```
