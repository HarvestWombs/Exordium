# Exordium

A launcher for Legacy Diablo II and its mods. Exordium keeps its own copy of the game, every patch from 1.00 to 1.13d, and your mods, and runs each mod in its own sealed **box**. Mods never touch each other, your Diablo II install, or your machine's Diablo II settings.

> **Status:** in development, not released yet. Windows only.

- [Features](#features)
- [Requirements](#requirements)
- [Using Exordium](#using-exordium): getting started, the library, adding mods, cores, how a mod runs, multiplayer, video, saves, settings, troubleshooting
- [FAQ](#faq)
- [For mod authors](#for-mod-authors): the manifest, documentation, changelogs, art and links, updates, realms
- [Building from source](#building-from-source)
- [Repository layout](#repository-layout)
- [Credits](#credits)

## Features

- **One library, every version.** First launch links your Diablo II install, copies the game archives into Exordium's own library, and downloads the cores (patches) you pick. After that your install is only ever read.
- **A box per mod.** Each title runs from its own folder, assembled from links to the game, its core and the mod. Each box also gets a private registry: a mod's video, gateway and Glide settings stay with that mod.
- **Its own game loader.** `exordium-game.exe` stands in for `Game.exe` on every core from 1.00 to 1.13d. It opens the MPQ stack, loads PlugY, D2Mod and the mod's own DLLs, then hands over to the game. `-skiptobnet`, `-act` and `-seed` work on every core.
- **D2SE import.** Finds the mods in an existing D2SE install and reviews each one in a converter before copying or moving it into the library. Imports run in the background, one at a time. The converter writes an `exordium.mod.json` the mod carries from then on.
- **Browse and install.** Mods from the Internet Archive and ModDB, with screenshots, descriptions and one-click install, unpacked with a bundled 7-Zip. The library home shows the latest uploads and updates for mods you have.
- **Cores catalog.** Every patch from 1.00 to 1.13d, each with all twelve languages, downloaded from [Exordium-Cores](https://github.com/HarvestWombs/Exordium-Cores) and checked against published SHA-256 checksums.
- **Battle.net stays closed.** Unless a mod declares its own realm, the main-menu Battle.net button is greyed out and every route onto official Battle.net is blocked, on every core. TCP/IP and custom realms are untouched.
- **Save backups.** A copy of a title's saves when its last running copy closes, or by hand, with restore.
- **Library tools:** favorites, collections with drag and drop, foldable sections, hide and uninstall.
- **And:** several copies of a mod at once, Discord Rich Presence with your character's class and level, light and dark themes, a searchable Help, and an updater that installs only Ed25519-signed releases.

## Requirements

- Windows 10 or 11
- Your own copy of Diablo II, and Lord of Destruction for the expansion cores and most mods

Exordium ships no game data. The cores it downloads hold only the per-patch DLLs, `Game.exe`, `Patch_D2.mpq` and the language files. The game's own archives always come from your install.

## Using Exordium

Everything here is also in the app, under **Help**, with a search box.

### Getting started

On first launch Exordium links your Diablo II install and copies what it needs into its own library: the game's MPQ archives, `D2.LNG`, the video DLLs and any graphics wrappers. From then on your install is only read, never changed.

Next it downloads the cores you choose: each one is a patch of the game, from 1.00 to 1.13d. Then you add mods, from your D2SE install, a folder, an archive, or Browse.

Your first game:

1. Pick a mod in the library and press **Play**.
2. The first start builds its box, which takes a moment. Later starts reuse it.
3. Your characters live in the mod's own save folder, and are backed up when the game closes.

The tabs:

- **Library**: everything you have, with each title's page, characters and settings.
- **Browse**: mods from the Internet Archive and ModDB, the cores catalog, and your downloads.
- **Settings**: how Exordium itself behaves.
- **Help**: the documentation, the FAQ and About.

### The library

**Sections.** The sidebar lists Favorites, your collections, Recent, Mods and Cores. Click a section's header to fold it. Right-click it to view only that section, or to fold every collection at once. The « button folds the whole sidebar to a strip of icons. Recent can be turned off in Settings, Library.

The chips under the search box filter the list: All, Mods, Cores, Issues (titles with problems) and, once you hide something, Hidden.

**Favorites and collections.** A favorite moves out of Mods or Cores into Favorites. Unfavorite it and it goes back.

Collections are your own groups. Right-click a title, choose Add to, and pick a collection or make a new one. You can also:

- drag titles onto a collection's header to add them;
- drag within a collection to reorder it;
- drag the headers to reorder the collections.

A title can be in several collections. Right-click it inside one to remove it from there.

**The home screen** shows every title as a card. The Latest uploads row above them shows new mods from the Internet Archive and ModDB, and updates waiting for mods you have. Turn the row off in Settings, Library.

Click a shelf's heading to fold it. The home screen remembers its folds separately from the sidebar's. The Library tab always brings you back here.

**Hiding and uninstalling.** Hide takes a title out of the list without touching its files, and the Hidden filter brings it back. Uninstall deletes the mod from the library, and can keep a copy of its characters first.

### Adding mods

Use **Library, Import** or **Browse**: either way, the mod ends up in the library.

- **From your Diablo II install**: your D2SE mods, each reviewed in the converter before it is copied. Tick *Move instead of copy* to take it out of the install and save the space.
- **From a folder**: a mod already unpacked somewhere. Choose the folder holding its MPQs or its `D2SE_SETUP.ini`; the converter drafts the rest for you to check.
- **From an archive**: a `.zip`, `.7z` or `.rar` as downloaded, unpacked into the library.
- **From Browse**: Install downloads a mod, unpacks it and adds it to the library. Click a mod's picture to open its page on the site.

**The converter** shows the `exordium.mod.json` it will write: the fields on top, and below them the JSON, which you can edit directly. Nothing is copied until you press Import, and your install is never changed unless you chose Move. Imports queue up and run one at a time in the background, so you can close the converter while they finish.

**Plugins and PlugY.** Exordium loads D2Mod, PlugY and the mod's own DLLs. It ships no PlugY: a mod that uses PlugY brings its own `PlugY.dll`, and Exordium hooks it up. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not loaded.

### Cores

A core is one patch of Diablo II: its DLLs, its `Patch_D2.mpq` and its language files. A mod names the core it needs, such as 1.10f or 1.13c, and runs on top of it. A core can also be played on its own, as vanilla Diablo II.

Cores come from Exordium's catalog, and every download is checked against its published checksum. Install more from Browse, Cores. A mod whose core is missing shows **Install core** instead of Play.

Every core carries the twelve language files: ENG, DEU, FRA, ESP, ITA, POL, POR, RUS, KOR, JPN, CHI and SIN. Choose a title's language in its Properties.

**1.14** still launches, through Blizzard's own `Game.exe`, but gets none of Exordium's loader features: no plugins, no custom MPQs, and no Battle.net lockdown.

### How a mod runs

**The box.** Each title runs from its own box: a folder made of links to the game files, its core and the mod, with the mod's save folder linked in. Nothing is copied twice, and no mod can change another mod or your install.

If a box ever looks wrong, **Properties, Files, Rebuild Box** brings its links and copied files up to date. Saves are not touched, and they are backed up first.

**The loader.** Before 1.14, a box's `Game.exe` is Exordium's own loader, made to look like that core's `Game.exe`. It opens the MPQs in the right order, loads the plugins, and starts the game.

**The registry.** Each box has a private registry. A mod's video, gateway and Glide settings stay with that mod, and your machine's Diablo II settings are never touched.

**Several copies.** Press Play again while a title runs to start another copy, for a TCP/IP game with yourself or to play several characters. Each copy has its own registry and log.

### Multiplayer and Battle.net

- **TCP/IP** works as it always has: one player hosts, the others join by address. Every player needs the same mod at the same version.
- **Mod realms.** A mod that runs its own server names it in its `exordium.mod.json`, as a realm with a gateway address. For that mod, Battle.net stays open and connects to the mod's realm.
- **Official Battle.net.** For every other mod, Exordium does not connect to Blizzard's Battle.net. The Battle.net button is greyed out, and every other way onto Battle.net is blocked. Modded games do not belong on Blizzard's servers.

### Video and windowed mode

Choose a title's renderer in Properties, General. DirectDraw can run in a window. Direct3D and OpenGL are full screen only in these versions of the game.

Glide needs a Glide wrapper (`glide3x.dll`), such as D2GL or dgVoodoo. Setup copies the one in your Diablo II folder, if there is one, and a mod can bring its own. With Glide the window belongs to the wrapper, so its window settings are the wrapper's own, not Exordium's.

### Saves and backups

A mod's characters are in its own save folder, inside the library. To open it, right-click the title, then Manage, Browse local files.

Exordium backs up a title's saves when its last running copy closes, and you can take one by hand from the title's Backups tab. Restoring backs up what is there first, so nothing is lost. The newest 30 automatic backups are kept; backups you take by hand stay until you delete them.

In Settings, Backups you can turn automatic backups off, or move the backups folder somewhere else, such as a cloud-synced folder.

### Settings and files

Everything lives in the **Exordium folder** beside `Exordium.exe`. Each folder is shown, with a button to open it, in its own Settings section: Library, Boxes, Downloads, Backups and Diagnostics.

| Folder | What it holds |
|---|---|
| `library` | The game files, cores and mods Exordium runs. |
| `boxes` | Each title's box. Safe to delete; it is rebuilt on the next Play. |
| `backups` | Save backups. |
| `downloads` | Mods downloaded from Browse. |
| `logs` | Exordium's and the loader's logs. |

Settings worth knowing:

- **Local-only mode** (Privacy): no network at all. Browse, cores and Discord are off; games still launch.
- **Defender troubleshooting mode** (Diagnostics): avoids what antivirus software may flag, if Exordium is being blocked.
- **Minimize Exordium when a game starts** (Launching): it keeps running in the taskbar to back up characters and show Discord activity.
- **Updates**: Exordium checks for a new version when it opens and downloads it in the background. Only releases signed by HarvestLabs are installed, and nothing changes until you restart.
- **Discord**: while a game runs, Discord shows the title and, once you are in a game, your character's class and level (never its name). Turn it off in Settings, Discord.

### Troubleshooting

When a game does not start, open the title's **Logs** tab. Exordium opens it for you unless you turned that off in Settings, Launching. The loader log shows each step of the start, and the last lines usually name the problem.

| Message | What to do |
|---|---|
| Needs core 1.10f, which this install does not have | Press Install core on the mod's page, or install it from Browse, Cores. |
| PlugY is turned on, but the mod does not ship PlugY.dll | Turn PlugY off in the title's Properties, or add PlugY to the mod's folder. |
| The mod changed since the running copy started | A file in the box changed while a copy was running. Close every copy, then start again. |
| Cannot bootstrap gfx: D2Win.dll or D2Gfx.dll did not load | The game's own DLLs are incomplete. Rebuild the box (Properties, Files). If it persists, the core is damaged, so reinstall it. |
| Battle.net could not be closed for this core | The mod replaces the game's `D2Launch.dll` with one Exordium does not recognise. Tell the mod's author. |

Problems with the game window:

- **Black screen or wrong size**: switch the renderer to DirectDraw and tick windowed in Properties, General.
- **Glide shows nothing**: the mod needs a Glide wrapper; see [Video and windowed mode](#video-and-windowed-mode).

If your antivirus blocks or deletes part of Exordium, turn on Defender troubleshooting mode in Settings, Diagnostics, and restore the file from quarantine.

## FAQ

**Do I need to own Diablo II?**
Yes. Exordium ships no game data: the MPQ archives come from your own install. Most mods need Lord of Destruction too.

**Does Exordium change my Diablo II install?**
No. Setup reads your install and copies what it needs into Exordium's own library. The only exception is the converter's Move option, which takes a mod out of your install when you ask it to.

**Can I keep using D2SE?**
Yes. Importing copies a mod into Exordium, so your D2SE install and its mods keep working as they did, unless you chose Move.

**Where are my characters saved?**
In the mod's own save folder, inside Exordium's library. Right-click the title, then Manage, Browse local files. Each title's Backups tab keeps copies.

**Which versions of the game are supported?**
Every patch from 1.00 to 1.13d. 1.14 launches too, through Blizzard's own `Game.exe`, but without plugins, custom MPQs or the Battle.net lockdown.

**Why is the Battle.net button grey?**
Exordium does not connect modded games to Blizzard's Battle.net. A mod with its own realm names it in its `exordium.mod.json`, and for that mod Battle.net is open. TCP/IP games always work.

**Can I play with friends?**
Yes: over TCP/IP, with everyone on the same mod and version, or on the mod's own realm if it has one.

**Can I run two copies at once?**
Yes. Press Play again while a title runs; each copy gets its own registry and log.

**How much disk space does it need?**
About 2 GB for the game files, a few MB per core, and each mod's own size. Boxes are made of links, so they take almost nothing. When importing from D2SE, *Move instead of copy* avoids keeping a mod twice.

**Does it work with PlugY, D2Mod and other plugins?**
PlugY and D2Mod do, when the mod brings them. Other plugin DLLs load when the mod lists them. D2SE's own plugin systems are not loaded.

**Does it work with D2GL, dgVoodoo and other wrappers?**
Yes. Setup copies the wrappers in your Diablo II folder, and a mod can bring its own. With Glide, the wrapper's own settings decide the window.

**What does Rebuild Box do?**
It remakes the title's box from the library, bringing links and copied files up to date. Saves are not touched, and are backed up first.

**What does Exordium show on Discord?**
The title you are playing, how long you have played, and, once you are in a game, your character's class and level, never its name. Settings, Discord turns it off.

**How do updates work?**
Exordium checks for a new version when it opens and downloads it in the background. Only releases signed by HarvestLabs are installed, and nothing changes until you choose to restart.

**Does Exordium need the internet?**
Only for Browse, cores, updates and Discord. With Local-only mode on (Settings, Privacy) it never goes online, and games still launch.

**My antivirus flagged Exordium. Is it safe?**
Exordium starts games in an unusual way, which some antivirus software mistakes for a threat. Turn on Defender troubleshooting mode in Settings, Diagnostics, and restore the file from quarantine.

## For mod authors

### The manifest

A mod describes itself in `exordium.mod.json`, in its top folder. A mod with only a `D2SE_SETUP.ini` still works: the converter drafts a manifest from it on import, and the player reviews it there. Every field is optional except `core`, and every path is relative to the mod's folder.

```json
{
  "title": "The Black Soul",
  "version": "0.9.0",
  "core": "1.10f",
  "author": "HarvestLabs",
  "description": "A darker Diablo II.",
  "readme": "Documentation/ReadMe.txt",
  "art": { "banner": "art/banner.png", "icon": "art/icon.png", "portrait": "art/portrait.png" },
  "links": [{ "label": "Discord", "url": "https://discord.gg/your-invite" }],
  "update": { "endpoint": "updates.json", "channel": "stable" },
  "launch": { "renderer": "glide", "windowed": true, "direct": true, "txt": true, "plugY": false },
  "loads": { "d2mod": true, "mpqs": ["BlackSoul.mpq"], "dlls": [] },
  "realm": null
}
```

The full schema is [`docs/exordium.mod.schema.json`](docs/exordium.mod.schema.json), with an example beside it.

| Field | What it is |
|---|---|
| `title`, `version`, `author`, `description` | What the library and the mod's page show. `version` is also what update checks compare against. |
| `core` | The patch the mod runs on, spelled as the cores are: 1.00 to 1.13d, such as `1.10f` or `1.13c`. |
| `readme` | The documentation page to list first ([Documentation](#documentation)). |
| `art` | The banner, icon and portrait ([Art and links](#art-screenshots-and-links)). |
| `links` | Buttons on the mod's page ([Art and links](#art-screenshots-and-links)). |
| `update` | Where to look for new versions ([Updates](#updates)). |
| `launch` | How the game starts: `renderer` (`glide`, `ddraw`, `d3d` or `opengl`), `windowed`, `noSound`, `direct`, `txt`, `hardcore`, `plugY`, `language`, `skipToBNet`, `seed` and `startAct`. These are the mod's defaults; players can change them in Properties. |
| `loads` | What is loaded into the game: `d2mod` (D2Mod.dll), `mpqs` (your MPQs, lowest priority first) and `dlls` (other plugin DLLs, in load order). |
| `realm` | The mod's own server, if it has one ([Realms](#realms)). |

**Plugins and PlugY.** If the mod uses PlugY, ship `PlugY.dll` at the mod's root, or in a `PlugY` folder as D2SE mods do. Exordium does not provide one, and turning PlugY on without it stops the launch with a message saying so. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not loaded.

**Languages.** Every core carries the twelve language MPQs. A mod that ships its own texts for a language puts them in a `Language_ENG` (or `DEU`, `FRA` and so on) folder, which is used when the player picks that language. Set `launch.language` to `MOD` to use no language folder at all.

### Documentation

Exordium looks through the mod's own files for the Documentation tab; nothing has to be registered. Pages can be HTML (`.html`, `.htm`), plain text (`.txt`, `.md`, `.nfo`) or RTF (`.rtf`). Markdown is shown as plain text, not rendered.

What is picked up:

- **The readme you name**: `readme` in `exordium.mod.json` (or D2SE's `ModReadme`) is always listed first.
- **Sites**: a folder holding an `index.html` is one site, listed once by its index however many pages it has. Its links between pages work.
- **HTML pages** at the mod's top level, or anywhere inside a folder named `doc`, `docs`, `documentation`, `manual`, `guide`, `help`, `readme` or `html`.
- **Text and RTF files** at the top level whose names look like documentation (readme, manual, guide, faq, instructions, install, info, description, about), and any text file inside one of the folders above.

Pages are shown inside Exordium with scripts switched off. Stylesheets (`.css`) and images (`.png`, `.jpg`, `.gif`, `.bmp`, `.webp`, `.ico`) next to them load; JavaScript and SVG do not. A page that builds itself with scripts, as some table viewers do, shows blank: generate static HTML instead.

A mod lists at most 40 documentation pages, so a large site belongs in one folder with an `index.html` rather than as loose pages.

```
MyMod/
  exordium.mod.json        "readme": "Documentation/ReadMe.txt"
  Documentation/
    ReadMe.txt             listed first
    Install.txt
    Runewords/index.html   one site: "Runewords (site)"
    Runewords/page2.html
    Runewords/style.css
```

### Changelogs

Any page (`.txt`, `.md`, `.nfo`, `.html`, `.htm` or `.rtf`) anywhere in the mod counts as a changelog if its file name contains *changelog*, *change log*, *changes*, *history*, *what's new*, *patch notes* or *release notes*. Changelogs are listed in the Changelogs tab, not under Documentation.

They are sorted newest first, by a date in the file name or its folder:

- `2026-10-14`, `2026_10_14` or `2026.10.14`
- `10-14-2026`

Files without a date come after the dated ones. The newest one's opening lines are what the mod's Overview shows under What's new.

Two layouts that work:

- **One file per release**: name each with its date, such as `Changelog 2026-10-14.txt`; the newest is always on top.
- **One running file**: a single `Changelog.txt` with the newest release at the top. What's new shows its first lines, so start with the latest changes.

### Art, screenshots and links

| Art | Where it shows | Size |
|---|---|---|
| `banner` | The header of the mod's page. | 1920x500 or larger |
| `icon` | The sidebar, and the game's own icon in the taskbar and on desktop shortcuts. | Square, 256x256 |
| `portrait` | The card on the library home. | 600x900 (2:3) |

Name them under `art` in `exordium.mod.json`, as paths in the mod's folder. PNG, JPEG, WebP, GIF, BMP and ICO all work. A mod without a portrait shows its icon and name over its banner; without either, it shows its initials. Players can replace any of them in Properties, Artwork, without touching the mod.

**Screenshots.** Images (`.png`, `.jpg`, `.gif`, `.bmp`, `.webp`) in a `Screenshots` folder at the mod's root show in the mod's Screenshots tab, and a few of them on its Overview.

**Links.** `links` is a list of label and url pairs, each a button on the mod's page that opens in the browser. Only web addresses (http or https) are kept, and a link without a label is named after its site. A D2SE mod's homepage and forum are carried over too.

### Updates

Point `update.endpoint` at a feed: a web address, or a file path relative to the mod's folder (handy for testing). Exordium reads the feed, picks the release for the player's channel, and compares its version with the mod's own `version`. When they differ:

- the mod's Updates page says a new version is out, with its notes and a link to its page;
- the mod appears in the library's Latest uploads row.

Exordium does not download or install mod updates itself: players follow the release's page.

```json
{
  "releases": [
    {
      "version": "0.9.1",
      "channel": "stable",
      "publishedAt": "2026-10-06T00:00:00Z",
      "page": "https://example.com/mymod/releases/0.9.1",
      "notes": "Fixes launch data and item table packaging.",
      "downloads": [
        { "kind": "full", "url": "https://example.com/MyMod-0.9.1.zip", "sha256": "...", "size": 123456789 }
      ]
    }
  ]
}
```

See [`docs/exordium.update.example.json`](docs/exordium.update.example.json).

**Channels.** A release's channel is `stable` (the default) or `testing`. Players on Testing get the first testing release, or the first stable one when there is none. Put the newest release first in the list, since the first match is the one shown.

### Realms

Exordium closes official Battle.net for every mod, unless the mod names its own server. Give `realm` a gateway address, and Battle.net stays open for your mod and connects there; `-skiptobnet` goes straight to it.

```json
"realm": {
  "gateway": "realm.example.com",
  "gatewayName": "My Realm",
  "timezone": "-5",
  "selected": "My Realm",
  "port": "6112"
}
```

The converter carries over a D2SE mod's realm settings (`RealmGateway` and the rest). TCP/IP games need nothing: they always work.

## Building from source

You need [Deno](https://deno.com) 2 and, for the native parts, Visual Studio 2022 with the C++ x86 tools.

```
deno task verify        # fmt check, lint, type check, tests
deno task build:loader  # native/loader/build/exordium-game.exe
deno task build:window  # native/window/build/exordium-window.dll, the desktop window hook
```

Run the native builds from a normal PowerShell, because Git Bash's `PATH` breaks `vcvars32.bat`.

### Running

Build the loader first. Then, to run Exordium as a local web app:

```
cd apps/desktop
deno task build          # the UI, into dist/
deno run -A server.ts    # then open http://127.0.0.1:8235
```

`deno task dev` in `apps/desktop` does the same with hot reload (Vite on 5273, the server on 8235).

To build the desktop app, run `deno task desktop` in `apps/desktop`. It packages everything into `apps/desktop/Exordium/Exordium.exe`, with the UI and the loader embedded, and 7-Zip beside it in `native/7zip`.

Packaging needs the canary Deno. Install it once:

```
deno upgrade canary --output ~/.deno/bin/deno-canary.exe
```

Stable Deno packs a laufey build that crashes at window creation on Windows. Close the app before rebuilding, because Windows locks its files while it runs.

### Releasing

Run these from `apps/desktop`. Bump the version in `apps/desktop/deno.json` first.

```
deno task release --keygen    # once: the signing key, kept outside the repository
deno task release             # release/Exordium-<version>-win-x64.zip, signed
deno task release --publish   # ...and the GitHub release v<version>
```

The updater only accepts releases signed with a key in `RELEASE_PUBLIC_KEYS` (`apps/desktop/updater.ts`). If you lose the private key, installed copies can no longer update, so keep an offline backup.

## Repository layout

| Path | What |
|---|---|
| `apps/desktop` | The app: a Deno server (`server.ts`) and a React UI (`src/`: `components`, `hooks`, `lib`, `pages`), packaged into a WebView2 window. Library setup, browsing, cores, the converter, launching, backups, the updater. Help's text is in `src/pages/help/content.ts`. |
| `native/loader` | `exordium-game.exe`, the C++ game loader: private registry, MPQ stack, plugins, per-core config layout, Battle.net lockdown, module handoff. |
| `native/window` | `exordium-window.dll`, the desktop app's window hook: a custom title bar that keeps Windows' snapping, Win+arrows and animations. |
| `native/7zip` | The bundled 7-Zip (`7z.exe`, `7z.dll`, licence). |
| `packages/layers` | The layer model: stacks, resolution into a plan, fingerprints, diffs. Pure data, no Windows needed. |
| `packages/d2se` | Reading D2SE installs and Exordium libraries: settings, cores, mods, what each mod loads, and problems. |
| `packages/library` | The library: registering imports, the pre-launch change check, artwork, pinned versions. |
| `packages/box` | Realising a plan as the folder a game runs in: links, the saves junction, reuse, the after-run check. |
| `packages/registry` | Each box's private registry: layers, hive text, `.reg` import, capturing what a run changed. |
| `packages/launch` | The loader plan that `exordium-game.exe` consumes: archives, language, plugins, settings and the Battle.net decision. |
| `docs` | The `exordium.mod.json` and update-feed schemas and examples. |

The architecture, and the reverse engineering behind the loader, are written up in the HarvestLabs vault (`ExcelsiorDeno/docs/vault`):

- `Projects/Exordium/Current State.md`: where the project is.
- `Projects/Exordium/Architecture/`: Layers, Launcher, Registry, Library, Application, ModDB Source.
- `Projects/Exordium/Decisions/`: why a profile is a box of layers, and other choices.
- `Shared/Diablo-II/`: engine findings, such as how the Battle.net button is greyed in each core and where each core keeps its launch settings.

## Credits

By Harvest ([GitHub](https://github.com/HarvestWombs), [donate](https://streamelements.com/cfs_harvest/tip)).

Exordium stands on the work of:

- **Lectem** and the contributors to [D2MOO](https://github.com/ThePhrozenKeep/D2MOO)
- [**Necrolis**](https://github.com/Necrolis)
- [**Meanski**](https://github.com/Meanski)
- [**Szumigajowy**](https://github.com/szumigajowy)
- **The Phrozen Keep**: [d2mods.info](https://www.d2mods.info), [GitHub](https://github.com/ThePhrozenKeep), [Discord](https://discord.gg/NvfftHY), [Patreon](https://www.patreon.com/ThePhrozenKeep)

Archives are unpacked with [7-Zip](https://www.7-zip.org) by Igor Pavlov (GNU LGPL; its licence ships with Exordium).

## License

[MIT](LICENSE). Diablo II is a trademark of Blizzard Entertainment. Exordium is not affiliated with or endorsed by Blizzard.
