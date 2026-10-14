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
            <strong>Exordium {update.version} is ready.</strong>
            <span>Restart to update from {update.current}. Your library, boxes and characters stay as they are.</span>
          </div>
          <button type="button" className="ghost primary" onClick={onRestart}>Restart to update</button>
          <button type="button" className="ghost" onClick={onLater}>Later</button>
        </div>
      )}
      {importCount > 0 && (
        <div className="banner-action" role="status">
          <div>
            <strong>Import your D2SE mods?</strong>
            <span>
              {importCount} mod{importCount === 1 ? " is" : "s are"}{" "}
              in your Diablo II install. Each is reviewed, then copied into Exordium's library.
            </span>
          </div>
          <button type="button" className="ghost primary" onClick={onImport}>Import mods</button>
          <button type="button" className="ghost" onClick={onNotNow}>Not now</button>
        </div>
      )}
    </>
  );
}
