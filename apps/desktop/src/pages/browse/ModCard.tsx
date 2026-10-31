import { formatDate, formatNumber, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { useTranslation } from "../../hooks/useTranslation.tsx";
import { JobResult } from "./JobResult.tsx";
import { ShotGallery } from "./ShotGallery.tsx";
import { ACTIVE, baseName, formatBytes, jobLabel, jobProgress, openLink } from "./browse-util.ts";
import type { Details, Item, Job } from "./types.ts";

export function ModCard(
  {
    item,
    labels,
    keywords,
    installed,
    expanded,
    onExpand,
    jobs,
    root,
    onDetails,
    onInstall,
    onInstalled,
    onOpen,
    onKeyword,
  }: {
    item: Item;
    labels: Map<string, string>;
    keywords: string[];
    installed: boolean;
    expanded: boolean;
    onExpand: () => void;
    jobs: Job[];
    root: string | null;
    onDetails: (details: Details) => void;
    onInstall: (file: string, fromDisk: boolean) => void;
    onInstalled: (name: string) => void;
    onOpen: (what: "page" | "file" | "unpacked", file?: string) => void;
    onKeyword: (keyword: string) => void;
  },
) {
  const ref = React.useRef<HTMLElement>(null);
  const [details, setDetails] = React.useState<Details | null>(null);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<string>("");

  // Details (screenshots, files, the archive's own readme) are asked for once the card is near the
  // screen; the full screenshots are then preloaded, so switching between them is instant.
  React.useEffect(() => {
    const node = ref.current;
    if (!node || details) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const response = await fetch(`/api/browse/item?id=${encodeURIComponent(item.id)}`);
        const body = await response.json();
        if (!response.ok) return setDetailsError(body.error ?? tr("Could not read this item."));
        setDetails(body);
        setFile([...body.archives].sort((a: { size: number }, b: { size: number }) => b.size - a.size)[0]?.name ?? "");
        onDetails(body);
        for (const s of body.screenshots as Details["screenshots"]) new Image().src = s.full;
      })();
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.id, details, onDetails]);

  const job = jobs.find((j) => baseName(j.file) === baseName(file)) ?? jobs[0];
  const description = details?.description ?? "";
  const translation = useTranslation(description);
  const shots = details?.screenshots ?? [];
  const progress = job ? jobProgress(job) : null;
  const running = job ? ACTIVE.includes(job.state) : false;

  return (
    <article ref={ref} className="mod-card">
      <button
        type="button"
        className="mod-cover"
        title={tr("Open its archive.org page")}
        onClick={() => onOpen("page")}
      >
        {
          /* The uploader's first screenshot when there is one: archive.org's own tile is a generic logo for
            most items. */
        }
        <img src={shots[0]?.thumb ?? item.cover} alt="" loading="lazy" />
        {installed && <span className="ribbon">{tr("IN LIBRARY")}</span>}
      </button>

      <div className="mod-info">
        <h2 className="mod-title">{item.title}</h2>
        <p className={expanded ? "mod-description open" : "mod-description"}>
          {details === null
            ? "…"
            : translation.text || tr("The uploader gave no description, and none was found in the archive.")}
        </p>
        <div className="mod-under">
          {details?.descriptionSource && description && (
            <span className="muted small">
              {tr("From {descriptionSource}", { descriptionSource: details.descriptionSource })}
            </span>
          )}
          {description.length > 280 && (
            <button type="button" className="small-button" onClick={onExpand}>
              {expanded ? tr("Less") : tr("More")}
            </button>
          )}
          {translation.button}
          {details?.links.map((link) => (
            <button
              type="button"
              key={link.url}
              className="small-button"
              title={link.url}
              onClick={() => openLink(link.url)}
            >
              {link.label} ↗
            </button>
          ))}
        </div>
        {keywords.length > 0 && (
          <div className="mod-tags">
            <span className="eyebrow">{tr("TAGS")}</span>
            {keywords.map((keyword) => (
              <button
                type="button"
                key={keyword}
                className="mod-tag"
                onClick={() => onKeyword(keyword)}
              >
                {labels.get(keyword) ?? keyword}
              </button>
            ))}
          </div>
        )}
        <dl className="mod-facts">
          <dt>{tr("ADDED")}</dt>
          <dd>{item.addedAt ? formatDate(item.addedAt) : "—"}</dd>
          <dt>{tr("BY")}</dt>
          <dd>{item.creator ?? "—"}</dd>
          <dt>{tr("DOWNLOADS")}</dt>
          <dd>{formatNumber(item.downloads)}</dd>
        </dl>
      </div>

      <ShotGallery shots={shots} empty={details ? tr("No screenshots") : detailsError ?? "…"} />

      <div className="mod-bar">
        <span className="source-badge">Internet Archive</span>
        <button type="button" className="small-button" onClick={() => onOpen("page")}>{tr("Page ↗")}</button>
        <div className="grow" />
        {detailsError && <span className="bad-text small">{detailsError}</span>}
        <JobResult job={job} onInstalled={onInstalled} onOpen={(what) => onOpen(what, job?.file)} />
        {running && progress !== null && (
          <span className="progress">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
        {details && details.archives.length > 1 && !running && (
          <select
            value={file}
            onChange={(e) => setFile(e.currentTarget.value)}
            aria-label={tr("File to install")}
          >
            {details.archives.map((a) => <option key={a.name} value={a.name}>{a.name} ({formatBytes(a.size)})</option>)}
          </select>
        )}
        <span className="mod-size">
          {formatBytes(details?.archives.find((a) => a.name === file)?.size ?? item.size)}
        </span>
        <button
          type="button"
          className="download"
          disabled={!details || !file || !root || running || job?.state === "installed"}
          title={root ? undefined : tr("Choose the Diablo II install first")}
          onClick={() => onInstall(file, job?.state === "downloaded")}
        >
          {job ? jobLabel(job) : details && !file ? tr("NO FILES") : tr("INSTALL")}
        </button>
      </div>
    </article>
  );
}
