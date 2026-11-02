import { formatDate, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { PreviewCard } from "../../components/PreviewCard.tsx";
import { artUrl } from "../../lib/art.ts";
import { keptUploads, loadUploads, pageDescription } from "../../lib/latest-uploads.ts";
import { readStored } from "../../lib/util.ts";
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

function uploadLabel(upload: Upload): string {
  return upload.source === "update" ? tr("Update available") : uploadedWhen(upload.addedAt);
}

/**
 * The library home's Latest uploads row, as Steam's What's New: the newest uploads from the browse
 * sources (Internet Archive and ModDB, merged by date on the server, browse.ts latestUploads), a card
 * each; a card opens Browse on it, and hovering one pops out its description, as a library capsule
 * does its details (the same Hover previews and Preview delay). Nothing shows when the sources cannot
 * be read (offline, or Local only).
 */
export function LatestUploads({ updates, onOpen }: { updates: Upload[]; onOpen: (upload: Upload) => void }) {
  // What the app fetched at startup shows at once; a fresh copy replaces it quietly.
  const [items, setItems] = React.useState<Upload[] | null>(keptUploads);
  // The description is null while it is being read from the upload's own page.
  const [preview, setPreview] = React.useState<
    { upload: Upload; rect: DOMRect; description: string | null } | null
  >(null);
  const previewTimer = React.useRef<number | null>(null);
  const strip = React.useRef<HTMLDivElement>(null);
  const hidePreview = React.useCallback(() => {
    if (previewTimer.current !== null) globalThis.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreview(null);
  }, []);
  function showPreview(upload: Upload, element: HTMLElement) {
    if (!readStored("exordium.hoverPreviews", true)) return;
    if (previewTimer.current !== null) globalThis.clearTimeout(previewTimer.current);
    const rect = element.getBoundingClientRect();
    previewTimer.current = globalThis.setTimeout(() => {
      previewTimer.current = null;
      setPreview({ upload, rect, description: upload.description || null });
      if (upload.description) return;
      void pageDescription(upload)
        .catch(() => tr("Could not read this page."))
        .then((description) =>
          setPreview((current) => current?.upload.key === upload.key ? { ...current, description } : current)
        );
    }, readStored("exordium.previewDelay", 420));
  }
  React.useEffect(() => hidePreview, [hidePreview]);
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
        <button
          type="button"
          className="uploads-arrow"
          aria-label={tr("Newer")}
          data-tooltip={tr("Newer")}
          onClick={() => scroll(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="uploads-arrow"
          aria-label={tr("Older")}
          data-tooltip={tr("Older")}
          onClick={() => scroll(1)}
        >
          ›
        </button>
      </div>
      <div className="uploads-strip" ref={strip} onScroll={hidePreview}>
        {cards.map((upload, index) => (
          <button
            type="button"
            key={upload.key}
            className={upload.source === "update" ? "upload update" : "upload"}
            data-tooltip={readStored("exordium.hoverPreviews", true) ? undefined : upload.title}
            onPointerEnter={(event) => showPreview(upload, event.currentTarget)}
            onPointerLeave={hidePreview}
            onFocus={(event) => showPreview(upload, event.currentTarget)}
            onBlur={hidePreview}
            onClick={() => {
              hidePreview();
              onOpen(upload);
            }}
          >
            <span className="upload-when">{uploadLabel(upload)}</span>
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
      {preview && (
        <PreviewCard rect={preview.rect} title={preview.upload.title}>
          <p className="capsule-preview-state">
            <span className="dot" />
            {uploadLabel(preview.upload)} · {preview.upload.sourceLabel}
          </p>
          <p className="capsule-preview-description">
            {preview.description === null ? "…" : preview.description || tr("The author gave no description.")}
          </p>
        </PreviewCard>
      )}
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
      description: t.description ?? "",
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
