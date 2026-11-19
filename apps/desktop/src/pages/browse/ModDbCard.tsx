import { formatDate, formatNumber, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { useTranslation } from "../../hooks/useTranslation.tsx";
import { FileType } from "./FileType.tsx";
import { JobResult } from "./JobResult.tsx";
import { ShotGallery } from "./ShotGallery.tsx";
import { useCoverHeight } from "./useCoverHeight.ts";
import { ACTIVE, formatBytes, jobLabel, jobProgress, openLink, smallerModDbImage, uniqueLinks } from "./browse-util.ts";
import { useModDbEntry } from "./entry-data.ts";
import type { Job, ModDbItem } from "./types.ts";

/**
 * A ModDB entry, laid out as an archive.org card. The listing gives a title, a blurb and a picture;
 * the entry's own page (read once the card nears the screen) adds the full description, who made
 * it, its downloads, screenshots and, for a mod, its files to choose from.
 */
export function ModDbCard(
  {
    item,
    variants,
    labels,
    installed,
    expanded,
    onExpand,
    jobs,
    root,
    onInstall,
    onInstalled,
    onOpen,
    onKeyword,
    onOpenDetails,
  }: {
    item: ModDbItem;
    variants?: ModDbItem[];
    labels: Map<string, string>;
    installed: boolean;
    expanded: boolean;
    onExpand: () => void;
    jobs: Job[];
    root: string | null;
    onInstall: (url: string) => void;
    onInstalled: (name: string) => void;
    onOpen: (what: "file" | "unpacked", job: Job) => void;
    onKeyword: (keyword: string) => void;
    /** Opens the entry's details page. */
    onOpenDetails: () => void;
  },
) {
  const ref = React.useRef<HTMLElement>(null);
  const {
    details,
    error: detailsError,
    isMod,
    file,
    setFile,
    availableFiles,
    chosen,
    size,
    filename,
    installer,
    target,
  } = useModDbEntry(item, variants, { ref, margin: "300px" });
  const job = jobs[0];
  const progress = job ? jobProgress(job) : null;
  const running = job ? ACTIVE.includes(job.state) : false;
  const description = details?.description || item.description;
  const translation = useTranslation(description);
  const heights = useCoverHeight(expanded, translation.text);
  const shots = details?.screenshots ?? [];

  return (
    <article ref={ref} className="mod-card">
      <button
        ref={heights.cover}
        type="button"
        className="mod-cover"
        data-tooltip={tr("Open the details")}
        onClick={onOpenDetails}
      >
        <img src={shots[0]?.full ?? item.cover} alt="" loading="lazy" onError={smallerModDbImage} />
        {installed && <span className="ribbon">{tr("IN LIBRARY")}</span>}
      </button>

      <div className="mod-info">
        <h2 className="mod-title">
          <button type="button" className="mod-title-button" onClick={onOpenDetails}>{item.title}</button>
        </h2>
        <p ref={heights.description} className={expanded ? "mod-description open" : "mod-description"}>
          {translation.text || (details ? tr("The author gave no description.") : "…")}
        </p>
        <div className="mod-under">
          {description.length > 280 && (
            <button type="button" className="small-button" onClick={onExpand}>
              {expanded ? tr("Less") : tr("More")}
            </button>
          )}
          {translation.button}
          {uniqueLinks(details?.links ?? []).map((link) => (
            <button
              type="button"
              key={link.url}
              className="small-button"
              data-tooltip={link.url}
              onClick={() => openLink(link.url)}
            >
              {link.label} ↗
            </button>
          ))}
        </div>
        {item.keywords.length > 0 && (
          <div className="mod-tags">
            <span className="eyebrow">{tr("TAGS")}</span>
            {item.keywords.map((keyword) => (
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
          <dd>
            {(details?.addedAt ?? item.addedAt) ? formatDate(details?.addedAt ?? item.addedAt!) : "—"}
          </dd>
          <dt>{tr("BY")}</dt>
          <dd>{details?.creator ?? "—"}</dd>
          {details?.updatedAt
            ? (
              <>
                <dt>{tr("UPDATED")}</dt>
                <dd>{formatDate(details.updatedAt)}</dd>
              </>
            )
            : null}
          {isMod
            ? (
              <>
                <dt>{tr("FILES")}</dt>
                <dd>{details ? availableFiles.length : "—"}</dd>
              </>
            )
            : (
              <>
                <dt>{tr("DOWNLOADS")}</dt>
                <dd>{details?.downloads != null ? formatNumber(details.downloads) : "—"}</dd>
              </>
            )}
        </dl>
      </div>

      <ShotGallery shots={shots} empty={details ? tr("No screenshots") : detailsError ?? "…"} />

      <div className="mod-bar">
        <span className="source-badge">ModDB · {item.sourceLabel}</span>
        <button type="button" className="small-button" onClick={() => openLink(item.page)}>{tr("Page ↗")}</button>
        <div className="grow" />
        {detailsError && <span className="bad-text small">{detailsError}</span>}
        {job && <JobResult job={job} onInstalled={onInstalled} onOpen={(what) => onOpen(what, job)} />}
        {running && progress !== null && (
          <span className="progress">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
        {isMod && details && availableFiles.length > 1 && !running && (
          <select
            value={file}
            onChange={(e) => setFile(e.currentTarget.value)}
            aria-label={tr("File to install")}
          >
            {availableFiles.map((f) => (
              <option key={f.page} value={f.page}>
                {f.name}
                {f.size ? ` (${formatBytes(f.size)})` : ""}
              </option>
            ))}
          </select>
        )}
        <FileType name={filename} />
        {size !== null && <span className="mod-size">{formatBytes(size)}</span>}
        {installer
          ? (
            <button
              type="button"
              className="download"
              data-tooltip={tr(
                "An installer: Exordium never runs one for you. Open its page and install it yourself.",
              )}
              onClick={() => openLink(item.page)}
            >
              {tr("INSTALLER ↗")}
            </button>
          )
          : (
            <button
              type="button"
              className="download"
              disabled={!details || !root || running || job?.state === "installed" ||
                (isMod && !chosen && availableFiles.length > 0)}
              data-tooltip={root ? undefined : tr("Choose the Diablo II install first")}
              onClick={() => onInstall(target)}
            >
              {job ? jobLabel(job) : tr("INSTALL")}
            </button>
          )}
      </div>
    </article>
  );
}
