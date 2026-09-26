# Exordium

Before working here, read the design in the HarvestLabs vault at `C:\Users\black\Documents\GitHub\ExcelsiorDeno\docs\vault`:

1. `Projects/Exordium/Exordium.md`
2. `Projects/Exordium/Current State.md`
3. The relevant notes in `Projects/Exordium/Architecture/` and `Projects/Exordium/Decisions/`

Write durable findings back to the vault, not to this repository.

## Conventions

- Deno workspace, TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — the same settings as Excelsior.
- `deno task verify` must pass: fmt, lint, type check, tests.
- The layer model (`packages/layers`) is plain data and must stay testable without Windows, the game, or native code. Anything that touches the disk, the registry or a process belongs in a later package (`box`, `launch`).
- Nothing outside a box is ever written: not the library, not the user's install, not the machine's registry.
- Commit and push only when asked.
