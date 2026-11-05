/**
 * The bar along the bottom: what Exordium is doing, with anything downloading in the middle, which
 * opens Downloads. One line at one height, so the layout never moves. Errors, notices and a ready
 * update are toasts (Toasts).
 */
export function StatusBar(
  { download, activity, live, library, onDownloads }: {
    download: { text: string; percent: number | null } | null;
    activity: string;
    live: boolean;
    library: string;
    onDownloads: () => void;
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
