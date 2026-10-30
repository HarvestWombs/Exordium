/**
 * Help's text, as data so it can be searched: each topic is a few sections of paragraphs and lists,
 * and the FAQ is questions and answers. `**bold**` marks emphasis. Keep it true to what Exordium
 * does: when a feature changes, change its words here.
 */

export interface HelpSection {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
  /** A numbered list. */
  steps?: string[];
  /** A preformatted example: JSON, a folder layout. */
  code?: string;
}

export interface HelpTopicContent {
  id: string;
  /** A heading the topic is listed under in Help's sidebar. */
  group?: string;
  label: string;
  title: string;
  intro: string;
  sections: HelpSection[];
}

export interface FaqEntry {
  q: string;
  a: string[];
}

export const TOPICS: HelpTopicContent[] = [
  {
    id: "start",
    label: "Getting started",
    title: "Getting started",
    intro: "Exordium runs Legacy Diablo II mods, each in its own sealed box.",
    sections: [
      {
        paragraphs: [
          "On first launch Exordium links your Diablo II install and copies what it needs into its own library: the game's MPQ archives, D2.LNG, the video DLLs and any graphics wrappers. From then on your install is only read, never changed. You need Diablo II and, for most mods, Lord of Destruction.",
          "Next it downloads the cores you choose: each one is a patch of the game, from 1.00 to 1.13d. Then you add mods: from your D2SE install, a folder, an archive, or Browse.",
        ],
      },
      {
        heading: "Your first game",
        steps: [
          "Pick a mod in the library and press Play.",
          "The first start builds its box, which takes a moment; later starts reuse it.",
          "Your characters live in the mod's own save folder, and are backed up when the game closes.",
        ],
      },
      {
        heading: "Finding your way",
        list: [
          "**Library**: everything you have, with its page, its characters and its settings.",
          "**Browse**: mods from the Internet Archive and ModDB, the cores catalog, and your downloads.",
          "**Settings**: how Exordium itself behaves.",
          "**Help**: this page. The search box above the topics looks through all of it.",
        ],
      },
    ],
  },
  {
    id: "library",
    label: "Your library",
    title: "Your library",
    intro: "What the sidebar and the home screen show, and how to arrange them.",
    sections: [
      {
        heading: "Sections",
        paragraphs: [
          "The sidebar lists Favorites, your collections, Recent, Mods and Cores. Click a section's header to fold it; right-click it to view only that section, or to fold every collection at once. The « button folds the whole sidebar to a strip of icons. Recent can be turned off in Settings, Library.",
          "The chips under the search box filter the list: All, Mods, Cores, Issues (titles with problems) and, once you hide something, Hidden.",
        ],
      },
      {
        heading: "Favorites and collections",
        paragraphs: [
          "A favorite moves out of Mods or Cores into Favorites; unfavorite it and it goes back.",
          "Collections are your own groups: right-click a title, then Add to, and pick one or make a new one. Drag titles onto a collection's header to add them, drag within a collection to reorder it, and drag the headers to reorder the collections. A title can be in several collections; right-click it inside one to remove it from there.",
        ],
      },
      {
        heading: "The home screen",
        paragraphs: [
          "The home screen shows every title as a card, with Latest uploads above: new mods from the Internet Archive and ModDB, and updates waiting for mods you have. Turn the row off in Settings, Library. Click a shelf's heading to fold it; the home screen remembers its folds apart from the sidebar's. Click the Library tab at any time to come back here.",
        ],
      },
      {
        heading: "Hiding and uninstalling",
        paragraphs: [
          "Hide takes a title out of the list without touching its files; the Hidden filter brings it back. Uninstall deletes the mod from the library, and can keep a copy of its characters first.",
        ],
      },
    ],
  },
  {
    id: "mods",
    label: "Adding mods",
    title: "Adding mods",
    intro: "Library, Import, or Browse: every mod ends up in the library.",
    sections: [
      {
        heading: "Import",
        list: [
          "**From your Diablo II install**: your D2SE mods, each reviewed in the converter before it is copied. Tick Move instead of copy to take it out of the install and save the space.",
          "**From a folder**: a mod already unpacked somewhere. Choose the folder holding its MPQs or its D2SE_SETUP.ini; the converter drafts the rest for you to check.",
          "**From an archive**: a .zip, .7z or .rar as downloaded, unpacked into the library.",
        ],
      },
      {
        heading: "The converter",
        paragraphs: [
          "The converter shows the exordium.mod.json it will write: the fields on top, the JSON below, which you can edit directly. Nothing is copied until you press Import, and your install is never changed unless you chose Move.",
        ],
      },
      {
        heading: "Browse",
        paragraphs: [
          "Browse lists mods from the Internet Archive and ModDB. Install downloads one, unpacks it with 7-Zip and adds it to the library. Click a mod's picture to open its page on the site.",
        ],
      },
      {
        heading: "exordium.mod.json",
        paragraphs: [
          "Each mod carries an exordium.mod.json: its title, its core, its art, how it launches, which MPQs and plugins it loads, and an optional realm. The converter drafts it for you; edit it any time in the title's Properties. A mod's own exordium.mod.json is used as it is.",
        ],
      },
      {
        heading: "Plugins and PlugY",
        paragraphs: [
          "Exordium loads D2Mod, PlugY and the mod's own DLLs. It ships no PlugY. A title with PlugY on uses the mod's own PlugY.dll; failing that, one you put in its core's folder (library, cores); failing that, the PlugY folder you set in Settings, Launching. With none of those it starts without PlugY, and its page says so. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not loaded.",
          "Some D2SE mods turn PlugY on without shipping it, because D2SE supplied one. Give those a PlugY through the core's folder or Settings, or turn PlugY off in the title's Properties.",
        ],
      },
    ],
  },
  {
    id: "cores",
    label: "Cores",
    title: "Cores",
    intro: "The game version a mod is built on.",
    sections: [
      {
        paragraphs: [
          "A core is one patch of Diablo II: its DLLs, its Patch_D2.mpq and its language files. A mod names the core it needs, such as 1.10f or 1.13c, and runs on top of it.",
          "Cores come from Exordium's catalog, and every download is checked against its published checksum. Install more from Browse, Cores. A mod whose core is missing shows Install core instead of Play.",
        ],
      },
      {
        heading: "Languages",
        paragraphs: [
          "Every core carries the twelve language files (ENG, DEU, FRA, ESP, ITA, POL, POR, RUS, KOR, JPN, CHI, SIN). Choose a title's language in its Properties.",
        ],
      },
      {
        heading: "1.14",
        paragraphs: [
          "1.14 still launches, through Blizzard's own Game.exe, but gets none of Exordium's loader features: no plugins, no custom MPQs, and no Battle.net lockdown.",
        ],
      },
    ],
  },
  {
    id: "boxes",
    label: "How a mod runs",
    title: "How a mod runs",
    intro: "Boxes, the loader and the registry.",
    sections: [
      {
        heading: "The box",
        paragraphs: [
          "Each title runs from its own box: a folder made of links to the game files, its core and the mod, with the mod's save folder linked in. Nothing is copied twice, and no mod can change another or your install.",
          "If a box ever looks wrong, Properties, Files, Rebuild Box brings its links and copied files up to date. Saves are not touched, and they are backed up first.",
        ],
      },
      {
        heading: "The loader",
        paragraphs: [
          "Before 1.14, a box's Game.exe is Exordium's own loader, made to look like that core's Game.exe. It opens the MPQs in the right order, loads the plugins, and starts the game.",
        ],
      },
      {
        heading: "The registry",
        paragraphs: [
          "Each box has a private registry. A mod's video, gateway and Glide settings stay with that mod, and your machine's Diablo II settings are never touched.",
        ],
      },
      {
        heading: "Several copies",
        paragraphs: [
          "Press Play again while a title runs to start another copy: for a TCP/IP game with yourself, or to play several characters. Each copy has its own registry and log.",
        ],
      },
    ],
  },
  {
    id: "multiplayer",
    label: "Multiplayer & Battle.net",
    title: "Multiplayer and Battle.net",
    intro: "TCP/IP games, mod realms, and why official Battle.net is closed.",
    sections: [
      {
        heading: "TCP/IP",
        paragraphs: [
          "Other Multiplayer, TCP/IP works as it always has: one player hosts, the others join by address. Every player needs the same mod at the same version.",
        ],
      },
      {
        heading: "Mod realms",
        paragraphs: [
          "A mod that runs its own server names it in its exordium.mod.json (a realm with a gateway address). For that mod, Battle.net stays open and connects to the mod's realm.",
        ],
      },
      {
        heading: "Official Battle.net",
        paragraphs: [
          "For every other mod, Exordium does not connect to Blizzard's Battle.net: the Battle.net button is greyed out, and Open Battle.net does nothing. Modded games do not belong on Blizzard's servers.",
        ],
      },
    ],
  },
  {
    id: "video",
    label: "Video & windowed",
    title: "Video and windowed mode",
    intro: "Renderers, windows and graphics wrappers.",
    sections: [
      {
        paragraphs: [
          "Choose a title's renderer in Properties, General. DirectDraw can run in a window; Direct3D and OpenGL are full screen only in these versions of the game.",
          "Glide needs a Glide wrapper (glide3x.dll), such as D2GL or dgVoodoo. Setup copies the one in your Diablo II folder, if there is one, and a mod can bring its own. With Glide the window belongs to the wrapper, so its window settings are the wrapper's own, not Exordium's.",
        ],
      },
    ],
  },
  {
    id: "saves",
    label: "Saves & backups",
    title: "Saves and backups",
    intro: "Where characters live, and how to bring one back.",
    sections: [
      {
        paragraphs: [
          "A mod's characters are in its own save folder, inside the library. Right-click the title, Manage, Browse local files to open it.",
          "Exordium backs up a title's saves when its last running copy closes, and you can take one by hand from the title's Backups tab. Restoring takes a backup of what is there first, so nothing is lost. The newest 30 automatic backups are kept; backups you take by hand stay until you delete them.",
          "In Settings, Backups you can turn automatic backups off, or move the backups folder somewhere else, such as a cloud-synced folder.",
        ],
      },
    ],
  },
  {
    id: "files",
    label: "Settings & files",
    title: "Settings and files",
    intro: "Where Exordium keeps things, and the settings worth knowing.",
    sections: [
      {
        heading: "Where things are",
        list: [
          "**The Exordium folder**: beside Exordium.exe. Each folder is shown, with a button to open it, in its own Settings section: Library, Boxes, Downloads, Backups and Diagnostics.",
          "**library**: the game files, cores and mods Exordium runs.",
          "**boxes**: each title's box. Safe to delete; it is rebuilt on the next Play.",
          "**backups**, **downloads** and **logs**: what their names say.",
        ],
      },
      {
        heading: "Settings worth knowing",
        list: [
          "**Local-only mode** (Privacy): no network at all. Browse, cores, translation and Discord are off; games still launch.",
          "**Defender troubleshooting mode** (Diagnostics): avoids what antivirus software may flag, if Exordium is being blocked.",
          "**Minimize Exordium when a game starts** (Launching): it keeps running in the taskbar to back up characters and show Discord activity.",
          "**Updates**: Exordium checks for a new version when it opens and downloads it in the background. Only releases signed by HarvestLabs are installed, and nothing changes until you restart.",
        ],
      },
      {
        heading: "Discord",
        paragraphs: [
          "While a game runs, Discord shows the title and, once you are in a game, your character's class and level (never its name). Turn it off in Settings, Discord.",
        ],
      },
    ],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    title: "Troubleshooting",
    intro: "What the messages mean, and what to do.",
    sections: [
      {
        heading: "Start with the log",
        paragraphs: [
          "When a game does not start, open the title's Logs tab (Exordium opens it for you unless Settings, Launching says otherwise). The loader log shows each step of the start, and the last lines usually name the problem.",
        ],
      },
      {
        heading: "Common messages",
        list: [
          "**Needs core 1.10f, which this install does not have**: press Install core on the mod's page, or install it from Browse, Cores.",
          "**PlugY is turned on, but no PlugY.dll was found**: a warning, not a stop; the game starts without PlugY. To use it, put PlugY in the mod's folder or its core's folder, or set a PlugY folder in Settings, Launching. Or turn PlugY off in the title's Properties.",
          "**The mod changed since the running copy started**: a file in the box changed while a copy was running. Close every copy, then start again.",
          "**Cannot bootstrap gfx: D2Win.dll or D2Gfx.dll did not load**: the game's own DLLs are incomplete. Rebuild the box (Properties, Files); if it persists, the core is damaged, so reinstall it.",
          "**Battle.net could not be closed for this core**: the mod replaces the game's D2Launch.dll with one Exordium does not recognise. Tell the mod's author.",
        ],
      },
      {
        heading: "The game window",
        list: [
          "**Black screen or wrong size**: switch the renderer to DirectDraw and tick windowed in Properties, General.",
          "**Glide shows nothing**: the mod needs a Glide wrapper; see Video and windowed mode.",
        ],
      },
      {
        heading: "Antivirus",
        paragraphs: [
          "If your antivirus blocks or deletes part of Exordium, turn on Defender troubleshooting mode in Settings, Diagnostics, and restore the file from quarantine.",
        ],
      },
    ],
  },
  {
    id: "authors",
    group: "For mod authors",
    label: "The manifest",
    title: "The mod's manifest",
    intro: "exordium.mod.json: everything Exordium needs to know about a mod, in one file at its root.",
    sections: [
      {
        paragraphs: [
          "Put an exordium.mod.json in the mod's top folder. A mod with only a D2SE_SETUP.ini still works: the converter drafts a manifest from it on import, and the player reviews it there. Every field is optional except core, and every path is relative to the mod's folder.",
        ],
        code: `{
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
}`,
      },
      {
        heading: "The fields",
        list: [
          "**title**, **version**, **author**, **description**: what the library and the mod's page show. version is also what update checks compare against.",
          "**core**: the patch the mod runs on, spelled as the cores are: 1.00 to 1.13d, such as 1.10f or 1.13c.",
          "**readme**: the documentation page to list first (see Documentation).",
          "**art**: the banner, icon and portrait (see Art & links).",
          "**links**: buttons on the mod's page (see Art & links).",
          "**update**: where to look for new versions (see Updates).",
          "**launch**: how the game starts: renderer (glide, ddraw, d3d or opengl), windowed, noSound, direct, txt, hardcore, plugY, language, skipToBNet, seed and startAct. These are the mod's defaults; players can change them in Properties.",
          "**loads**: what is loaded into the game: d2mod (D2Mod.dll), mpqs (your MPQs, lowest priority first) and dlls (other plugin DLLs, in load order).",
          "**realm**: the mod's own server, if it has one (see Realms).",
        ],
      },
      {
        heading: "Plugins and PlugY",
        paragraphs: [
          "Ship PlugY.dll at the mod's root, or in a PlugY folder as D2SE mods do, if the mod uses PlugY. Exordium does not provide one. Without it, a player's own PlugY (in the core's folder, or the PlugY folder in Settings) is used if they have one; otherwise the game starts without PlugY, with a warning. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not loaded.",
        ],
      },
      {
        heading: "Languages",
        paragraphs: [
          "Every core carries the twelve language MPQs. A mod that ships its own texts for a language puts them in a Language_ENG (or DEU, FRA and so on) folder, which is used when the player picks that language. Set launch.language to MOD to use no language folder at all.",
        ],
      },
    ],
  },
  {
    id: "authors-docs",
    group: "For mod authors",
    label: "Documentation",
    title: "Documentation",
    intro: "What appears in a mod's Documentation tab, and how to make sure yours does.",
    sections: [
      {
        heading: "What is picked up",
        paragraphs: [
          "Exordium looks through the mod's own files; nothing has to be registered. Pages can be HTML (.html, .htm), plain text (.txt, .md, .nfo) or RTF (.rtf). Markdown is shown as plain text, not rendered.",
        ],
        list: [
          "**The readme you name**: readme in exordium.mod.json (or D2SE's ModReadme) is always listed first.",
          "**Sites**: a folder holding an index.html is one site, listed once by its index however many pages it has. Its links between pages work.",
          "**HTML pages** at the mod's top level, or anywhere inside a folder named doc, docs, documentation, manual, guide, help, readme or html.",
          "**Text and RTF files** at the top level whose names look like documentation (readme, manual, guide, faq, instructions, install, info, description, about), and any text file inside one of the folders above.",
        ],
      },
      {
        heading: "What a page can use",
        paragraphs: [
          "Pages are shown inside Exordium with scripts switched off. Stylesheets (.css) and images (.png, .jpg, .gif, .bmp, .webp, .ico) next to them load; JavaScript and SVG do not. A page that builds itself with scripts, as some table viewers do, shows blank: generate static HTML instead.",
          "A mod lists at most 40 documentation pages, so a large site belongs in one folder with an index.html rather than loose pages.",
        ],
      },
      {
        heading: "A layout that works",
        code: `MyMod/
  exordium.mod.json        "readme": "Documentation/ReadMe.txt"
  Documentation/
    ReadMe.txt             listed first
    Install.txt
    Runewords/index.html   one site: "Runewords (site)"
    Runewords/page2.html
    Runewords/style.css`,
      },
    ],
  },
  {
    id: "authors-changelogs",
    group: "For mod authors",
    label: "Changelogs",
    title: "Changelogs",
    intro: "The Changelogs tab, and the What's new excerpt on a mod's page.",
    sections: [
      {
        heading: "What counts as a changelog",
        paragraphs: [
          "Any page (.txt, .md, .nfo, .html, .htm or .rtf) anywhere in the mod whose file name contains changelog, change log, changes, history, what's new, patch notes or release notes. They are listed in the Changelogs tab, not under Documentation.",
        ],
      },
      {
        heading: "Order, and What's new",
        paragraphs: [
          "Changelogs are sorted newest first by a date in the file name or its folder: 2026-10-14, 2026_10_14 or 2026.10.14, or 10-14-2026. Files without a date come after the dated ones. The newest one's opening lines are what the mod's Overview shows under What's new.",
        ],
        list: [
          "**One file per release**: name each with its date, such as Changelog 2026-10-14.txt; the newest is always on top.",
          "**One running file**: a single Changelog.txt with the newest release at the top. What's new shows its first lines, so start with the latest changes.",
        ],
      },
    ],
  },
  {
    id: "authors-art",
    group: "For mod authors",
    label: "Art & links",
    title: "Art, screenshots and links",
    intro: "How a mod looks in the library, and the buttons on its page.",
    sections: [
      {
        heading: "Art",
        list: [
          "**banner**: the header of the mod's page. 1920x500 or larger.",
          "**icon**: the sidebar, and the game's own icon in the taskbar and on desktop shortcuts. Square, 256x256.",
          "**portrait**: the card on the library home. 600x900 (2:3).",
        ],
        paragraphs: [
          "Name them under art in exordium.mod.json, as paths in the mod's folder. PNG, JPEG, WebP, GIF, BMP and ICO all work. A mod without a portrait shows its icon and name over its banner; without either, its initials. Players can replace any of them in Properties, Artwork, without touching the mod.",
        ],
      },
      {
        heading: "Screenshots",
        paragraphs: [
          "Images (.png, .jpg, .gif, .bmp, .webp) in a Screenshots folder at the mod's root show in the mod's Screenshots tab, and a few of them on its Overview.",
        ],
      },
      {
        heading: "Links",
        paragraphs: [
          "links is a list of label and url pairs, each a button on the mod's page that opens in the browser. Only web addresses (http or https) are kept; a link without a label is named after its site. A D2SE mod's homepage and forum are carried over too.",
        ],
      },
    ],
  },
  {
    id: "authors-updates",
    group: "For mod authors",
    label: "Updates",
    title: "Updates",
    intro: "Telling players a new version of the mod is out.",
    sections: [
      {
        paragraphs: [
          "Point update.endpoint at a feed: a web address, or a file path relative to the mod's folder (handy for testing). Exordium reads the feed, picks the release for the player's channel, and compares its version with the mod's own version. When they differ, the mod's Updates page says a new version is out, with its notes and a link to its page, and the mod appears in the library's Latest uploads row.",
          "Exordium does not download or install mod updates itself: players follow the release's page.",
        ],
        code: `{
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
}`,
      },
      {
        heading: "Channels",
        paragraphs: [
          "A release's channel is stable (the default) or testing. Players on Testing get the first testing release, or the first stable one when there is none. Put the newest release first in the list: the first match is the one shown.",
        ],
      },
    ],
  },
  {
    id: "authors-realms",
    group: "For mod authors",
    label: "Realms",
    title: "Realms",
    intro: "Mods with their own Battle.net-style server.",
    sections: [
      {
        paragraphs: [
          "Exordium closes official Battle.net for every mod, unless the mod names its own server. Give realm a gateway address, and Battle.net stays open for your mod and connects there; -skiptobnet goes straight to it.",
        ],
        code: `"realm": {
  "gateway": "realm.example.com",
  "gatewayName": "My Realm",
  "timezone": "-5",
  "selected": "My Realm",
  "port": "6112"
}`,
      },
      {
        paragraphs: [
          "A D2SE mod's realm settings (RealmGateway and the rest) are carried over by the converter. TCP/IP games need nothing: they always work.",
        ],
      },
    ],
  },
];

export const FAQ: FaqEntry[] = [
  {
    q: "Do I need to own Diablo II?",
    a: [
      "Yes. Exordium ships no game data: the MPQ archives come from your own install. Most mods need Lord of Destruction too.",
    ],
  },
  {
    q: "Does Exordium change my Diablo II install?",
    a: [
      "No. Setup reads your install and copies what it needs into Exordium's own library. The only exception is the converter's Move option, which takes a mod out of your install when you ask it to.",
    ],
  },
  {
    q: "Can I keep using D2SE?",
    a: [
      "Yes. Importing copies a mod into Exordium, so your D2SE install and its mods keep working as they did, unless you chose Move.",
    ],
  },
  {
    q: "Where are my characters saved?",
    a: [
      "In the mod's own save folder, inside Exordium's library. Right-click the title, Manage, Browse local files. Each title's Backups tab keeps copies.",
    ],
  },
  {
    q: "Which versions of the game are supported?",
    a: [
      "Every patch from 1.00 to 1.13d. 1.14 launches too, through Blizzard's own Game.exe, but without plugins, custom MPQs or the Battle.net lockdown.",
    ],
  },
  {
    q: "Why is the Battle.net button grey?",
    a: [
      "Exordium does not connect modded games to Blizzard's Battle.net. A mod with its own realm names it in its exordium.mod.json, and for that mod Battle.net is open. TCP/IP games always work.",
    ],
  },
  {
    q: "Can I play with friends?",
    a: [
      "Yes: TCP/IP, with everyone on the same mod and version, or the mod's own realm if it has one.",
    ],
  },
  {
    q: "Can I run two copies at once?",
    a: ["Yes. Press Play again while a title runs; each copy gets its own registry and log."],
  },
  {
    q: "How much disk space does it need?",
    a: [
      "About 2 GB for the game files, a few MB per core, and each mod's own size. Boxes are made of links, so they take almost nothing. When importing from D2SE, Move instead of copy avoids keeping a mod twice.",
    ],
  },
  {
    q: "Does it work with PlugY, D2Mod and other plugins?",
    a: [
      "Yes. D2Mod and other plugin DLLs load when the mod brings and lists them. PlugY is the mod's own, else one you put in the core's folder or set in Settings, Launching; Exordium ships none. D2SE's own plugin systems are not loaded.",
    ],
  },
  {
    q: "Does it work with D2GL, dgVoodoo and other wrappers?",
    a: [
      "Yes. Setup copies the wrappers in your Diablo II folder, and a mod can bring its own. With Glide, the wrapper's own settings decide the window.",
    ],
  },
  {
    q: "What does Rebuild Box do?",
    a: [
      "It remakes the title's box from the library: links and copied files brought up to date. Saves are not touched, and are backed up first.",
    ],
  },
  {
    q: "What does Exordium show on Discord?",
    a: [
      "The title you are playing, how long you have played, and once you are in a game your character's class and level, never its name. Settings, Discord turns it off.",
    ],
  },
  {
    q: "How do updates work?",
    a: [
      "Exordium checks for a new version when it opens and downloads it in the background. Only releases signed by HarvestLabs are installed, and nothing changes until you choose to restart.",
    ],
  },
  {
    q: "Does Exordium need the internet?",
    a: [
      "Only for Browse, cores, updates, Discord and Translate, which sends that one description to Google. With Local-only mode on (Settings, Privacy) it never goes online, and games still launch.",
    ],
  },
  {
    q: "My antivirus flagged Exordium. Is it safe?",
    a: [
      "Exordium starts games in an unusual way, which some antivirus software mistakes for a threat. Turn on Defender troubleshooting mode in Settings, Diagnostics, and restore the file from quarantine.",
    ],
  },
];
