import { formatDate, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { artUrl } from "../../lib/art.ts";
import { keptUploads, loadUploads } from "../../lib/latest-uploads.ts";
import type { Title, Upload } from "../../types.ts";

/** How long ago, in calendar days and the buckets Steam's What's New uses. */
export function uploadedWhen(iso: string): string {
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(new Date(iso))) / 86_400_000);
  if (days < 1) return tr("Today");
  if (days < 2) return tr("Yesterday");
  if (days < 7) return tr("This week");
  if (days < 14) return tr("1 week ago");
  if (days < 60) return tr("{days} weeks ago", { days: Math.floor(days / 7) });
  return formatDate(iso, { month: "short", year: "numeric" });
}

/**
 * The library home's Latest uploads row, as Steam's What's New: the newest uploads from the browse
 * sources (Internet Archive and ModDB, merged by date on the server, browse.ts latestUploads), a card
 * each; a card opens Browse on it. Nothing shows when the sources cannot be read (offline, or Local
 * only).
 */
export function LatestUploads({ updates, onOpen }: { updates: Upload[]; onOpen: (upload: Upload) => void }) {
  // What the app fetched at startup shows at once; a fresh copy replaces it quietly.
  const [items, setItems] = React.useState<Upload[] | null>(keptUploads);
  const strip = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let cancelled = false;
    void loadUploads().then((uploads) => !cancelled && setItems(uploads));
    return () => {
      cancelled = true;
    };
  }, []);
  // Updates for titles in the library come first: they are about what the player already has.
  const cards = [...updates, ...(items ?? [])];
  if (cards.length === 0) return null;
  const scroll = (direction: number) => {
    const element = strip.current;
    element?.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <section className="uploads">
      <div className="uploads-head">
        <h2 className="eyebrow">{tr("LATEST UPLOADS")}</h2>
        <div className="grow" />
        <button type="button" className="uploads-arrow" aria-label={tr("Newer")} onClick={() => scroll(-1)}>‹</button>
        <button type="button" className="uploads-arrow" aria-label={tr("Older")} onClick={() => scroll(1)}>›</button>
      </div>
      <div className="uploads-strip" ref={strip}>
        {cards.map((upload, index) => (
          <button
            type="button"
            key={upload.key}
            className={upload.source === "update" ? "upload update" : "upload"}
            title={upload.title}
            onClick={() => onOpen(upload)}
          >
            <span className="upload-when">
              {upload.source === "update" ? tr("Update available") : uploadedWhen(upload.addedAt)}
            </span>
            <span className="upload-art">
              {upload.cover
                ? <img src={upload.cover} alt="" loading={index < 6 ? "eager" : "lazy"} />
                : <span className="upload-blank">{upload.title}</span>}
            </span>
            <span className="upload-title">{upload.title}</span>
            <span className="upload-source">{upload.sourceLabel}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** The library's titles with an update waiting, as Latest uploads cards (shown before the uploads). */
export function pendingUpdates(titles: Title[], hidden: Set<string>, root: string | null, art: number): Upload[] {
  return titles
    .filter((t) => t.updateCheck?.available && !hidden.has(t.key))
    .map((t) => ({
      key: `update:${t.key}`,
      source: "update" as const,
      titleKey: t.key,
      title: t.title,
      addedAt: t.updateCheck!.checkedAt,
      cover: t.art.banner === "png"
        ? artUrl(root, t.key, "banner", art)
        : t.art.portrait
        ? artUrl(root, t.key, "portrait", art)
        : "",
      sourceLabel: t.updateCheck!.latestVersion
        ? tr("Update · v{latestVersion}", { latestVersion: t.updateCheck!.latestVersion })
        : tr("Update available"),
    }));
}
