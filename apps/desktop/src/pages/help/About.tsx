import { tr } from "../../lib/i18n.ts";
import { SettingsGroup } from "../../components/settings-rows.tsx";
import { openLink } from "../../lib/util.ts";

// The app's icon, bundled into dist by Vite.
const APP_ICON = new URL("../../../assets/exordium-icon.png", import.meta.url).href;

/** A link on the About page, opened in the browser. */
function AboutLink({ href, children }: { href: string; children: string }) {
  return (
    <button type="button" className="small-button" onClick={() => void openLink(href)}>
      {children} ↗
    </button>
  );
}

/** Help → About: the version, the author, the people whose work Exordium stands on, and the licences. */
export function About({ version }: { version: string | null }) {
  return (
    <>
      <div className="about-head">
        <img src={APP_ICON} alt="" />
        <div>
          <h1>Exordium</h1>
          <p className="muted">{tr("A launcher for Legacy Diablo II and its mods.")}</p>
          {version && <p className="muted small">{tr("Version {version}", { version })}</p>}
        </div>
      </div>
      <SettingsGroup title={tr("AUTHOR")}>
        <div className="about-links">
          <span>Harvest</span>
          <AboutLink href="https://github.com/HarvestWombs">GitHub</AboutLink>
          <AboutLink href="https://streamelements.com/cfs_harvest/tip">{tr("Donate")}</AboutLink>
        </div>
      </SettingsGroup>
      <SettingsGroup title={tr("CREDITS")}>
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
      <SettingsGroup title={tr("LICENCE")}>
        <p className="about-note muted small">
          {tr(
            "Exordium by Harvest (HarvestLabs). Copyright © 2026. Exordium is free software: you can redistribute it and modify it under the GNU General Public License, version 3 or (at your option) any later version, with the attribution terms in its NOTICE file. It comes with no warranty. LICENSE.txt and NOTICE.txt are beside Exordium.exe.",
          )}
        </p>
        <div className="about-links">
          <AboutLink href="https://github.com/HarvestWombs/Exordium">{tr("Source")}</AboutLink>
          <AboutLink href="https://www.gnu.org/licenses/gpl-3.0.html">{tr("GNU GPL v3")}</AboutLink>
        </div>
      </SettingsGroup>
      <p className="muted small">
        {tr(
          "Archives are unpacked with 7-Zip by Igor Pavlov (GNU LGPL; its licence ships with Exordium). Diablo II is a trademark of Blizzard Entertainment; Exordium is not affiliated with or endorsed by Blizzard.",
        )}
      </p>
    </>
  );
}
