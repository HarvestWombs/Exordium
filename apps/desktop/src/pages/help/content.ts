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
  /** A table of a file's fields. */
  fields?: HelpField[];
}

export interface HelpField {
  name: string;
  type: string;
  /** What applies when the field is left out; "required" when it can't be. */
  default?: string;
  example: string;
  text: string;
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
          "The sidebar lists Favorites, your collections, Recent, Mods and Cores. Click a section's header to fold it; right-click it to view only that section, or to fold every collection at once. The button in the sidebar footer folds the whole sidebar to a strip of icons. Recent can be turned off in Settings, Library.",
          "Search the library from the top of the sidebar. Its filter button filters by mods, cores, favorites, recently played titles, available updates, issues or hidden titles. Filters can be combined; All titles clears them.",
          "The filter menu also adjusts row height, icon and text sizes, section counts and status indicators. Drag the sidebar's right edge to resize it; double-click the edge to restore its default width.",
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
          "Use the filter button beside home search to choose visible shelves and adjust card appearance. Drag categories by their handles to reorder the shelves; the home screen remembers their order.",
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
          "The converter shows the exordium.mod.json it will write: the fields on top, the JSON below, which you can edit directly. Nothing is copied until you press Import, and your install is never changed unless you chose Move. Imports queue up and run one at a time in the background, so you can leave the converter while they finish: each mod shows in the library with a spinner, and hovering it shows its progress.",
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
          "A mod that runs its own server names it in its exordium.mod.json (a realm with a gateway address). For that mod, Battle.net stays open. Exordium does not point the game at the realm yet, so players set the gateway themselves for now.",
        ],
      },
      {
        heading: "Official Battle.net",
        paragraphs: [
          "For every other mod, Exordium does not connect to Blizzard's Battle.net: the Battle.net button is greyed out, and Open Battle.net does nothing. Modded games do not belong on Blizzard's servers. Battle.net lockdown in Settings, Launching turns this off for every mod, at your own risk.",
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
          "Put a file named exordium.mod.json in the mod's top folder, beside its MPQs. It wins over a D2SE_SETUP.ini when a mod has both. A mod with only a D2SE_SETUP.ini still works: the converter drafts a manifest from it on import, and the player reviews it there.",
          "Only core is required, so this is a complete manifest:",
        ],
        code: `{
  "core": "1.10f"
}`,
      },
      {
        heading: "A fuller one",
        paragraphs: ["Leave out anything you don't need. Every field below is explained further down."],
        code: `{
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
}`,
      },
      {
        heading: "How to write the values",
        paragraphs: [
          "The file is JSON. Every field has a type, and the wrong type is usually ignored without a word, so check the Type column below.",
        ],
        fields: [
          {
            name: "text (string)",
            type: "In double quotes",
            example: `"1.10f"`,
            text: 'Anything in quotes, numbers too: a version is "1.2", not 1.2. Without quotes it is ignored.',
          },
          {
            name: "true or false (boolean)",
            type: "No quotes",
            example: "true",
            text: 'Lower case, no quotes. "true" in quotes is text, and is ignored.',
          },
          {
            name: "number",
            type: "No quotes",
            example: "3",
            text: "Digits only.",
          },
          {
            name: "list (array)",
            type: "Square brackets",
            example: `["One.mpq", "Two.mpq"]`,
            text: "Values with commas between them. A list of one still needs its brackets, and [] is an empty list.",
          },
          {
            name: "group (object)",
            type: "Curly braces",
            example: `{ "windowed": true }`,
            text: "Named fields with commas between them.",
          },
          {
            name: "null",
            type: "No quotes",
            example: "null",
            text: "Not set, the same as leaving the field out.",
          },
        ],
        list: [
          "Double quotes only, and a comma between entries but none after the last.",
          "No comments: JSON has none.",
          "Paths are relative to the mod's folder and use forward slashes: art/icon.png.",
          "A line break inside text is written \\n.",
          "If the file isn't valid JSON, the mod's page says so and Play stays off until it's fixed.",
        ],
      },
      {
        heading: "Top-level fields",
        fields: [
          {
            name: "core",
            type: "text",
            default: "required",
            example: `"1.10f"`,
            text:
              "The patch the mod runs on, spelled exactly as the cores are: 1.00, 1.01, 1.02, 1.03, 1.04b, 1.04c, 1.05, 1.05b, 1.06, 1.06b, 1.07, 1.08, 1.09, 1.09b, 1.09d, 1.10f, 1.11, 1.11b, 1.12a, 1.13c or 1.13d.",
          },
          {
            name: "title",
            type: "text",
            default: "the folder's name",
            example: `"The Black Soul"`,
            text: "The name the library shows.",
          },
          {
            name: "version",
            type: "text",
            default: "none",
            example: `"0.9.0"`,
            text: "Shown under the title, and compared against your update feed. Keep the quotes.",
          },
          {
            name: "author",
            type: "text",
            default: "none",
            example: `"HarvestLabs"`,
            text: "Shown as BY at the top of the mod's page.",
          },
          {
            name: "description",
            type: "text",
            default: "none",
            example: `"A darker Diablo II."`,
            text: "Shown as About this mod on the mod's page. Line breaks are kept.",
          },
          {
            name: "readme",
            type: "text",
            default: "none",
            example: `"Documentation/ReadMe.txt"`,
            text: "The file to list first under Documentation, or a web address (see Documentation).",
          },
          { name: "art", type: "group", default: "none", example: "see art", text: "The mod's pictures." },
          {
            name: "links",
            type: "list of groups",
            default: "[]",
            example: "see links",
            text: "Buttons on the mod's page.",
          },
          {
            name: "update",
            type: "group",
            default: "none",
            example: "see update",
            text: "Where to look for new versions.",
          },
          { name: "launch", type: "group", default: "none", example: "see launch", text: "How the game starts." },
          {
            name: "loads",
            type: "group",
            default: "none",
            example: "see loads",
            text: "What is loaded into the game.",
          },
          {
            name: "realm",
            type: "group",
            default: "none",
            example: "see realm",
            text: "The mod's own server, if it has one.",
          },
        ],
      },
      {
        heading: "art",
        paragraphs: ["Paths to images in the mod's folder. Sizes are on the Art & links page."],
        code: `"art": {
  "banner": "art/banner.png",
  "icon": "art/icon.png",
  "portrait": "art/portrait.png"
}`,
        fields: [
          {
            name: "banner",
            type: "text",
            default: "none",
            example: `"art/banner.png"`,
            text: "The header of the mod's page. PNG, JPEG, WebP, GIF or BMP.",
          },
          {
            name: "icon",
            type: "text",
            default: "none",
            example: `"art/icon.png"`,
            text: "The sidebar, the game window and desktop shortcuts. PNG only: any other format is ignored.",
          },
          {
            name: "portrait",
            type: "text",
            default: "none",
            example: `"art/portrait.png"`,
            text: "The card on the library home. PNG, JPEG, WebP, GIF or BMP.",
          },
        ],
      },
      {
        heading: "links",
        paragraphs: ["A list of groups, one per button. Square brackets around it, even for a single link."],
        code: `"links": [
  { "label": "Discord", "url": "https://discord.gg/your-invite" },
  { "label": "Website", "url": "https://example.com" }
]`,
        fields: [
          {
            name: "url",
            type: "text",
            default: "required",
            example: `"https://example.com"`,
            text: "A web address starting with http:// or https://. Anything else is dropped.",
          },
          {
            name: "label",
            type: "text",
            default: "the site's name",
            example: `"Discord"`,
            text: "The button's text.",
          },
        ],
      },
      {
        heading: "update",
        paragraphs: ["The feed's own format is on the Updates page."],
        code: `"update": {
  "endpoint": "https://example.com/mymod/updates.json",
  "channel": "stable"
}`,
        fields: [
          {
            name: "endpoint",
            type: "text",
            default: "none",
            example: `"updates.json"`,
            text: "Your update feed: a web address, or a file path relative to the mod's folder.",
          },
          {
            name: "channel",
            type: "text",
            default: `"stable"`,
            example: `"testing"`,
            text: "stable, testing or local. Anything else is ignored, with a warning. Players can change it.",
          },
          {
            name: "automatic",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Fills in the Automatic updates switch in Properties. It does nothing else yet.",
          },
          {
            name: "background",
            type: "true or false",
            default: "true",
            example: "false",
            text: "Fills in the Allow background downloads switch in Properties. It does nothing else yet.",
          },
        ],
      },
      {
        heading: "launch",
        paragraphs: ["The mod's defaults. Players can change them in Properties."],
        code: `"launch": {
  "renderer": "glide",
  "windowed": true,
  "direct": true,
  "txt": true,
  "plugY": false,
  "language": "MOD",
  "startAct": 1
}`,
        fields: [
          {
            name: "renderer",
            type: "text",
            default: `"glide"`,
            example: `"ddraw"`,
            text:
              "glide, ddraw (DirectDraw), d3d (Direct3D) or opengl. Anything else falls back to glide, with a warning.",
          },
          {
            name: "windowed",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Start in a window instead of full screen.",
          },
          {
            name: "noSound",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Start without sound (-ns).",
          },
          {
            name: "direct",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Read loose files from the mod's data folder before the MPQs (-direct). Always on with PlugY.",
          },
          {
            name: "txt",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Compile data\\global\\excel\\*.txt into .bin at startup (-txt).",
          },
          {
            name: "hardcore",
            type: "true or false",
            default: "true",
            example: "false",
            text: "Allow hardcore characters.",
          },
          {
            name: "plugY",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Load PlugY (see Plugins and PlugY below).",
          },
          {
            name: "language",
            type: "text",
            default: `"MOD"`,
            example: `"DEU"`,
            text:
              "MOD uses the mod's own text and no language folder. Otherwise one of ENG, DEU, FRA, ESP, ITA, POR, POL, RUS, CHI, JPN, KOR or SIN.",
          },
          {
            name: "skipToBNet",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Start at the Battle.net login (-skiptobnet). Needs a realm.",
          },
          {
            name: "seed",
            type: "number or text",
            default: "none",
            example: "12345",
            text: "A map seed (-seed), digits only, up to 10 of them. Anything else is ignored.",
          },
          {
            name: "startAct",
            type: "number",
            default: "none",
            example: "2",
            text: "New single-player characters start in this act: 1 to 5 (-act2 and so on).",
          },
        ],
      },
      {
        heading: "loads",
        paragraphs: [
          "What the game loads besides its own files. A file named here that the mod doesn't ship is an error, and Play stays off.",
        ],
        code: `"loads": {
  "d2mod": true,
  "mpqs": ["BlackSoul.mpq", "BlackSoulPatch.mpq"],
  "dlls": ["MyPlugin.dll"]
}`,
        fields: [
          {
            name: "mpqs",
            type: "list of text",
            default: "[]",
            example: `["BlackSoul.mpq"]`,
            text: "Your MPQs. The first has the lowest priority, the last wins. There is no limit on how many.",
          },
          {
            name: "dlls",
            type: "list of text",
            default: "[]",
            example: `["MyPlugin.dll"]`,
            text: "Other plugin DLLs, loaded in this order.",
          },
          {
            name: "d2mod",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Load D2Mod.dll from the mod's top folder.",
          },
          {
            name: "nefex",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Load Nefex.dll from the mod's top folder.",
          },
          {
            name: "d2extra",
            type: "true or false",
            default: "false",
            example: "true",
            text: "Load D2Extra.dll from the mod's top folder.",
          },
        ],
      },
      {
        heading: "realm",
        paragraphs: ["Leave this out unless the mod has its own server. See Realms for what it does today."],
        code: `"realm": {
  "gateway": "realm.example.com",
  "gatewayName": "My Realm",
  "selected": "My Realm",
  "timezone": "-5",
  "port": "6112"
}`,
        fields: [
          {
            name: "gateway",
            type: "text",
            default: "none",
            example: `"realm.example.com"`,
            text: "The server's address. Setting it leaves Battle.net open for this mod.",
          },
          {
            name: "gatewayName",
            type: "text",
            default: "none",
            example: `"My Realm"`,
            text: "The realm's name.",
          },
          {
            name: "selected",
            type: "text",
            default: "none",
            example: `"My Realm"`,
            text: "The gateway to select.",
          },
          {
            name: "timezone",
            type: "text",
            default: "none",
            example: `"-5"`,
            text: "Hours from UTC. Keep the quotes.",
          },
          {
            name: "port",
            type: "text",
            default: "none",
            example: `"6112"`,
            text: "The server's port. Keep the quotes.",
          },
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
          "**banner**: the header of the mod's page. Use a wide 4:1 image; 1920x480 is recommended.",
          "**icon**: the sidebar, and the game's own icon in the taskbar and on desktop shortcuts. Use a square 1:1 image; 256x256 is recommended and is the maximum stored size.",
          "**portrait**: the card on the library home. Use a portrait 2:3 image; 600x900 is recommended.",
        ],
        paragraphs: [
          "Name them under art in exordium.mod.json, as paths in the mod's folder. A banner or portrait can be PNG, JPEG, WebP, GIF or BMP; an icon must be PNG. A mod without a portrait shows its icon and name over its banner; without either, its initials. Players can replace any of them in Properties, Artwork, without touching the mod.",
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
          "Exordium closes official Battle.net for every mod, unless the mod names its own server. Give realm a gateway address, and Battle.net stays open for your mod; -skiptobnet goes straight to the login.",
          "**Not done yet:** Exordium doesn't put these values into the game. It only checks that gateway is set, so the game still uses whichever gateway its registry already holds. Players have to point it at your server themselves for now.",
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
      "Exordium does not connect modded games to Blizzard's Battle.net. A mod with its own realm names it in its exordium.mod.json, and for that mod Battle.net is open. Turning off Battle.net lockdown in Settings, Launching opens it for every mod. TCP/IP games always work.",
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
      "With the default linked game layer, only a few MB per core and each mod's own size. Copying the game layer independently adds about 2 GB. Boxes are made of links, so they take almost nothing.",
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
      "Yes. Setup links or copies the wrappers in your Diablo II folder, and a mod can bring its own. With Glide, the wrapper's own settings decide the window.",
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
