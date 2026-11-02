import { formatDateTime, plural, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { formatSize, relative } from "../../lib/util.ts";
import type { BackupEntry, BackupSettings } from "../../types.ts";

export const BACKUP_REASONS: Record<BackupEntry["reason"], string> = {
  closed: tr("Automatic"),
  manual: tr("Manual"),
  "before-restore": tr("Before restore"),
  "before-rebuild": tr("Before rebuild"),
};

/**
 * Copies of the title's save folder (backups.ts): taken when the last copy closes, by hand, and
 * before every restore. Restoring writes a backup's files back and deletes nothing.
 */
export function Backups({ root, titleKey, running }: { root: string; titleKey: string; running: number }) {
  const [list, setList] = React.useState<{ folder: string; settings: BackupSettings; backups: BackupEntry[] } | null>(
    null,
  );
  const [confirming, setConfirming] = React.useState<{ id: string; action: "restore" | "delete" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; bad: boolean } | null>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch(`/api/backups?root=${encodeURIComponent(root)}&key=${encodeURIComponent(titleKey)}`);
    const body = await response.json();
    if (!response.ok) {
      setMessage({ text: body.error ?? tr("Could not read the backups."), bad: true });
      return;
    }
    setList(body);
  }, [root, titleKey]);

  React.useEffect(() => {
    setList(null);
    setMessage(null);
    setConfirming(null);
    void refresh();
  }, [refresh]);

  // A backup is taken as the last copy closes, before the page hears the game has ended.
  React.useEffect(() => {
    if (running === 0) void refresh();
  }, [running, refresh]);

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/backups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root, key: titleKey, ...body }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ text: result.error ?? tr("That did not work."), bad: true });
        return null;
      }
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const result = await post({ action: "create" });
    if (result) setMessage({ text: tr("Backed up."), bad: false });
    await refresh();
  }

  async function confirm() {
    if (!confirming) return;
    const { id, action } = confirming;
    setConfirming(null);
    const result = await post({ action, id });
    if (result && action === "restore") {
      const restored = Number(result.restored);
      setMessage({
        text: restored === 0
          ? tr("The save folder already matches this backup; nothing was changed.")
          : plural(restored, "Restored {count} file.", "Restored {count} files.") +
            (result.before ? tr(" What was there before is in the newest backup, marked Before restore.") : ""),
        bad: false,
      });
    }
    await refresh();
  }

  const settings = list?.settings;
  const closeFirst = running > 0;

  return (
    <section className="backups">
      <div className="section-head">
        <h2 className="eyebrow">{tr("BACKUPS")}</h2>
        <span className="muted small">{tr("copies of this title's save folder")}</span>
        <div className="grow" />
        <button
          type="button"
          className="ghost"
          disabled={busy || closeFirst}
          data-tooltip={closeFirst ? tr("Close the game first") : undefined}
          onClick={() => void create()}
        >
          {tr("Back up now")}
        </button>
        <button type="button" className="ghost" onClick={() => void post({ action: "open" })}>
          {tr("Open folder")}
        </button>
      </div>
      {message && <p className={message.bad ? "bad-text small" : "muted small"}>{message.text}</p>}
      {closeFirst && (
        <p className="muted small">{tr("The game is running. Backing up and restoring wait until it closes.")}</p>
      )}
      {list === null && <p className="muted">{tr("Reading backups…")}</p>}
      {list?.backups.length === 0 && (
        <p className="muted">
          {tr("No backups yet.")}{" "}
          {settings?.auto ? tr("One is taken each time the game closes with characters saved.") : ""}
        </p>
      )}

      {list && list.backups.length > 0 && (
        <ul className="backup-list">
          {list.backups.map((backup) => (
            <li key={backup.id} className="backup-row">
              <div className="backup-when">
                <strong>{formatDateTime(backup.createdAt)}</strong>
                <span className="muted small">
                  {relative(backup.createdAt)} · {formatSize(backup.bytes)} · {backup.files}{" "}
                  {backup.files === 1 ? "file" : "files"}
                </span>
              </div>
              <span className={`pill backup-reason ${backup.reason}`}>{BACKUP_REASONS[backup.reason]}</span>
              <div className="backup-characters">
                {backup.characters.length === 0
                  ? <span className="muted small">{tr("No characters")}</span>
                  : backup.characters.map((c) => (
                    <span key={c.name} className="small">
                      {c.name}{" "}
                      <span className="muted">
                        · {c.level} {c.className}
                        {c.hardcore ? tr(" · HC") : ""}
                        {c.dead ? tr(" · dead") : ""}
                      </span>
                    </span>
                  ))}
              </div>
              <div className="backup-actions">
                {confirming?.id === backup.id
                  ? (
                    <>
                      <button
                        type="button"
                        className={confirming.action === "delete" ? "ghost danger" : "ghost primary"}
                        disabled={busy}
                        onClick={() => void confirm()}
                      >
                        {confirming.action === "delete" ? tr("Delete it") : tr("Restore it")}
                      </button>
                      <button type="button" className="ghost" onClick={() => setConfirming(null)}>
                        {tr("Cancel")}
                      </button>
                    </>
                  )
                  : (
                    <>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy || closeFirst}
                        data-tooltip={closeFirst
                          ? tr("Close the game first")
                          : tr("Writes these files back; characters made since stay")}
                        onClick={() => setConfirming({ id: backup.id, action: "restore" })}
                      >
                        {tr("Restore")}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => setConfirming({ id: backup.id, action: "delete" })}
                      >
                        {tr("Delete")}
                      </button>
                    </>
                  )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small backup-note">
        {tr("Automatic backups, how many are kept, and where they go are set in Settings → Backups, for every title.")}
      </p>
    </section>
  );
}
