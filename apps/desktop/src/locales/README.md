# Interface translations

One JSON file per language. English is the source: its text in `tr("...")` and `plural(...)` is the key, so there is no
`en.json`. A test (`src/lib/i18n.test.ts`) fails if a file misses a string, keeps a string no longer used, or drops a
`{placeholder}`.

- `tr("Version {current}", { current })`: keep `{current}` as written, and move it wherever the sentence needs it.
- `plural(n, "{count} mod", "{count} mods")`: the key is both forms joined by `|`, and so is the value: one form, then
  every other.
- A string with a leading space follows another sentence. Keep the space.

## Adding a language

1. Copy `fr.json` to `<code>.json` and translate the values.
2. Add it to `LANGUAGES` and `CATALOGS` in `src/lib/i18n.ts`, and to `appearance.language` in `src/types.ts` and
   `server.ts`.
3. Run `deno task verify`. Check the layout too: longer languages stretch buttons and labels.

A language outside the Latin alphabet needs a font: Cinzel covers Latin only.

## Terms

| English           | French                | Spanish             | German           | Note                                       |
| ----------------- | --------------------- | ------------------- | ---------------- | ------------------------------------------ |
| core              | core                  | core                | Core             | A game version's files. Kept as a term.    |
| box               | box                   | box                 | Box              | A title's folder of links. Kept as a term. |
| mod               | mod                   | mod                 | Mod (die)        |                                            |
| library           | bibliothèque          | biblioteca          | Bibliothek       |                                            |
| browse            | parcourir             | explorar            | durchsuchen      |                                            |
| backup            | sauvegarde            | copia de seguridad  | Backup           |                                            |
| save (folder)     | dossier de sauvegarde | carpeta de partidas | Spielstandordner |                                            |
| archive (zip, 7z) | archive               | archivo comprimido  | Archiv           |                                            |
| archive (MPQ)     | archive               | archivo MPQ         | Archiv           |                                            |

Names stay in English: Exordium, Battle.net, D2SE, PlugY, ModDB, Internet Archive, and file names. The licence text must
keep "Exordium by Harvest (HarvestLabs)" exactly (NOTICE, section 7(b)); a test checks this.
