import { formatDateTime, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { formatSize } from "../../lib/util.ts";
import type { LogFile } from "../../types.ts";

/**
 * What the last runs wrote: the game's trace, plugin logs, Crashdump, the loader log. They are in the
 * title's box, not the mod folder, so a log sitting in the mod folder is whatever the mod shipped.
 */
export function Logs({ root, titleKey }: { root: string; titleKey: string }) {
  const query = `root=${encodeURIComponent(root)}&key=${encodeURIComponent(titleKey)}`;
  const [list, setList] = React.useState<{ folder: string; logs: LogFile[] } | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [text, setText] = React.useState<{ body: string; truncated: boolean } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const viewer = React.useRef<HTMLPreElement>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch(`/api/logs?${query}`);
    const body = await response.json();
    setList(body);
    setSelected((current) =>
      current && body.logs.some((log: LogFile) => log.name === current) ? current : body.logs[0]?.name ?? null
    );
  }, [query]);

  React.useEffect(() => {
    setList(null);
    setSelected(null);
    void refresh();
  }, [refresh]);

  const show = React.useCallback(async (name: string) => {
    setText(null);
    const response = await fetch(`/api/logs?${query}&name=${encodeURIComponent(name)}`);
    if (!response.ok) {
      setText({ body: "", truncated: false });
      return;
    }
    setText({ body: await response.text(), truncated: response.headers.get("x-log-truncated") === "1" });
  }, [query]);

  React.useEffect(() => {
    if (selected) void show(selected);
    else setText(null);
  }, [selected, show, list]);

  // A crash is at the end of a log, so open each one scrolled to the bottom.
  React.useEffect(() => {
    if (viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight;
  }, [text]);

  async function openFolder() {
    setError(null);
    const response = await fetch(`/api/logs?${query}`, { method: "POST" });
    if (!response.ok) setError((await response.json()).error ?? tr("Could not open the folder."));
  }

  return (
    <section className="logs">
      <div className="section-head">
        <h2 className="eyebrow">{tr("LOGS")}</h2>
        <span className="muted small">{tr("what the last runs wrote, in this title's box")}</span>
        <div className="grow" />
        <button type="button" className="ghost" onClick={() => void refresh()}>{tr("Refresh")}</button>
        <button type="button" className="ghost" onClick={() => void openFolder()}>{tr("Open folder")}</button>
      </div>
      {error && <p className="bad-text small">{error}</p>}
      {list === null && <p className="muted">{tr("Reading logs…")}</p>}
      {list?.logs.length === 0 && (
        <p className="muted">{tr("No logs yet. They appear here after the title has been played.")}</p>
      )}
      {list && list.logs.length > 0 && (
        <div className="logs-body">
          <ul className="log-list">
            {list.logs.map((log) => (
              <li key={log.name}>
                <button
                  type="button"
                  className={log.name === selected ? "log-item on" : "log-item"}
                  onClick={() => setSelected(log.name)}
                >
                  <span className="log-name">{log.name}</span>
                  <span className="muted small">
                    {formatSize(log.size)}
                    {log.modifiedAt ? ` · ${formatDateTime(log.modifiedAt)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="log-view">
            {text?.truncated && <p className="muted small">{tr("Showing the last 512 KB.")}</p>}
            <pre ref={viewer} className="log-text">{text === null ? tr("Reading…") : text.body || tr("(empty)")}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
