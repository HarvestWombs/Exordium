import { plural, tr } from "../lib/i18n.ts";
import * as React from "react";

/**
 * Library → Import: where a mod comes from. The D2SE install's mods and a folder are reviewed in the
 * converter, which writes their exordium.mod.json; an archive is unpacked straight into the library,
 * with a draft of it from its D2SE_SETUP.ini.
 */
export function ImportDialog(
  { installMods, onInstall, onFolder, onArchive, onClose }: {
    installMods: number;
    onInstall: () => void;
    onFolder: () => void;
    onArchive: () => Promise<void>;
    onClose: () => void;
  },
) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  async function archive() {
    setBusy(true);
    setProblem(null);
    try {
      await onArchive();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="confirm import-dialog" role="dialog" aria-labelledby="import-title">
        <h2 id="import-title">{tr("Import a mod")}</h2>
        <p>
          {tr(
            "Exordium copies the mod into its own library and runs it from there, so the original is never changed. Each mod gets an exordium.mod.json describing what it loads; you can review it before anything is copied.",
          )}
        </p>
        <div className="import-choices">
          {installMods > 0 && (
            <button type="button" className="import-choice" disabled={busy} onClick={onInstall}>
              <strong>{tr("From your Diablo II install")}</strong>
              <span>
                {plural(
                  installMods,
                  "{count} D2SE mod not in the library yet. Each opens in the converter.",
                  "{count} D2SE mods not in the library yet. Each opens in the converter.",
                )}
              </span>
            </button>
          )}
          <button type="button" className="import-choice" disabled={busy} onClick={onFolder}>
            <strong>{tr("From a folder")}</strong>
            <span>
              {tr(
                "A mod already unpacked somewhere, such as an old one you kept. Choose the folder that holds its MPQs or D2SE_SETUP.ini; the converter drafts the rest for you to check.",
              )}
            </span>
          </button>
          <button type="button" className="import-choice" disabled={busy} onClick={() => void archive()}>
            <strong>{busy ? tr("Unpacking…") : tr("From an archive")}</strong>
            <span>
              {tr(
                "A .zip, .7z or .rar as it was downloaded. It is unpacked into the library and opens on its page. A .7z needs 7-Zip installed.",
              )}
            </span>
          </button>
        </div>
        {problem && <p className="bad-text small">{problem}</p>}
        <div className="row-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>{tr("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}
