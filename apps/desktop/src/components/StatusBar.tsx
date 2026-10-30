import { tr } from "../lib/i18n.ts";

/**
 * The bar along the bottom: a downloaded update in orange, otherwise what Exordium is doing. One line
 * at one height, so the layout never moves. Errors and notices are toasts (useToasts).
 */
export function StatusBar(
  { update, activity, live, library, onRestart, onLater }: {
    /** A downloaded update not put off: its version, and the one running. */
    update: { version: string; current: string } | null;
    activity: string;
    live: boolean;
    library: string;
    onRestart: () => void;
    onLater: () => void;
  },
) {
  if (update) {
    const detail = tr("Restart to update from {current}. Your library, boxes and characters stay as they are.", {
      current: update.current,
    });
    return (
      <footer className="statusbar accent" role="status">
        <span className="statusbar-text" title={detail}>
          <strong>{tr("Exordium {version} is ready.", { version: update.version })}</strong> {detail}
        </span>
        <button type="button" className="ghost primary compact" onClick={onRestart}>{tr("Restart to update")}</button>
        <button type="button" className="ghost compact" onClick={onLater}>{tr("Later")}</button>
      </footer>
    );
  }
  return (
    <footer className="statusbar">
      <span className={live ? "dot live" : "dot"} />
      <span className="statusbar-text">{activity}</span>
      <span>{library}</span>
    </footer>
  );
}
