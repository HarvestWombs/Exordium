<p align="center">
  <img src="apps/desktop/assets/exordium-icon.png" width="128" alt="">
</p>

<h1 align="center">Exordium</h1>

<p align="center">
  <strong>A launcher and mod manager for Legacy Diablo II.</strong><br>
  Supports every patch from 1.00 to 1.13d, with each mod isolated from the others and from your installation.
</p>

> **Status:** In development. Windows only; Linux and macOS support is a work in progress.

## Overview

Exordium installs, organizes and launches Diablo II mods from a single library.

Diablo II mods target specific patches, and they share one game folder and one set of registry settings, so they conflict with each other and with the base game. Exordium keeps every patch side by side, determines which one a mod requires, and launches the mod on it with its own files, settings and characters. Your Diablo II installation is left unchanged.

## How it works

**Library.** During setup, Exordium links the game archives from your Diablo II installation into its own library, falling back to an independent copy where links are unavailable. Patches, called **cores**, are downloaded separately and verified against published SHA-256 checksums.

**Boxes.** Each mod runs from its own folder, built from links to the game, its core and the mod. Mods cannot affect one another, and each adds almost no disk space beyond its own files.

**Private registry.** Diablo II stores video and gateway settings in the Windows registry, which every mod normally shares. Each box has a private registry, so these settings stay with the mod and your machine's Diablo II settings are not changed. [1.14](#114) is the exception.

**Game loader.** Patches before 1.14 need a `Game.exe` that a modern installation does not provide. Exordium's loader takes its place on every core from 1.00 to 1.13d: it opens the mod's MPQs in order, loads PlugY, D2Mod and the mod's own DLLs, and hands over to the game.

## Comparison with D2SE

D2SE is the launcher the Diablo II modding community was built on. Exordium's loader was developed by studying D2SE, and Exordium reads D2SE's mod format, so existing mods carry over directly.

The main difference is isolation. D2SE runs mods from inside your Diablo II installation and changes your settings to suit them. Exordium runs them from its own library.

| | D2SE | Exordium |
|---|---|---|
| **Where mods live** | Inside your Diablo II installation | In Exordium's library; your installation is only read |
| **Game settings** | Written to your Diablo II registry keys | A private registry per mod |
| **Mod MPQs** | Up to 3 | No limit |
| **Plugin DLLs** | Up to 3 | No limit |
| **Language packs** | Loaded between a mod's MPQs | Loaded above all of them, so the selected language always applies |
| **Mod manifest** | `D2SE_SETUP.ini`: launch settings | `exordium.mod.json`: launch settings, artwork, links, documentation and an update feed |

**Limitations.** Exordium does not load D2SE's own plugin systems, D2SE_Utility and the D2SE mod DLL, so a mod that depends on them may not work fully. Imported mods are copied into the library and use disk space until you remove the original or choose Move.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Using Exordium](#using-exordium): getting started, the library, adding mods, cores, 1.14, how a mod runs, multiplayer, video, saves, settings, troubleshooting
- [FAQ](#faq)
- [For mod authors](#for-mod-authors): the manifest, documentation, changelogs, art and links, updates, realms
- [Building from source](#building-from-source)
- [Repository layout](#repository-layout)
- [Credits](#credits)

## Features

### Installing mods

- **D2SE migration.** Exordium finds the mods in a D2SE installation and converts each one to an `exordium.mod.json` for you to review before it is imported. Originals stay in place unless you choose Move.
- **Built-in mod browser.** Find and install mods from the Internet Archive and ModDB, with screenshots, descriptions and file types. Installers are identified, and Exordium never runs them.
- **Archive and folder import.** Import a `.zip`, `.7z` or `.rar`, or a mod that is already unpacked.
- **Core management.** Every patch from 1.00 to 1.13d, with all twelve languages, from [Exordium-Cores](https://github.com/HarvestWombs/Exordium-Cores). If a mod needs a core you don't have, its Play button becomes Install core.
- **Update notices.** Mods that publish an update feed show new versions in the library.

### Running mods

- **Unlimited MPQs and DLLs.** A mod can load as many of each as it needs, where D2SE stops at three.
- **Plugin support.** PlugY, D2Mod and a mod's own DLLs load in the order the mod specifies. Exordium uses the mod's PlugY, or one you provide in `library\plugy`.
- **1.14 MPQs on older patches.** An MPQ from the 1.14 installer loads on every core without being rebuilt.
- **Battle.net lockdown.** Modded games cannot reach official Battle.net unless a mod declares its own realm or you turn the lockdown off. TCP/IP is unaffected.
- **Multiple instances.** Run several copies of a title at once, each with its own registry and log.
- **Launch options.** Every player-facing game switch can be set per title, from the renderer to gamma, vertical sync, `-skiptobnet`, `-act` and `-seed`.

### Protecting your data

- **Save backups.** Characters are backed up when a game closes, and any backup can be restored.
- **Box verification.** Verify a box's integrity, or rebuild it without touching saves.
- **Signed updates.** Exordium installs only Ed25519-signed releases.
- **Local-only mode.** One setting keeps Exordium offline. Games still launch.

### Organizing your library

- **Collections and favorites.** Group titles, and arrange collections and home shelves in your own order.
- **Search and filters.** Search by name, author, folder, version or core, and filter by type, updates, issues and more.
- **Interface languages.** English, French, Spanish and German.
- **Discord Rich Presence.** Shows the title you are playing and your character's class and level.

### For mod authors

- **One manifest.** A single `exordium.mod.json` gives a mod artwork, links, documentation, changelogs and update notices. See [For mod authors](#for-mod-authors).

## Requirements

- Windows 10 or 11. Linux and macOS support is a work in progress.
- Your own copy of Diablo II, and Lord of Destruction for the expansion cores and most mods

Exordium ships no game data. The cores it downloads hold only the per-patch DLLs, `Game.exe`, `Patch_D2.mpq` and the language files. The game's own archives always come from your install.

## Using Exordium

Everything here is also in the app, under **Help**, with a search box.

### Getting started

On first launch Exordium places the game's MPQ archives, `D2.LNG`, video DLLs and graphics wrappers in its library. Automatic mode tries symbolic links first, hardlinks on the same drive second, and a copy last. You can explicitly choose any method, or Move if you intend to remove those files from the original install.

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

**Sections.** The sidebar lists Favorites, your collections, Recent, Mods and Cores. Click a section's header to fold it. Right-click it to view only that section, or to fold every collection at once. The button in the sidebar footer folds the whole sidebar to a strip of icons. Recent can be turned off in Settings, Library.

Search the library from the top of the sidebar. Its filter button filters by mods, cores, favorites, recently played titles, available updates, issues or hidden titles. Filters can be combined, and All titles clears them.

The filter menu also adjusts row height, icon and text sizes, section counts and status indicators. Drag the sidebar's right edge to resize it, and double-click the edge to restore its default width.

**Favorites and collections.** A favorite moves out of Mods or Cores into Favorites. Unfavorite it and it goes back.

Collections are your own groups. Right-click a title, choose Add to, and pick a collection or make a new one. You can also:

- drag titles onto a collection's header to add them;
- drag within a collection to reorder it;
- drag the headers to reorder the collections.

A title can be in several collections. Right-click it inside one to remove it from there.

**The home screen** shows every title as a card. The Latest uploads row above them shows new mods from the Internet Archive and ModDB, and updates waiting for mods you have. Turn the row off in Settings, Library.

Click a shelf's heading to fold it. The home screen remembers its folds separately from the sidebar's. The Library tab always brings you back here.

Use the filter button beside the home search to choose which shelves show and to adjust the cards. Drag categories by their handles to reorder the shelves, and the home screen remembers their order.

**Hiding and uninstalling.** Hide takes a title out of the list without touching its files, and the Hidden filter brings it back. Uninstall deletes the mod from the library, and can keep a copy of its characters first.

### Adding mods

Use **Library, Import** or **Browse**: either way, the mod ends up in the library.

- **From your Diablo II install**: your D2SE mods, each reviewed in the converter before it is copied. Tick *Move instead of copy* to take it out of the install and save the space.
- **From a folder**: a mod already unpacked somewhere. Choose the folder holding its MPQs or its `D2SE_SETUP.ini`; the converter drafts the rest for you to check.
- **From an archive**: a `.zip`, `.7z` or `.rar` as downloaded, unpacked into the library.
- **From Browse**: Install downloads a mod, unpacks it and adds it to the library. Click a mod's picture to open its page on the site.

**The converter** shows the `exordium.mod.json` it will write: the fields on top, and below them the JSON, which you can edit directly. Nothing is copied until you press Import, and your install is never changed unless you chose Move. Imports queue up and run one at a time in the background, so you can leave the converter while they finish: each mod shows in the library with a spinner, and hovering it shows its progress.

**Plugins and PlugY.** Exordium loads D2Mod, PlugY and the mod's own DLLs. It ships no PlugY. A title with PlugY on uses the mod's own `PlugY.dll`. If the mod has none, it uses the PlugY you keep in `library\plugy`, which you can open from Settings, Launching. With neither, it starts without PlugY, with a warning. Some D2SE mods turn PlugY on without shipping it, because D2SE supplied one: give those a PlugY in `library\plugy`, or turn PlugY off in the title's Properties. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not loaded.

Turn PlugY, D2Mod, Nefex and D2Extra on or off for a title in **Properties, Launch, Modding**. The last three need their DLL in the mod or its core. Nefex and D2Extra load, but Exordium does not start them yet.

### Cores

A core is one patch of Diablo II: its DLLs, its `Patch_D2.mpq` and its language files. A mod names the core it needs, such as 1.10f or 1.13c, and runs on top of it. A core can also be played on its own, as vanilla Diablo II.

Cores come from Exordium's catalog, and every download is checked against its published checksum. Install more from Browse, Cores. A mod whose core is missing shows **Install core** instead of Play.

Every core carries the twelve language files: ENG, DEU, FRA, ESP, ITA, POL, POR, RUS, KOR, JPN, CHI and SIN. Choose a title's language in its Properties.

### 1.14

Patch 1.14 merged the game's DLLs into a single `Game.exe`, so Exordium's loader cannot stand in for it. A 1.14 core runs on Blizzard's own `Game.exe`, with fewer features than older cores.

| | 1.00 to 1.13d | 1.14 |
|---|---|---|
| **`Game.exe`** | Exordium's loader | Blizzard's |
| **Loose files in `data`, `-direct`, `-txt`** | Yes | Yes |
| **Mod MPQs and language packs** | Yes | No |
| **PlugY, D2Mod and plugin DLLs** | Yes | No |
| **Game settings** | A private registry | Your machine's Diablo II registry keys |
| **Battle.net lockdown** | Yes | No |

**Getting the core.** 1.14 cores are not in the catalog. If your Diablo II installation is on 1.14, setup copies its `Game.exe`, `Patch_D2.mpq` and `BlizzardError.exe` into `library\cores`, and the core appears in the library. In an existing library, use **Copy from install** in Browse, Cores, or **Install core** on a mod that needs it. Your installation is not changed.

**Running a 1.14d mod.** A 1.14 mod is a `data` folder of loose files.

1. Unpack the mod so that its `data` folder sits at the top of one folder.
2. Add an `exordium.mod.json` beside it:

   ```json
   {
     "title": "My 1.14d Mod",
     "core": "1.14d",
     "launch": {
       "renderer": "ddraw",
       "windowed": true,
       "direct": true,
       "txt": true
     }
   }
   ```

3. Import the folder with **Library, Import**, then press **Play**.

`direct` reads the mod's `data` folder before the game's MPQs, and `txt` compiles the mod's `.txt` tables when the game starts. A mod that lists MPQs or plugin DLLs cannot start on this core, and PlugY is skipped with a warning.

**Before you play.** A 1.14 run writes the title's settings to your machine's Diablo II registry keys and leaves them there, so the next game you start outside Exordium uses them. There is no Battle.net lockdown, so keep modded games off Battle.net yourself. A 1.14 title's page shows both as a warning.

### How a mod runs

**The box.** Each title runs from its own box: a folder made of links to the game files, its core and the mod, with the mod's save folder linked in. Nothing is copied twice, and no mod can change another mod or your install.

If a box ever looks wrong, **Properties, Files, Rebuild Box** brings its links and copied files up to date. Saves are not touched, and they are backed up first.

**The loader.** Before 1.14, a box's `Game.exe` is Exordium's own loader, made to look like that core's `Game.exe`. It opens the MPQs in the right order, loads the plugins, and starts the game.

**The registry.** Each box has a private registry. A mod's video, gateway and Glide settings stay with that mod, and your machine's Diablo II settings are not changed. [1.14](#114) is the exception.

**Several copies.** Press Play again while a title runs to start another copy, for a TCP/IP game with yourself or to play several characters. Each copy has its own registry and log.

### Multiplayer and Battle.net

- **TCP/IP** works as it always has: one player hosts, the others join by address. Every player needs the same mod at the same version.
- **Mod realms.** A mod that runs its own server names it in its `exordium.mod.json`, as a realm with a gateway address. For that mod, Battle.net stays open. Exordium doesn't point the game at the realm yet, so players set the gateway themselves for now.
- **Official Battle.net.** For every other mod, Exordium does not connect to Blizzard's Battle.net. The Battle.net button is greyed out, and every other way onto Battle.net is blocked. Modded games do not belong on Blizzard's servers. Battle.net lockdown in Settings, Launching turns this off for every mod, at your own risk.

### Video and windowed mode

Choose a title's renderer in Properties, Launch. DirectDraw can run in a window. Direct3D and OpenGL are full screen only in these versions of the game.

The same page sets perspective, low quality, vertical sync, gamma and uncompressed sprites. Titles on 1.13 and later also get no fixed aspect ratio and sound in the background.

Glide needs a Glide wrapper (`glide3x.dll`), such as D2GL or dgVoodoo. Setup copies the one in your Diablo II folder, if there is one, and a mod can bring its own. With Glide the window belongs to the wrapper, so its window settings are the wrapper's own, not Exordium's.

### Saves and backups

A mod's characters are in its own save folder, inside the library. To open it, right-click the title, then Manage, Browse local files.

Exordium backs up a title's saves when its last running copy closes, and you can take one by hand from the title's Backups tab. Restoring backs up what is there first, so nothing is lost. The newest 30 automatic backups are kept; backups you take by hand stay until you delete them.

In Settings, Backups you can turn automatic backups off, or move the backups folder somewhere else, such as a cloud-synced folder.

### Settings and files

Everything lives in the **Exordium folder** beside `Exordium.exe`. Each folder is shown, with a button to open it, in its own Settings section: Library, Boxes, Downloads, Backups and Diagnostics.

| Folder | What it holds |
|---|---|
| `library` | The game files, cores, mods and your own PlugY (`library\plugy`). |
| `boxes` | Each title's box. Safe to delete; it is rebuilt on the next Play. |
| `backups` | Save backups. |
| `downloads` | Mods downloaded from Browse. |
| `logs` | Exordium's and the loader's logs. |

Settings worth knowing:

- **Local-only mode** (Privacy): no network at all. Browse, cores, translation and Discord are off; games still launch.
- **Defender troubleshooting mode** (Diagnostics): avoids what antivirus software may flag, if Exordium is being blocked.
- **Minimize Exordium when a game starts** (Launching): it keeps running in the taskbar to back up characters and show Discord activity.
- **Updates**: Exordium checks for a new version when it opens and downloads it in the background. Only releases signed by HarvestLabs are installed, and nothing changes until you restart.
- **Discord**: while a game runs, Discord shows the title and, once you are in a game, your character's class and level (never its name). Turn it off in Settings, Discord.

### Troubleshooting

When a game does not start, open the title's **Logs** tab. Exordium opens it for you unless you turned that off in Settings, Launching. The loader log shows each step of the start, and the last lines usually name the problem.

| Message | What to do |
|---|---|
| Needs core 1.10f, which this install does not have | Press Install core on the mod's page, or install it from Browse, Cores. |
| PlugY is turned on, but no PlugY.dll was found | A warning: the game starts without PlugY. To use it, put PlugY in the mod's folder or in `library\plugy`. |
| The mod changed since the running copy started | A file in the box changed while a copy was running. Close every copy, then start again. |
| Cannot bootstrap gfx: D2Win.dll or D2Gfx.dll did not load | The game's own DLLs are incomplete. Rebuild the box (Properties, Files). If it persists, the core is damaged, so reinstall it. |
| Battle.net could not be closed for this core | The mod replaces the game's `D2Launch.dll` with one Exordium does not recognise. Tell the mod's author. |

Problems with the game window:

- **Black screen or wrong size**: switch the renderer to DirectDraw and tick windowed in Properties, Launch.
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
Every patch from 1.00 to 1.13d. 1.14 runs too, on Blizzard's own `Game.exe` copied from your installation, but without plugins, custom MPQs, a private registry or the Battle.net lockdown. See [1.14](#114).

**How do I run a 1.14d mod?**
Your Diablo II installation must be on 1.14d, so that Exordium can copy its core. Then import the mod's `data` folder with an `exordium.mod.json` that sets `"core": "1.14d"`. See [Running a 1.14d mod](#114).

**Why is the Battle.net button grey?**
Exordium does not connect modded games to Blizzard's Battle.net. A mod with its own realm names it in its `exordium.mod.json`, and for that mod Battle.net is open. Turning off Battle.net lockdown in Settings, Launching opens it for every mod. TCP/IP games always work.

**Can I play with friends?**
Yes: over TCP/IP, with everyone on the same mod and version, or on the mod's own realm if it has one.

**Can I run two copies at once?**
Yes. Press Play again while a title runs; each copy gets its own registry and log.

**How much disk space does it need?**
With the default linked game layer, only a few MB per core and each mod's own size. Copying the game layer independently adds about 2 GB. Boxes are made of links, so they take almost nothing. When importing from D2SE, *Move instead of copy* avoids keeping a mod twice.

**Does it work with PlugY, D2Mod and other plugins?**
Yes. D2Mod and other plugin DLLs load when the mod brings and lists them. PlugY is the mod's own, else the one you keep in `library\plugy`; Exordium ships none. D2SE's own plugin systems are not loaded.

**Does it work with D2GL, dgVoodoo and other wrappers?**
Yes. Setup links or copies the wrappers in your Diablo II folder, and a mod can bring its own. With Glide, the wrapper's own settings decide the window.

**What does Rebuild Box do?**
It remakes the title's box from the library, bringing links and copied files up to date. Saves are not touched, and are backed up first.

**What does Exordium show on Discord?**
The title you are playing, how long you have played, and, once you are in a game, your character's class and level, never its name. Settings, Discord turns it off.

**How do updates work?**
Exordium checks for a new version when it opens and downloads it in the background. Only releases signed by HarvestLabs are installed, and nothing changes until you choose to restart.

**Does Exordium need the internet?**
Only for Browse, cores, updates, Discord, a realm check and Translate, which sends that one description to Google. With Local-only mode on (Settings, Privacy) it never goes online, and games still launch.

**My antivirus flagged Exordium. Is it safe?**
Exordium starts games in an unusual way, which some antivirus software mistakes for a threat. Turn on Defender troubleshooting mode in Settings, Diagnostics, and restore the file from quarantine.

## For mod authors

### The manifest

A mod describes itself in `exordium.mod.json`, in its top folder, beside its MPQs. It wins over a `D2SE_SETUP.ini` when a mod has both. A mod with only a `D2SE_SETUP.ini` still works: the converter drafts a manifest from it on import, and the player reviews it there.

A title's **Properties** is a form over this file: **About**, **Launch**, **Realm**, **Updates** and **Art** edit its fields, and Apply writes them to `exordium.mod.json`. A D2SE mod without one gets it on its first Apply, and from then on the file is what runs.

Only `core` is required, so this is a complete manifest:

```json
{
  "core": "1.10f"
}
```

A fuller one:

```json
{
  "title": "The Black Soul",
  "version": "0.9.0",
  "core": "1.10f",
  "author": "HarvestLabs",
  "description": "A darker Diablo II.",
  "readme": "Documentation/ReadMe.txt",
  "art": {
    "banner": "art/banner.png",
    "icon": "art/icon.png",
    "portrait": "art/portrait.png"
  },
  "links": [
    { "label": "Discord", "url": "https://discord.gg/your-invite" }
  ],
  "update": { "endpoint": "updates.json", "channel": "stable" },
  "launch": {
    "renderer": "glide",
    "windowed": true,
    "direct": true,
    "txt": true
  },
  "loads": {
    "d2mod": true,
    "mpqs": ["BlackSoul.mpq"],
    "dlls": []
  }
}
```

The machine-readable schema is [`docs/exordium.mod.schema.json`](docs/exordium.mod.schema.json), with an example beside it.

**How to write the values.** The file is JSON, and the wrong type is usually ignored without a word.

| Type | Looks like | Notes |
|---|---|---|
| text (string) | `"1.10f"` | In double quotes, numbers too: a version is `"1.2"`, not `1.2`. |
| true or false (boolean) | `true` | Lower case, no quotes. |
| number | `3` | Digits only, no quotes. |
| list (array) | `["One.mpq", "Two.mpq"]` | A list of one still needs its brackets. `[]` is empty. |
| group (object) | `{ "windowed": true }` | Named fields with commas between them. |
| null | `null` | Not set, the same as leaving the field out. |

Use double quotes only, a comma between entries but none after the last, and no comments. Paths are relative to the mod's folder and use forward slashes. A line break inside text is written `\n`. If the file isn't valid JSON, the mod's page says so and Play stays off until it's fixed.

**Top-level fields**

| Field | Type | If left out | Example | What it does |
|---|---|---|---|---|
| `core` | text | required | `"1.10f"` | The patch the mod runs on, spelled exactly as the cores are: 1.00, 1.01, 1.02, 1.03, 1.04b, 1.04c, 1.05, 1.05b, 1.06, 1.06b, 1.07, 1.08, 1.09, 1.09b, 1.09d, 1.10f, 1.11, 1.11b, 1.12a, 1.13c or 1.13d, or 1.14d ([1.14](#114)). |
| `title` | text | the folder's name | `"The Black Soul"` | The name the library shows. |
| `version` | text | none | `"0.9.0"` | Shown under the title, and compared against your update feed. Keep the quotes. |
| `author` | text | none | `"HarvestLabs"` | Shown as BY at the top of the mod's page. |
| `description` | text | none | `"A darker Diablo II."` | Shown as About this mod on the mod's page. Line breaks are kept. |
| `readme` | text | none | `"Documentation/ReadMe.txt"` | The file to list first under Documentation, or a web address ([Documentation](#documentation)). |
| `art` | group | none | see below | The mod's pictures. |
| `links` | list of groups | `[]` | see below | Buttons on the mod's page. |
| `update` | group | none | see below | Where to look for new versions. |
| `launch` | group | none | see below | How the game starts. |
| `loads` | group | none | see below | What is loaded into the game. |
| `realm` | group | none | see below | The mod's own server, if it has one. |

**`art`** holds paths to images in the mod's folder. Sizes are under [Art and links](#art-screenshots-and-links).

| Field | Type | If left out | Example | What it does |
|---|---|---|---|---|
| `banner` | text | none | `"art/banner.png"` | The header of the mod's page. PNG, JPEG, WebP, GIF or BMP. |
| `icon` | text | none | `"art/icon.png"` | The sidebar, the game window and desktop shortcuts. PNG only: any other format is ignored. |
| `portrait` | text | none | `"art/portrait.png"` | The card on the library home. PNG, JPEG, WebP, GIF or BMP. |

**`links`** is a list of groups, one per button. Square brackets around it, even for a single link.

```json
"links": [
  { "label": "Discord", "url": "https://discord.gg/your-invite" },
  { "label": "Website", "url": "https://example.com" }
]
```

| Field | Type | If left out | Example | What it does |
|---|---|---|---|---|
| `url` | text | required | `"https://example.com"` | A web address starting with `http://` or `https://`. Anything else is dropped. |
| `label` | text | the site's name | `"Discord"` | The button's text. |

**`update`** points at your feed. Its format is under [Updates](#updates).

| Field | Type | If left out | Example | What it does |
|---|---|---|---|---|
| `endpoint` | text | none | `"updates.json"` | Your update feed: a web address, or a file path relative to the mod's folder. |
| `channel` | text | `"stable"` | `"testing"` | `stable`, `testing` or `local`. Anything else is ignored, with a warning. Players can change it. |
| `automatic` | true or false | `true` | `false` | Fills in the Automatic updates switch in Properties. It does nothing else yet. |
| `background` | true or false | `true` | `false` | Fills in the Allow background downloads switch in Properties. It does nothing else yet. |

**`launch`** holds how the mod starts. Properties, Launch edits it.

| Field | Type | If left out | Example | What it does |
|---|---|---|---|---|
| `renderer` | text | `"glide"` | `"ddraw"` | `glide`, `ddraw` (DirectDraw), `d3d` (Direct3D) or `opengl`. Anything else falls back to `glide`, with a warning. |
| `windowed` | true or false | `false` | `true` | Start in a window instead of full screen. |
| `noSound` | true or false | `false` | `true` | Start without sound (`-ns`). |
| `direct` | true or false | `false` | `true` | Read loose files from the mod's `data` folder before the MPQs (`-direct`). Always on with PlugY. |
| `txt` | true or false | `false` | `true` | Compile `data\global\excel\*.txt` into `.bin` at startup (`-txt`). |
| `hardcore` | true or false | `true` | `false` | Allow hardcore characters. |
| `plugY` | true or false | `false` | `true` | Load PlugY (see below). |
| `language` | text | `"MOD"` | `"DEU"` | `MOD` uses the mod's own text and no language folder. Otherwise one of ENG, DEU, FRA, ESP, ITA, POR, POL, RUS, CHI, JPN, KOR or SIN. |
| `skipToBNet` | true or false | `false` | `true` | Start at the Battle.net login (`-skiptobnet`). Needs a realm. |
| `seed` | number or text | none | `12345` | A map seed (`-seed`), digits only, up to 10 of them. Anything else is ignored. |
| `startAct` | number | none | `2` | New single-player characters start in this act: 1 to 5 (`-act2` and so on). |
| `seedEnabled`, `startActEnabled`, `gammaEnabled` | true or false | on | `false` | `false` keeps the value in the file but leaves it out of the launch. |
| `perspective` | true or false | `false` | `true` | Perspective (`-per`), on the Glide, OpenGL and Direct3D renderers. |
| `lowQuality` | true or false | `false` | `true` | Low quality (`-lq`). |
| `gamma` | number | none | `180` | Gamma (`-gamma`), 1 to 255. The game's own default is 155. |
| `vsync` | true or false | `false` | `true` | Vertical sync (`-vsync`). |
| `noCompress` | true or false | `false` | `true` | Keep sprites uncompressed in memory (`-nocompress`). |
| `noFixAspect` | true or false | `false` | `true` | No fixed aspect ratio (`-nofixaspect`). 1.13 and later. |
| `backgroundSound` | true or false | `false` | `true` | Keep the sound playing behind other windows (`-sndbkg`). 1.13 and later. |

**`loads`** is what the game loads besides its own files. A file named here that the mod doesn't ship is an error, and Play stays off.

| Field | Type | If left out | Example | What it does |
|---|---|---|---|---|
| `mpqs` | list of text | `[]` | `["BlackSoul.mpq"]` | Your MPQs. The first has the lowest priority, the last wins. There is no limit on how many. |
| `dlls` | list of text | `[]` | `["MyPlugin.dll"]` | Other plugin DLLs, loaded in this order. |
| `d2mod` | true or false | `false` | `true` | Load `D2Mod.dll` from the mod's top folder. |
| `nefex` | true or false | `false` | `true` | Load `Nefex.dll` from the mod's top folder. |
| `d2extra` | true or false | `false` | `true` | Load `D2Extra.dll` from the mod's top folder. |

**`realm`** is only for a mod with its own server ([Realms](#realms)). Every value is text, so `timezone` and `port` keep their quotes.

| Field | Type | If left out | Example | What it does |
|---|---|---|---|---|
| `gateway` | text | none | `"realm.example.com"` | The server's address. Setting it leaves Battle.net open for this mod. |
| `gatewayName` | text | none | `"My Realm"` | The realm's name. |
| `selected` | text | none | `"My Realm"` | The gateway to select. |
| `timezone` | text | none | `"-5"` | Hours from UTC. |
| `port` | text | none | `"6112"` | The server's port. |

**Plugins and PlugY.** If the mod uses PlugY, ship `PlugY.dll` at the mod's root, or in a `PlugY` folder as D2SE mods do. Exordium does not provide one. Without it, the player's own PlugY in `library\plugy` is used if they have one; otherwise the game starts without PlugY, with a warning. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not loaded.

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
| `banner` | The header of the mod's page. | Wide, 4:1. 1920x480 is recommended |
| `icon` | The sidebar, and the game's own icon in the taskbar and on desktop shortcuts. | Square, 1:1. 256x256 is recommended, and the largest stored |
| `portrait` | The card on the library home. | Portrait, 2:3. 600x900 is recommended |

Name them under `art` in `exordium.mod.json`, as paths in the mod's folder. A banner or portrait can be PNG, JPEG, WebP, GIF or BMP; an icon must be PNG. A mod without a portrait shows its icon and name over its banner; without either, it shows its initials. Properties, Art sets them too: a chosen image is saved in the title's folder and named here.

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

Exordium closes official Battle.net for every mod, unless the mod names its own server. Give `realm` a gateway address, and Battle.net stays open for your mod; `-skiptobnet` goes straight to the login.

Properties, Realm edits these fields, and **Check now** shows whether the server answers on that port. It runs only when asked, and not in Local-only mode. An answer means the server is listening, not that you can log in.

**Not done yet:** Exordium doesn't put these values into the game. It only checks that `gateway` is set, so the game still uses whichever gateway its registry already holds. Players have to point it at your server themselves for now.

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
deno task build:loader  # native/loader/build/exordium-game.exe, and a copy per core as game/<core>/Game.exe
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

Packaging needs Deno 2.9.8 or newer, because older versions pack a laufey build that crashes at window creation on Windows. Close the app before rebuilding, because Windows locks its files while it runs.

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

Exordium is free software under the [GNU General Public License, version 3 or later](LICENSE), with additional terms under section 7(b) in [NOTICE](NOTICE): every copy, modified or not, keeps the author attribution and the credits above, in the source and on the app's Help, About page. A modified version can add its own authors beside them, but cannot remove them.

Diablo II is a trademark of Blizzard Entertainment. Exordium is not affiliated with or endorsed by Blizzard.
