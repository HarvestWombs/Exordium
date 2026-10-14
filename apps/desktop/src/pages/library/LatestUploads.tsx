import * as React from "react";
import { artUrl } from "../../lib/art.ts";
import type { Title, Upload } from "../../types.ts";

/** How long ago, in calendar days and the buckets Steam's What's New uses. */
export function uploadedWhen(iso: string): string {
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(new Date(iso))) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 14) return "1 week ago";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * The library home's Latest uploads row, as Steam's What's New: the newest uploads from the browse
 * sources (Internet Archive and ModDB, merged by date), a card each; a card opens Browse on it.
 * Nothing shows when the sources cannot be read (offline, or Local only).
 */
export function LatestUploads({ updates, onOpen }: { updates: Upload[]; onOpen: (upload: Upload) => void }) {
  const [items, setItems] = React.useState<Upload[] | null>(null);
  const strip = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let cancelled = false;
    const get = async (url: string) => {
      try {
        const response = await fetch(url);
        return response.ok ? await response.json() : null;
      } catch {
        return null;
      }
    };
    void (async () => {
      const [archive, moddb] = await Promise.all([get("/api/browse"), get("/api/browse/moddb")]);
      const list: Upload[] = [];
      for (
        const item of (archive?.items ?? []) as { id: string; title: string; addedAt: string | null; cover: string }[]
      ) {
        if (item.addedAt) {
          list.push({
            key: `archive:${item.id}`,
            source: "archive",
            title: item.title,
            addedAt: item.addedAt,
            cover: item.cover,
            sourceLabel: "Internet Archive",
          });
        }
      }
      for (
        const item of (moddb?.items ?? []) as {
          id: string;
          title: string;
          addedAt: string | null;
          cover: string;
          sourceLabel?: string;
        }[]
      ) {
        if (item.addedAt) {
          list.push({
            key: `moddb:${item.id}`,
            source: "moddb",
            title: item.title,
            addedAt: item.addedAt,
            cover: item.cover,
            sourceLabel: item.sourceLabel ? `ModDB · ${item.sourceLabel}` : "ModDB",
          });
        }
      }
      list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
      // One card per upload: the same mod posted the same day in several variants ("… (D2GL
      // Russian)", "… (D2GL English)", "… - pt-BR") is shown once, as its newest.
      const seen = new Set<string>();
      const shown = list.filter((upload) => {
        const base = upload.title.replace(/\s*(\(.*\)|-\s*[a-z]{2}(-[a-z]{2})?)\s*$/i, "").trim().toLowerCase();
        const id = `${base}|${upload.addedAt.slice(0, 10)}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      if (!cancelled) setItems(shown.slice(0, 16));
    })();
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
        <h2 className="eyebrow">LATEST UPLOADS</h2>
        <div className="grow" />
        <button type="button" className="uploads-arrow" aria-label="Newer" onClick={() => scroll(-1)}>‹</button>
        <button type="button" className="uploads-arrow" aria-label="Older" onClick={() => scroll(1)}>›</button>
      </div>
      <div className="uploads-strip" ref={strip}>
        {cards.map((upload) => (
          <button
            type="button"
            key={upload.key}
            className={upload.source === "update" ? "upload update" : "upload"}
            title={upload.title}
            onClick={() => onOpen(upload)}
          >
            <span className="upload-when">
              {upload.source === "update" ? "Update available" : uploadedWhen(upload.addedAt)}
            </span>
            <span className="upload-art">
              {upload.cover
                ? <img src={upload.cover} alt="" loading="lazy" />
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
      sourceLabel: t.updateCheck!.latestVersion ? `Update · v${t.updateCheck!.latestVersion}` : "Update available",
    }));
}
