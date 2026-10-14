import * as React from "react";
import { Lightbox } from "../../components/Lightbox.tsx";
import { screenshotUrl } from "../../lib/art.ts";
import { decodeText, docUrl, excerptOf, newestChangelog, randomShots, rtfToText } from "../../lib/docs.ts";
import { playTime, relative } from "../../lib/util.ts";
import type { BackupEntry, DocEntry, FeedItem, Screenshot, Title } from "../../types.ts";

/** The overview's screenshots: only a compact random strip, each opening the gallery. */
export function ScreenshotStrip({ root, t }: { root: string; t: Title }) {
  const [shots, setShots] = React.useState<Screenshot[] | null>(null);
  const [open, setOpen] = React.useState<number | null>(null);
  React.useEffect(() => {
    setShots(null);
    setOpen(null);
    void (async () => {
      const response = await fetch(
        `/api/screenshots?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`,
      );
      if (!response.ok) return setShots([]);
      const list = (await response.json()).screenshots as Screenshot[];
      setShots(randomShots(list, t.key));
    })();
  }, [root, t.key]);
  if (!shots || shots.length === 0) return null;
  return (
    <section className="showcase-strip-section">
      <div className="section-head">
        <h2 className="eyebrow">SCREENSHOTS</h2>
        <span className="muted small">random picks from {t.screenshots} found</span>
      </div>
      <div className="overview-shot-strip">
        {shots.map((shot, i) => (
          <button type="button" key={shot.name} title={shot.name} onClick={() => setOpen(i)}>
            <img src={screenshotUrl(root, t.key, shot.name)} alt={shot.name} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && (
        <Lightbox
          images={shots.map((shot) => ({ src: screenshotUrl(root, t.key, shot.name), caption: shot.name }))}
          start={open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/** The newest changelog we can infer from filenames, as a short excerpt. */
export function WhatsNew({ t, onOpen }: { t: Title; onOpen: () => void }) {
  const entry = React.useMemo(() => newestChangelog(t.changelogs), [t.changelogs]);
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => {
    setText(null);
    if (!entry || entry.kind === "html") return;
    void (async () => {
      const response = await fetch(docUrl(t.key, entry.path));
      if (!response.ok) return;
      const raw = decodeText(await response.arrayBuffer());
      setText(entry.kind === "rtf" ? rtfToText(raw) : raw);
    })();
  }, [t.key, entry]);
  if (!entry) return null;
  return (
    <section className="news-card">
      <div className="section-head">
        <h2 className="eyebrow">WHAT'S NEW</h2>
        <span className="muted small">{entry.label}</span>
      </div>
      {entry.kind === "html"
        ? <p className="muted">This changelog is a web page.</p>
        : <pre className="news-excerpt">{text === null ? "Reading…" : excerptOf(text, 700)}</pre>}
      <button type="button" className="link-button" onClick={onOpen}>Read the full changelog ›</button>
    </section>
  );
}

/** Recent activity: the title's runs (the play ledger) and backups, newest first. */
export function ActivityFeed({ root, t, running }: { root: string; t: Title; running: number }) {
  const [items, setItems] = React.useState<FeedItem[] | null>(null);
  React.useEffect(() => {
    // Re-read when a run ends (running drops), so the new session shows up.
    if (running > 0) return;
    void (async () => {
      const [runsResponse, backupsResponse] = await Promise.all([
        fetch(`/api/activity?key=${encodeURIComponent(t.key)}`),
        fetch(`/api/backups?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`),
      ]);
      const runs = runsResponse.ok
        ? (await runsResponse.json()).runs as { startedAt: string; seconds: number; state: string }[]
        : [];
      const backups = backupsResponse.ok ? (await backupsResponse.json()).backups as BackupEntry[] : [];
      const feed: FeedItem[] = [
        ...runs.map((run) => ({
          at: run.startedAt,
          text: run.state === "crashed" ? "Played — the game crashed" : "Played",
          detail: playTime(run.seconds),
          bad: run.state === "crashed",
        })),
        ...backups.map((backup) => ({
          at: backup.createdAt,
          text: backup.reason === "manual"
            ? "Backed up by hand"
            : backup.reason === "before-restore"
            ? "Backed up before a restore"
            : backup.reason === "before-rebuild"
            ? "Backed up before a box rebuild"
            : "Characters backed up",
          detail: backup.characters.map((c) => c.name).join(", ") || `${backup.files} files`,
          bad: false,
        })),
      ];
      setItems(feed.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8));
    })();
  }, [root, t.key, running]);
  if (!items || items.length === 0) return null;
  return (
    <section className="activity">
      <h2 className="eyebrow">RECENT ACTIVITY</h2>
      <ol className="activity-list">
        {items.map((item, i) => (
          <li key={`${item.at}-${i}`} className={item.bad ? "bad" : ""}>
            <span className="activity-dot" />
            <span className="activity-text">{item.text}</span>
            <span className="muted small">{item.detail}</span>
            <time className="muted small" dateTime={item.at} title={new Date(item.at).toLocaleString()}>
              {relative(item.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DocPanel({ titleKey, entries, empty }: { titleKey: string; entries: DocEntry[]; empty: string }) {
  const [selected, setSelected] = React.useState<string | null>(entries[0]?.path ?? null);
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => setSelected(entries[0]?.path ?? null), [titleKey, entries]);
  const entry = entries.find((e) => e.path === selected) ?? null;

  React.useEffect(() => {
    setText(null);
    if (!entry || entry.kind === "html") return;
    void (async () => {
      const response = await fetch(docUrl(titleKey, entry.path));
      if (!response.ok) return setText("Could not read this file.");
      const raw = decodeText(await response.arrayBuffer());
      setText(entry.kind === "rtf" ? rtfToText(raw) : raw);
    })();
  }, [titleKey, entry]);

  if (entries.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="docs">
      {entries.length > 1 && (
        <ul className="doc-list">
          {entries.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                className={e.path === selected ? "log-item on" : "log-item"}
                onClick={() => setSelected(e.path)}
              >
                <span className="log-name">{e.label}</span>
                <span className="muted small">{e.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="doc-view">
        {entry?.kind === "html"
          ? <iframe className="doc-frame" sandbox="" src={docUrl(titleKey, entry.path)} title={entry.label} />
          : <pre className="log-text doc-text">{text ?? "Reading…"}</pre>}
      </div>
    </div>
  );
}
