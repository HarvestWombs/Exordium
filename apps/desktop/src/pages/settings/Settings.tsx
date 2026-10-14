import * as React from "react";
import {
  NumberRow,
  PathRow,
  SelectRow,
  SettingsGroup,
  SettingsHead,
  ToggleRow,
} from "../../components/settings-rows.tsx";
import type { AppSettingsState, SettingsSection, Status } from "../../types.ts";
import { UpdatesPanel } from "../Updates.tsx";
import { BackupSettingsPage } from "./BackupSettings.tsx";
import { DiscordSettings } from "./DiscordSettings.tsx";

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "launch", label: "Launching" },
  { id: "boxes", label: "Boxes" },
  { id: "backups", label: "Backups" },
  { id: "downloads", label: "Downloads" },
  { id: "updates", label: "Updates" },
  { id: "privacy", label: "Privacy" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "appearance", label: "Appearance" },
  { id: "discord", label: "Discord" },
];

export function AppSettings({ status, onChanged }: { status: Status; onChanged: () => Promise<unknown> }) {
  const [section, setSection] = React.useState<SettingsSection>("library");
  const [app, setApp] = React.useState<AppSettingsState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch("/api/app-settings");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not read app settings.");
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
      if (!response.ok) throw new Error(body.error ?? "Could not save app settings.");
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
        <span className="eyebrow">SETTINGS</span>
        {SETTINGS_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "on" : ""}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </aside>
      <div className="settings-page">
        {problem && <p className="error">{problem}</p>}
        {!app ? <p className="muted">Reading settings…</p> : (
          <SettingsSectionView
            section={section}
            app={app}
            status={status}
            busy={busy}
            onPatch={(patch) => void patchSettings(patch)}
            onDiscordChanged={onChanged}
          />
        )}
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
    onPatch: (patch: unknown) => void;
    onDiscordChanged: () => Promise<unknown>;
  },
) {
  const s = app.settings;
  if (section === "discord") {
    return (
      <>
        <SettingsHead title="Discord" text="Account linking and activity visibility." />
        <DiscordSettings status={status} onChanged={onDiscordChanged} />
      </>
    );
  }
  if (section === "library") {
    return (
      <>
        <SettingsHead
          title="Library"
          text="Exordium runs everything from its own library: the game files, cores and mods copied or installed into it."
        />
        <SettingsGroup title="Install">
          <PathRow label="Diablo II install" value={status.install ?? "Not linked"} />
          <PathRow label="Library folder" value={status.library} openKey="library" />
          <ToggleRow
            label="Scan on startup"
            hint="Read the Diablo II install when Exordium opens, so the library is ready. Off waits for Read library."
            checked={s.library.autoScanOnStartup}
            disabled={busy}
            onChange={(value) => onPatch({ library: { autoScanOnStartup: value } })}
          />
          <ToggleRow
            label="Hide unsupported titles"
            hint="Leave out mods whose core is missing or that cannot launch."
            checked={s.library.hideUnsupported}
            disabled={busy}
            onChange={(value) => onPatch({ library: { hideUnsupported: value } })}
          />
          <ToggleRow
            label="Show latest uploads"
            hint="The row of new mods from the Internet Archive and ModDB at the top of the library."
            checked={s.library.showLatestUploads}
            disabled={busy}
            onChange={(value) => onPatch({ library: { showLatestUploads: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title="Storage">
          <PathRow label="Exordium folder" value={app.paths.data} openKey="data" />
          <PathRow label="Artwork folder" value={app.paths.art} openKey="art" />
        </SettingsGroup>
      </>
    );
  }
  if (section === "launch") {
    return (
      <>
        <SettingsHead title="Launching" text="Global launch behavior that applies before per-mod options." />
        <SettingsGroup title="Behavior">
          <ToggleRow
            label="Minimize Exordium when a game starts"
            hint="Exordium keeps running in the taskbar: it follows the game to back up characters and show Discord activity."
            checked={s.launch.minimizeOnLaunch}
            disabled={busy}
            onChange={(value) => onPatch({ launch: { minimizeOnLaunch: value } })}
          />
          <ToggleRow
            label="Show logs when launch fails"
            hint="Open the title's Logs tab when a game fails to start."
            checked={s.launch.showLogsOnFailure}
            disabled={busy}
            onChange={(value) => onPatch({ launch: { showLogsOnFailure: value } })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "boxes") {
    return (
      <>
        <SettingsHead
          title="Boxes"
          text="Each title runs from its own box: links to the game and mod files. It is brought up to date every launch."
        />
        <SettingsGroup title="Storage">
          <PathRow label="Box folder" value={app.paths.boxes} openKey="boxes" />
          <ToggleRow
            label="Clean stale boxes automatically"
            hint="When the library is read, delete the boxes of mods and cores no longer installed. Saves and backups are kept."
            checked={s.boxes.autoCleanStale}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { autoCleanStale: value } })}
          />
        </SettingsGroup>
        <SettingsGroup title="Rebuild Box">
          <ToggleRow
            label="Confirm before rebuilding"
            hint="Ask first when you press Rebuild Box in a title's properties."
            checked={s.boxes.confirmRebuild}
            disabled={busy}
            onChange={(value) => onPatch({ boxes: { confirmRebuild: value } })}
          />
          <ToggleRow
            label="Back up saves before rebuilding"
            hint="Copy the title's characters first, to its Backups, unless they match the newest backup."
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
        <SettingsHead title="Backups" text="Copies of each title's save folder, for every title." />
        <BackupSettingsPage />
      </>
    );
  }
  if (section === "downloads") {
    return (
      <>
        <SettingsHead title="Downloads" text="Mods and cores downloaded from Browse." />
        <SettingsGroup title="Downloads">
          <PathRow label="Download folder" value={app.paths.downloads} openKey="downloads" />
          <NumberRow
            label="Parallel downloads"
            hint="How many downloads run at once."
            value={s.downloads.maxParallel}
            min={1}
            max={8}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { maxParallel: value } })}
          />
          <ToggleRow
            label="Keep downloaded archives"
            hint="Keep the archive after a mod installs. Off deletes it to save space."
            checked={s.downloads.keepArchives}
            disabled={busy}
            onChange={(value) => onPatch({ downloads: { keepArchives: value } })}
          />
          <ToggleRow
            label="Verify downloads after completion"
            hint="Refuse to install a download that came in shorter or longer than its source said. Cores are always checked against their checksum."
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
        <SettingsHead title="Updates" text="New versions of Exordium, from its GitHub releases." />
        <UpdatesPanel status={status} />
        <SettingsGroup title="Policy">
          <ToggleRow
            label="Check on startup"
            hint="Look for a new Exordium when it opens and download it in the background. Nothing changes until you restart to update."
            checked={s.updates.checkOnStartup}
            disabled={busy}
            onChange={(value) => onPatch({ updates: { checkOnStartup: value } })}
          />
          <ToggleRow
            label="Include pre-releases"
            hint="Also offer test builds before they are released."
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
        <SettingsHead title="Privacy" text="What Exordium does online. Discord's own settings are under Discord." />
        <SettingsGroup title="Network">
          <ToggleRow
            label="Local-only mode"
            hint="Stay offline: Browse, cores, Discord sign-in and Discord activity are all off. Games still launch."
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
        <SettingsHead title="Diagnostics" text="Tools for launch failures, crashes, and Defender troubleshooting." />
        <SettingsGroup title="Logs">
          <PathRow label="Exordium logs" value={app.paths.logs} openKey="logs" />
          <ToggleRow
            label="Verbose launch logs"
            hint="Write extra detail to the loader log for each launch."
            checked={s.diagnostics.verboseLaunchLogs}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { verboseLaunchLogs: value } })}
          />
          <ToggleRow
            label="Native loader debug"
            hint="Have the loader log where it is during startup, for diagnosing hangs."
            checked={s.diagnostics.nativeLoaderDebug}
            disabled={busy}
            onChange={(value) => onPatch({ diagnostics: { nativeLoaderDebug: value } })}
          />
          <ToggleRow
            label="Defender troubleshooting mode"
            hint="Avoid behavior antivirus may flag. Also turns off Discord game activity."
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
      <SettingsHead title="Appearance" text="Display preferences for the launcher shell." />
      <SettingsGroup title="Display">
        <SelectRow
          label="Theme"
          hint="Dark, dim light, or follow Windows."
          value={s.appearance.theme}
          disabled={busy}
          options={[["dark", "Dark"], ["light", "Dim light"], ["system", "Use system"]]}
          onChange={(value) => onPatch({ appearance: { theme: value } })}
        />
        <ToggleRow
          label="Reduce motion"
          hint="Turn off animations and transitions."
          checked={s.appearance.reduceMotion}
          disabled={busy}
          onChange={(value) => onPatch({ appearance: { reduceMotion: value } })}
        />
      </SettingsGroup>
    </>
  );
}
