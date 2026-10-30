import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { SettingsGroup, ToggleRow } from "../../components/settings-rows.tsx";
import type { BackupSettings } from "../../types.ts";

/** Settings -> Backups: the backup settings every title shares (backups.ts, /api/backups). */
export function BackupSettingsPage() {
  const [settings, setSettings] = React.useState<BackupSettings | null>(null);
  const [keep, setKeep] = React.useState("");
  const [folder, setFolder] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const apply = React.useCallback((next: BackupSettings) => {
    setSettings(next);
    setKeep(String(next.keep));
    setFolder(next.custom ? next.folder : "");
  }, []);

  React.useEffect(() => {
    void (async () => {
      const response = await fetch("/api/backups");
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.settings) apply(body.settings);
      else setProblem(body.error ?? tr("Could not read the backup settings."));
    })();
  }, [apply]);

  async function save(change: Partial<{ auto: boolean; keep: number; folder: string }>) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", ...change }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? tr("Could not save."));
      apply(body.settings);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return problem ? <p className="error">{problem}</p> : <p className="muted">{tr("Reading…")}</p>;
  return (
    <>
      <SettingsGroup title={tr("Automatic")}>
        <ToggleRow
          label={tr("Back up when a game closes")}
          hint={tr(
            "When the last copy of a title closes, copy its save folder. Skipped if nothing changed since the last backup.",
          )}
          checked={settings.auto}
          disabled={busy}
          onChange={(value) => void save({ auto: value })}
        />
        <label className="settings-row">
          <span className="settings-label">
            {tr("Keep the newest")}
            <small className="settings-hint">
              {tr("Automatic backups kept per title. Manual ones stay until you delete them.")}
            </small>
          </span>
          <input
            type="number"
            min={1}
            max={999}
            value={keep}
            disabled={busy}
            onChange={(event) => setKeep(event.currentTarget.value)}
            onBlur={() => {
              const value = Number(keep);
              if (Number.isInteger(value) && value >= 1 && value !== settings.keep) void save({ keep: value });
              else setKeep(String(settings.keep));
            }}
          />
        </label>
      </SettingsGroup>
      <SettingsGroup title={tr("Location")}>
        <div className="settings-row">
          <span className="settings-label">
            {tr("Backup folder")}
            <small className="settings-hint">
              {tr(
                "Blank uses Exordium's own folder. A cloud-synced folder keeps them off this machine. Changing it does not move existing backups.",
              )}
            </small>
          </span>
          <div className="path-actions">
            <input
              type="text"
              value={folder}
              placeholder={settings.custom ? "" : settings.folder}
              disabled={busy}
              onChange={(event) => setFolder(event.currentTarget.value)}
            />
            <button
              type="button"
              className="ghost"
              disabled={busy || folder.trim() === (settings.custom ? settings.folder : "")}
              onClick={() => void save({ folder })}
            >
              {tr("Save")}
            </button>
          </div>
        </div>
      </SettingsGroup>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}
