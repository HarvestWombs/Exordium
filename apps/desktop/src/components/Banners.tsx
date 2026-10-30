import { plural, tr } from "../lib/i18n.ts";
/**
 * The strips under the top bar: an error (click to dismiss), a passing notice, Exordium's own update
 * once it is downloaded, and the offer to import the D2SE install's mods.
 */
export function Banners(
  { error, notice, update, importCount, onDismissError, onRestart, onLater, onImport, onNotNow }: {
    error: string | null;
    notice: string | null;
    /** A downloaded update not put off: its version, and the one running. */
    update: { version: string; current: string } | null;
    /** Mods in the install to offer importing; 0 hides the offer. */
    importCount: number;
    onDismissError: () => void;
    onRestart: () => void;
    onLater: () => void;
    onImport: () => void;
    onNotNow: () => void;
  },
) {
  return (
    <>
      {error && (
        <div className="banner-error" role="alert" onClick={onDismissError}>
          {error}
        </div>
      )}
      {notice && <div className="banner-note" role="status">{notice}</div>}
      {update && (
        <div className="banner-action" role="status">
          <div>
            <strong>{tr("Exordium {version} is ready.", { version: update.version })}</strong>
            <span>
              {tr("Restart to update from {current}. Your library, boxes and characters stay as they are.", {
                current: update.current,
              })}
            </span>
          </div>
          <button type="button" className="ghost primary" onClick={onRestart}>{tr("Restart to update")}</button>
          <button type="button" className="ghost" onClick={onLater}>{tr("Later")}</button>
        </div>
      )}
      {importCount > 0 && (
        <div className="banner-action" role="status">
          <div>
            <strong>{tr("Import your D2SE mods?")}</strong>
            <span>
              {plural(
                importCount,
                "{count} mod is in your Diablo II install. Each is reviewed, then copied into Exordium's library.",
                "{count} mods are in your Diablo II install. Each is reviewed, then copied into Exordium's library.",
              )}
            </span>
          </div>
          <button type="button" className="ghost primary" onClick={onImport}>{tr("Import mods")}</button>
          <button type="button" className="ghost" onClick={onNotNow}>{tr("Not now")}</button>
        </div>
      )}
    </>
  );
}
