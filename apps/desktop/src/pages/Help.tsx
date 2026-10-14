import * as React from "react";
import { SettingsGroup, SettingsHead } from "../components/settings-rows.tsx";
import { openLink } from "../lib/util.ts";

// The app's icon, bundled into dist by Vite.
export const APP_ICON = new URL("../../assets/exordium-icon.png", import.meta.url).href;

export type HelpTopic = "start" | "library" | "mods" | "cores" | "boxes" | "about";

export const HELP_TOPICS: { id: HelpTopic; label: string }[] = [
  { id: "start", label: "Getting started" },
  { id: "library", label: "Your library" },
  { id: "mods", label: "Adding mods" },
  { id: "cores", label: "Cores" },
  { id: "boxes", label: "How a mod runs" },
  { id: "about", label: "About" },
];

/** Help: how Exordium's library and mods work, and the About page. */
export function HelpPage({ version }: { version: string | null }) {
  const [topic, setTopic] = React.useState<HelpTopic>("start");
  return (
    <div className="body settings-body">
      <aside className="settings-sidebar">
        <span className="eyebrow">HELP</span>
        {HELP_TOPICS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={topic === item.id ? "on" : ""}
            onClick={() => setTopic(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>
      <div className="settings-page help-page">
        {topic === "start" && (
          <>
            <SettingsHead
              title="Getting started"
              text="Exordium runs legacy Diablo II mods, each in its own sealed box."
            />
            <p>
              On first launch Exordium links your Diablo II install and copies what it needs into its own library: the
              game's MPQ archives, D2.LNG, the video DLLs and any graphics wrappers. From then on your install is only
              read, never changed. You need Diablo II and, for most mods, Lord of Destruction.
            </p>
            <p>
              Next it downloads the cores you choose: each one is a patch of the game, from 1.00 to 1.13d. Then you add
              mods: from your D2SE install, a folder, an archive, or Browse.
            </p>
            <ol>
              <li>Pick a mod in the library and press Play.</li>
              <li>The first start builds its box, which takes a moment; later starts reuse it.</li>
              <li>Your characters live in the mod's own save folder, and are backed up when the game closes.</li>
            </ol>
          </>
        )}
        {topic === "library" && (
          <>
            <SettingsHead
              title="Your library"
              text="What the sidebar and the home screen show, and how to arrange them."
            />
            <h2 className="eyebrow">SECTIONS</h2>
            <p>
              The sidebar lists Favorites, your collections, Recent, Mods and Cores. Click a section's header to fold
              it; right-click it to view only that section, or to fold every collection at once.
            </p>
            <h2 className="eyebrow">FAVORITES AND COLLECTIONS</h2>
            <p>
              A favorite moves out of Mods or Cores into Favorites; unfavorite it and it goes back. Collections are your
              own groups: right-click a title, then Add to, and pick one or make a new one. Drag titles onto a
              collection's header to add them, drag within a collection to reorder it, and drag the headers to reorder
              the collections. A title can be in several collections.
            </p>
            <h2 className="eyebrow">THE HOME SCREEN</h2>
            <p>
              The home screen shows every title as a card, with Latest uploads above: new mods from the Internet Archive
              and ModDB, and updates for mods you have. Turn the row off in Settings, Library.
            </p>
            <h2 className="eyebrow">HIDING AND UNINSTALLING</h2>
            <p>
              Hide takes a title out of the list without touching its files; the Hidden filter brings it back. Uninstall
              deletes the mod from the library, and can keep a copy of its characters first.
            </p>
          </>
        )}
        {topic === "mods" && (
          <>
            <SettingsHead title="Adding mods" text="Library, Import, or Browse: every mod ends up in the library." />
            <h2 className="eyebrow">IMPORT</h2>
            <ul>
              <li>
                <strong>From your Diablo II install:</strong>{" "}
                your D2SE mods, each reviewed in the converter before it is copied (or moved, to save space).
              </li>
              <li>
                <strong>From a folder:</strong>{" "}
                a mod already unpacked somewhere. Choose the folder holding its MPQs or its D2SE_SETUP.ini.
              </li>
              <li>
                <strong>From an archive:</strong> a .zip, .7z or .rar as downloaded, unpacked into the library.
              </li>
            </ul>
            <h2 className="eyebrow">BROWSE</h2>
            <p>
              Browse lists mods from the Internet Archive and ModDB. Install downloads one, unpacks it with 7-Zip and
              adds it to the library.
            </p>
            <h2 className="eyebrow">EXORDIUM.MOD.JSON</h2>
            <p>
              Each mod carries an exordium.mod.json: its title, its core, its art, how it launches, which MPQs and
              plugins it loads, and an optional realm. The converter drafts it for you; edit it any time in the title's
              Properties. A mod's own exordium.mod.json is used as it is.
            </p>
            <h2 className="eyebrow">PLUGINS AND PLUGY</h2>
            <p>
              Exordium loads D2Mod, PlugY and the mod's own DLLs. It ships no PlugY: a mod that uses PlugY brings its
              own PlugY.dll, and Exordium hooks it up. D2SE's own plugin systems (its mod DLL and D2SE_Utility) are not
              loaded.
            </p>
          </>
        )}
        {topic === "cores" && (
          <>
            <SettingsHead title="Cores" text="The game version a mod is built on." />
            <p>
              A core is one patch of Diablo II: its DLLs, its Patch_D2.mpq and its language files. A mod names the core
              it needs, such as 1.10f or 1.13c, and runs on top of it. Cores come from Exordium's catalog, checked
              against published checksums; install more from Browse, Cores.
            </p>
            <p>
              A mod whose core is missing shows Install core instead of Play. 1.14 still launches, through Blizzard's
              own Game.exe, but gets none of Exordium's loader features.
            </p>
          </>
        )}
        {topic === "boxes" && (
          <>
            <SettingsHead title="How a mod runs" text="Boxes, the loader, saves and multiplayer." />
            <h2 className="eyebrow">THE BOX</h2>
            <p>
              Each title runs from its own box: a folder made of links to the game files, its core and the mod, with the
              mod's save folder linked in. Nothing is copied twice, and no mod can change another or your install.
            </p>
            <h2 className="eyebrow">THE REGISTRY</h2>
            <p>
              Each box has a private registry. A mod's video, gateway and Glide settings stay with that mod, and your
              machine's Diablo II settings are never touched.
            </p>
            <h2 className="eyebrow">SEVERAL COPIES</h2>
            <p>Press Play again while a title runs to start another copy, for TCP/IP games or several characters.</p>
            <h2 className="eyebrow">BATTLE.NET</h2>
            <p>
              Exordium does not connect to official Battle.net: the button is greyed out. A mod that names its own realm
              (a server address in its exordium.mod.json) can connect to that realm. TCP/IP games always work.
            </p>
          </>
        )}
        {topic === "about" && (
          <>
            <div className="about-head">
              <img src={APP_ICON} alt="" />
              <div>
                <h1>Exordium</h1>
                <p className="muted">A launcher for Legacy Diablo II and its mods.</p>
                {version && <p className="muted small">Version {version}</p>}
              </div>
            </div>
            <SettingsGroup title="AUTHOR">
              <div className="about-links">
                <span>Harvest</span>
                <AboutLink href="https://github.com/HarvestWombs">GitHub</AboutLink>
                <AboutLink href="https://streamelements.com/cfs_harvest/tip">Donate</AboutLink>
              </div>
            </SettingsGroup>
            <SettingsGroup title="CREDITS">
              <div className="about-links">
                <span>Lectem</span>
                <AboutLink href="https://github.com/ThePhrozenKeep/D2MOO">D2MOO</AboutLink>
              </div>
              <div className="about-links">
                <span>Necrolis</span>
                <AboutLink href="https://github.com/Necrolis">GitHub</AboutLink>
              </div>
              <div className="about-links">
                <span>Meanski</span>
                <AboutLink href="https://github.com/Meanski">GitHub</AboutLink>
              </div>
              <div className="about-links">
                <span>Szumigajowy</span>
                <AboutLink href="https://github.com/szumigajowy">GitHub</AboutLink>
              </div>
            </SettingsGroup>
            <SettingsGroup title="PHROZEN KEEP">
              <div className="about-links">
                <AboutLink href="https://www.d2mods.info">D2mods.info</AboutLink>
                <AboutLink href="https://github.com/ThePhrozenKeep">GitHub</AboutLink>
                <AboutLink href="https://discord.gg/NvfftHY">Discord</AboutLink>
                <AboutLink href="https://www.patreon.com/ThePhrozenKeep">Patreon</AboutLink>
              </div>
            </SettingsGroup>
            <p className="muted small">
              Archives are unpacked with 7-Zip by Igor Pavlov (GNU LGPL; its licence ships with Exordium). Diablo II is
              a trademark of Blizzard Entertainment; Exordium is not affiliated with or endorsed by Blizzard.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** A link on the About page, opened in the browser. */
function AboutLink({ href, children }: { href: string; children: string }) {
  return (
    <button type="button" className="link-button" onClick={() => void openLink(href)}>
      {children} ↗
    </button>
  );
}
