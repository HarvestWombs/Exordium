import { LANGUAGES, tr } from "../../lib/i18n.ts";
import * as React from "react";
import {
  FolderRow,
  NumberRow,
  PathRow,
  SelectRow,
  SettingsGroup,
  SettingsHead,
  ToggleRow,
} from "../../components/settings-rows.tsx";
import type { AppSettingsState, SettingsSection, Status, WineRunner } from "../../types.ts";
import { UpdatesPanel } from "../Updates.tsx";
import { BackupSettingsPage } from "./BackupSettings.tsx";
import { DiscordSettings } from "./DiscordSettings.tsx";

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "library", label: tr("Library") },
  { id: "launch", label: tr("Launching") },
  { id: "boxes", label: tr("Boxes") },
  { id: "backups", label: tr("Backups") },
  { id: "downloads", label: tr("Downloads") },
  { id: "updates", label: tr("Updates") },
  { id: "privacy", label: tr("Privacy") },
  { id: "diagnostics", label: tr("Diagnostics") },
  { id: "appearance", label: tr("Appearance") },
  { id: "discord", label: "Discord" },
];

export function AppSettings(
  { status, section, onSection, onChanged }: {
    status: Status;
    section: SettingsSection;
    onSection: (section: SettingsSection) => void;
    onChanged: () => Promise<unknown>;
  },
) {
  const [app, setApp] = React.useState<AppSettingsState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch("/api/app-settings");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? tr("Could not read app settings."));
    setApp(body);
  }, []);

  React.useEffect(() => {
    void refresh().catch((error) => setProblem((error as Error).message));
  }, [refresh]);

  async function patchSettings(patch: unknown) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/app-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? tr("Could not save app settings."));
      setApp(body);
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="body settings-body">
      <aside className="settings-sidebar">
        <span className="eyebrow">{tr("SETTINGS")}</span>
        {SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "on" : ""}
            onClick={() => onSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>
      {/* The page scrolls across its full width, so the scrollbar sits at the window's edge; the column inside keeps its measure. */}
      <div className="settings-page">
        <div className="settings-column">
          {problem && <p className="error">{problem}</p>}
          {!app ? <p className="muted">{tr("Reading settings…")}</p> : (
            <SettingsSectionView
              section={section}
              app={app}
              status={status}
              busy={busy}
              onPatch={patchSettings}
              onDiscordChanged={onChanged}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsSectionView(
  { section, app, status, busy, onPatch, onDiscordChanged }: {
    section: SettingsSection;
    app: AppSettingsState;
    status: Status;
    busy: boolean;
    onPatch: (patch: unknown) => Promise<void>;
    onDiscordChanged: () => Promise<unknown>;
  },
) {
  const s = app.settings;
  if (section === "discord") {
    return (
      <>
        <SettingsHead title="Discord" text={tr("Account linking and activity visibility.")} />
        <DiscordSettings status={status} onChanged={onDiscordChanged} />
      </>
    );
  }
  if (section === "library") {
    return (
      <>
        <SettingsHead
          title={tr("Library")}
          text={tr(
            "Exordium runs everything from its own library: linked or copied game files, installed cores and mods.",
          )}
        />
        <SettingsGroup title={tr("Install")}>
          <PathRow label={tr("Diablo II install")} value={status.install ?? tr("Not linked")} />
          <PathRow label={tr("Library folder")} value={status.library} openKey="library" />
          <ToggleRow
            label={tr("Scan on startup")}
            hint={tr(
              "Read the Diablo II install when Exordium opens, so the library is ready. Off waits for Read library.",
            )}
            checked={s.library.autoScanOnStartup}
            disabled={busy}
            onChange={(value) => onPatch({ library: { autoScanOnStartup: value } })}
          />
          <ToggleRow
            label={tr("Hide unsupported titles")}
            hint={tr("Leave out mods whose core is missing or that cannot launch.")}
            checked={s.library.hideUnsupported}
            disabled={busy}
            onChange={(value) => onPatch({ library: { hideUnsupported: value } })}
          />
          <ToggleRow
            label={tr("Show latest uploads")}
            hint={tr("The row of new mods from the Internet Archive and ModDB at the top of the library.")}
            checked={s.library.showLatestUploads}
            disabled={busy}
            onChange={(value) => onPatch({ library: { showLatestUploads: value } })}
          />
          <ToggleRow
            label={tr("Show recently played")}
            hint={tr(
              "The Recent section, with the last three titles you played, in the sidebar and on the library home.",
            )}
            checked={s.library.showRecent}
            disabled={busy}
            onChange={(value) => onPatch({ library: { showRecent: value } })}
          />
          <ToggleRow
            label={tr("Remind me to import D2SE mods")}
            hint={tr("A reminder when Exordium opens, while your Diablo II install has mods not in the library.")}
            checked={s.library.importReminder}
            disabled={busy}
            onChange={(value) => onPatch({ library: { importReminder: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title={tr("Storage")}>
          <PathRow label={tr("Exordium folder")} value={app.paths.data} openKey="data" />
        </SettingsGroup>
      </>
    );
  }
  if (section === "launch") {
    return (
      <>
        <SettingsHead
          title={tr("Launching")}
          text={tr("Global launch behavior that applies before per-mod options.")}
        />
        <SettingsGroup title={tr("Behavior")}>
          <ToggleRow
            label={tr("Minimize Exordium when a game starts")}
            hint={tr(
              "Exordium keeps running in the taskbar: it follows the game to back up characters and show Discord activity.",
            )}
            checked={s.launch.minimizeOnLaunch}
            disabled={busy}
            onChange={(value) => onPatch({ launch: { minimizeOnLaunch: value } })}
          />
          <ToggleRow
            label={tr("Show logs when launch fails")}
            hint={tr("Open the title's Logs tab when a game fails to start.")}
            checked={s.launch.showLogsOnFailure}
            disabled={busy}
            onChange={(value) => onPatch({ launch: { showLogsOnFailure: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title="Battle.net">
          <ToggleRow
            label={tr("Battle.net lockdown")}
            hint={tr(
              "Keeps modded games off official Battle.net: the button is greyed out unless a mod names its own realm. Off opens it for every mod, and playing modded on Blizzard's servers risks your account.",
            )}
            checked={s.launch.battlenetLockdown}
            disabled={busy}
            onChange={(value) => onPatch({ launch: { battlenetLockdown: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title="PlugY">
          <PathRow
            label={tr("PlugY folder")}
            hint={tr(
              "Exordium ships no PlugY. A title with PlugY on uses the mod's own PlugY.dll, else the one in this folder. Without either, it starts without PlugY.",
            )}
            value={app.paths.plugy}
            openKey="plugy"
          />
        </SettingsGroup>
        {app.wine && <WineGroup wine={app.wine} choice={s.launch.wineRunner} busy={busy} onPatch={onPatch} />}
      </>
    );
  }
  if (section === "boxes") {
    return (
      <>
        <SettingsHead
          title={tr("Boxes")}
          text={tr(
            "Each title runs from its own box: links to the game and mod files. It is brought up to date every launch.",
          )}
        />
        <SettingsGroup title={tr("Storage")}>
          <PathRow label={tr("Box folder")} value={app.paths.boxes} openKey="boxes" />
          <ToggleRow
            label={tr("Clean stale boxes automatically")}
            hint={tr(
              "When the library is read, delete the boxes of mods and cores no longer installed. Saves and backups are kept.",
            )}
            checked={s.boxes.autoCleanStale}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { autoCleanStale: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title={tr("Rebuild Box")}>
          <ToggleRow
            label={tr("Confirm before rebuilding")}
            hint={tr("Ask first when you press Rebuild Box in a title's properties.")}
            checked={s.boxes.confirmRebuild}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { confirmRebuild: value } })}
          />
          <ToggleRow
            label={tr("Back up saves before rebuilding")}
            hint={tr("Copy the title's characters first, to its Backups, unless they match the newest backup.")}
            checked={s.boxes.backupBeforeRebuild}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { backupBeforeRebuild: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "backups") {
    return (
      <>
        <SettingsHead title={tr("Backups")} text={tr("Copies of each title's save folder, for every title.")} />
        <BackupSettingsPage />
      </>
    );
  }
  if (section === "downloads") {
    return (
      <>
        <SettingsHead title={tr("Downloads")} text={tr("Mods and cores downloaded from Browse.")} />
        <SettingsGroup title={tr("Downloads")}>
          <PathRow label={tr("Download folder")} value={app.paths.downloads} openKey="downloads" />
          <NumberRow
            label={tr("Parallel downloads")}
            hint={tr("How many downloads run at once.")}
            value={s.downloads.maxParallel}
            min={1}
            max={8}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { maxParallel: value } })}
          />
          <ToggleRow
            label={tr("Keep downloaded archives")}
            hint={tr("Keep the archive after a mod installs. Off deletes it to save space.")}
            checked={s.downloads.keepArchives}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { keepArchives: value } })}
          />
          <ToggleRow
            label={tr("Verify downloads after completion")}
            hint={tr(
              "Refuse to install a download that came in shorter or longer than its source said. Cores are always checked against their checksum.",
            )}
            checked={s.downloads.verifyAfterDownload}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { verifyAfterDownload: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "updates") {
    return (
      <>
        <SettingsHead title={tr("Updates")} text={tr("New versions of Exordium, from its GitHub releases.")} />
        <UpdatesPanel status={status} />
        <SettingsGroup title={tr("Policy")}>
          <ToggleRow
            label={tr("Check automatically")}
            hint={tr(
              "Look for a new Exordium when it opens and every 15 minutes while it runs, and download it in the background. Nothing changes until you restart to update.",
            )}
            checked={s.updates.checkOnStartup}
            disabled={busy}
            onChange={(value) => onPatch({ updates: { checkOnStartup: value } })}
          />
          <ToggleRow
            label={tr("Include pre-releases")}
            hint={tr("Also offer test builds before they are released.")}
            checked={s.updates.includePrereleases}
            disabled={busy}
            onChange={(value) => onPatch({ updates: { includePrereleases: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "privacy") {
    return (
      <>
        <SettingsHead
          title={tr("Privacy")}
          text={tr("What Exordium does online. Discord's own settings are under Discord.")}
        />
        <SettingsGroup title={tr("Network")}>
          <ToggleRow
            label={tr("Local-only mode")}
            hint={tr(
              "Stay offline: Browse, cores, translation, Discord sign-in and Discord activity are all off. Games still launch.",
            )}
            checked={s.privacy.localOnly}
            disabled={busy}
            onChange={(value) => onPatch({ privacy: { localOnly: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "diagnostics") {
    return (
      <>
        <SettingsHead
          title={tr("Diagnostics")}
          text={tr("Tools for launch failures, crashes, and Defender troubleshooting.")}
        />
        <SettingsGroup title={tr("Logs")}>
          <PathRow label={tr("Exordium logs")} value={app.paths.logs} openKey="logs" />
          <ToggleRow
            label={tr("Verbose launch logs")}
            hint={tr("Write extra detail to the loader log for each launch.")}
            checked={s.diagnostics.verboseLaunchLogs}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { verboseLaunchLogs: value } })}
          />
          <ToggleRow
            label={tr("Native loader debug")}
            hint={tr("Have the loader log where it is during startup, for diagnosing hangs.")}
            checked={s.diagnostics.nativeLoaderDebug}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { nativeLoaderDebug: value } })}
          />
          <ToggleRow
            label={tr("Defender troubleshooting mode")}
            hint={tr("Avoid behavior antivirus may flag. Also turns off Discord game activity.")}
            checked={s.diagnostics.defenderTroubleshooting}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { defenderTroubleshooting: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  return (
    <>
      <SettingsHead title={tr("Appearance")} text={tr("Display preferences for the launcher shell.")} />
      <SettingsGroup title={tr("Display")}>
        <SelectRow
          label={tr("Theme")}
          hint={tr("Dark, dim light, or follow Windows.")}
          value={s.appearance.theme}
          disabled={busy}
          options={[["dark", tr("Dark")], ["light", tr("Dim light")], ["system", tr("Use system")]]}
          onChange={(value) => onPatch({ appearance: { theme: value } })}
        />
        <SelectRow
          label={tr("Language")}
          hint={tr("The interface's language. Help and messages from Exordium itself are in English for now.")}
          value={s.appearance.language}
          disabled={busy}
          options={[["system", tr("Use system")], ...Object.entries(LANGUAGES)]}
          onChange={async (value) => {
            await onPatch({ appearance: { language: value } });
            // Labels are read as modules load, so a new language takes a reload.
            location.reload();
          }}
        />
        <SelectRow
          label={tr("Notification size")}
          hint={tr("How large notifications appear.")}
          value={s.appearance.toastSize}
          disabled={busy}
          options={[["small", tr("Small")], ["medium", tr("Medium")], ["large", tr("Large")]]}
          onChange={(value) => onPatch({ appearance: { toastSize: value } })}
        />
        <ToggleRow
          label={tr("Reduce motion")}
          hint={tr("Turn off animations and transitions.")}
          checked={s.appearance.reduceMotion}
          disabled={busy}
          onChange={(value) => onPatch({ appearance: { reduceMotion: value } })}
        />
      </SettingsGroup>
    </>
  );
}

const RUNNER_SOURCES: Record<WineRunner["source"], string> = {
  system: tr("System"),
  lutris: "Lutris",
  bottles: "Bottles",
  heroic: "Heroic",
  steam: "Steam",
  custom: tr("Custom"),
};

/** Off Windows: which Wine (or Proton) runs the game. Each runner gets a prefix of its own in Exordium's data folder. */
function WineGroup(
  { wine, choice, busy, onPatch }: {
    wine: NonNullable<AppSettingsState["wine"]>;
    choice: string;
    busy: boolean;
    onPatch: (patch: unknown) => Promise<void>;
  },
) {
  const first = wine.runners[0];
  const options: [string, string][] = [
    ["", first ? tr("Automatic ({label})", { label: first.label }) : tr("Automatic (none found)")],
    ...wine.runners.map((r): [string, string] => [r.id, `${r.label} (${RUNNER_SOURCES[r.source]})`]),
  ];
  // A custom path the user picked is not among the detected runners: show it as its own entry.
  const custom = choice && !wine.runners.some((r) => r.id === choice) ? choice : "";
  if (custom) options.push([custom, tr("Custom: {custom}", { custom })]);
  return (
    <SettingsGroup title="Wine">
      <SelectRow
        label={tr("Runner")}
        hint={wine.selected
          ? tr("Games start through {program}, in a Wine prefix Exordium keeps for this runner.", {
            program: wine.selected.program,
          })
          : tr(
            "No Wine was found. Install Wine, or Proton through Steam, Lutris, Bottles or Heroic, or choose a folder below.",
          )}
        value={choice}
        options={options}
        disabled={busy}
        onChange={(value) => onPatch({ launch: { wineRunner: value } })}
      />
      <FolderRow
        label={tr("Custom Wine or Proton folder")}
        hint={tr("A Wine build (with bin/wine) or a Proton folder (with files/bin/wine) that was not found by itself.")}
        value={custom}
        disabled={busy}
        onChange={(value) => onPatch({ launch: { wineRunner: value } })}
      />
    </SettingsGroup>
  );
}
