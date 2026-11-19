import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { formatSize } from "../../lib/util.ts";

/**
 * Settings' Clear cache for Browse: deletes everything read from the Internet Archive and ModDB (the
 * lists, each mod's details, screenshots) and reads it all again. The only full rebuild: startup and
 * Browse's Refresh fetch just what is new or changed. Asks first, in place.
 */
export function BrowseCacheRow() {
  const [bytes, setBytes] = React.useState<number | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void fetch("/api/browse/cache")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { bytes?: number } | null) => setBytes(body?.bytes ?? null))
      .catch(() => setBytes(null));
  }, []);

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/browse/cache", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? tr("Could not clear the cache."));
      setBytes(body.bytes ?? 0);
      setAsking(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-row">
      <span className="settings-label">
        {tr("Browse cache")}
        <small className="settings-hint">
          {tr(
            "What Browse has read from the Internet Archive and ModDB: the lists, each mod's details and screenshots. Only new and changed entries are fetched normally; clearing reads everything again from scratch.",
          )}
        </small>
        {error && <small className="warn-text">{error}</small>}
      </span>
      <div className="path-actions">
        {bytes !== null && <code>{formatSize(bytes)}</code>}
        {asking
          ? (
            <>
              <button type="button" className="ghost danger" disabled={busy} onClick={() => void clear()}>
                {busy ? tr("Clearing…") : tr("Clear")}
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => setAsking(false)}>
                {tr("Cancel")}
              </button>
            </>
          )
          : (
            <button type="button" className="ghost" disabled={!bytes} onClick={() => setAsking(true)}>
              {tr("Clear cache…")}
            </button>
          )}
      </div>
    </div>
  );
}
