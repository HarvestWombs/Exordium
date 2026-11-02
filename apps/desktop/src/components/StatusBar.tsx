import { tr } from "../lib/i18n.ts";

/**
 * The bar along the bottom: a downloaded update in orange, otherwise what Exordium is doing, with
 * anything downloading in the middle, which opens Downloads. One line at one height, so the layout
 * never moves. Errors and notices are toasts (useToasts).
 */
export function StatusBar(
  { update, download, activity, live, library, onDownloads, onRestart, onLater }: {
    /** A downloaded update not put off: its version, and the one running. */
    update: { version: string; current: string } | null;
    download: { text: string; percent: number | null } | null;
    activity: string;
    live: boolean;
    library: string;
    onDownloads: () => void;
    onRestart: () => void;
    onLater: () => void;
  },
) {
  const middle = download && (
    <button
      type="button"
      className="statusbar-download"
      data-tooltip={download.text}
      data-tooltip-placement="top"
      onClick={onDownloads}
    >
      <span className="spinner small" aria-hidden="true" />
      <span className="statusbar-download-text">{download.text}</span>
      {download.percent !== null && (
        <span className="update-progress">
          <span style={{ width: `${download.percent}%` }} />
        </span>
      )}
    </button>
  );
  if (update) {
    const detail = tr("Restart to update from {current}. Your library, boxes and characters stay as they are.", {
      current: update.current,
    });
    return (
      <footer className="statusbar accent" role="status">
        <div className="statusbar-side">
          <span className="statusbar-text" data-tooltip={detail} data-tooltip-placement="top">
            <strong>{tr("Exordium {version} is ready.", { version: update.version })}</strong> {detail}
          </span>
        </div>
        {middle}
        <div className="statusbar-side end">
          <button type="button" className="ghost primary compact" onClick={onRestart}>{tr("Restart to update")}</button>
          <button type="button" className="ghost compact" onClick={onLater}>{tr("Later")}</button>
        </div>
      </footer>
    );
  }
  return (
    <footer className="statusbar">
      <div className="statusbar-side">
        <span className={live ? "dot live" : "dot"} />
        <span className="statusbar-text">{activity}</span>
      </div>
      {middle}
      <div className="statusbar-side end">
        <span>{library}</span>
      </div>
    </footer>
  );
}
