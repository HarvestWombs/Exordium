import { formatDate, formatNumber, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { useTranslation } from "../../hooks/useTranslation.tsx";
import { JobResult } from "./JobResult.tsx";
import { ShotGallery } from "./ShotGallery.tsx";
import {
  ACTIVE,
  formatBytes,
  INSTALLER_FILE,
  jobLabel,
  jobProgress,
  openLink,
  smallerModDbImage,
} from "./browse-util.ts";
import type { Job, ModDbDetails, ModDbItem, Shot } from "./types.ts";

/**
 * A ModDB entry, laid out as an archive.org card. The listing gives a title, a blurb and a picture;
 * the entry's own page (read once the card nears the screen) adds the full description, who made
 * it, its downloads, screenshots and, for a mod, its files to choose from.
 */
export function ModDbCard(
  { item, labels, installed, expanded, onExpand, jobs, root, onInstall, onInstalled, onOpen, onKeyword }: {
    item: ModDbItem;
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
  },
) {
  const ref = React.useRef<HTMLElement>(null);
  const [details, setDetails] = React.useState<ModDbDetails | null>(null);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState("");

  React.useEffect(() => {
    const node = ref.current;
    if (!node || details) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const response = await fetch(`/api/browse/moddb-item?page=${encodeURIComponent(item.page)}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return setDetailsError(body.error ?? tr("Could not read this page."));
        setDetails(body);
        setFile(body.files?.[0]?.page ?? "");
        for (const s of body.screenshots as Shot[]) new Image().src = s.full;
      })();
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.page, details]);

  const job = jobs[0];
  const progress = job ? jobProgress(job) : null;
  const running = job ? ACTIVE.includes(job.state) : false;
  const description = details?.description || item.description;
  const translation = useTranslation(description);
  const shots = details?.screenshots ?? [];
  const isMod = item.kind === "mod";
  const chosen = isMod ? details?.files.find((f) => f.page === file) ?? null : null;
  const size = isMod ? chosen?.size ?? null : details?.size ?? null;
  const installer = !isMod && INSTALLER_FILE.test(details?.filename ?? "");
  const target = isMod ? chosen?.page ?? item.installPage : item.installPage || item.page;

  return (
    <article ref={ref} className="mod-card">
      <button type="button" className="mod-cover" title={tr("Open its ModDB page")} onClick={() => openLink(item.page)}>
        <img src={shots[0]?.full ?? item.cover} alt="" loading="lazy" onError={smallerModDbImage} />
        {installed && <span className="ribbon">{tr("IN LIBRARY")}</span>}
      </button>

      <div className="mod-info">
        <h2 className="mod-title">{item.title}</h2>
        <p className={expanded ? "mod-description open" : "mod-description"}>
          {translation.text || (details ? tr("The author gave no description.") : "…")}
        </p>
        <div className="mod-under">
          {description.length > 280 && (
            <button type="button" className="link-button" onClick={onExpand}>
              {expanded ? tr("Less") : tr("More")}
            </button>
          )}
          {translation.button}
          {details?.links.map((link) => (
            <button
              type="button"
              key={link.url}
              className="link-button"
              title={link.url}
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
                <dd>{details ? details.files.length : "—"}</dd>
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
        <button type="button" className="link-button" onClick={() => openLink(item.page)}>{tr("Page ↗")}</button>
        <div className="grow" />
        {detailsError && <span className="bad-text small">{detailsError}</span>}
        {job && <JobResult job={job} onInstalled={onInstalled} onOpen={(what) => onOpen(what, job)} />}
        {running && progress !== null && (
          <span className="progress">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
        {isMod && details && details.files.length > 1 && !running && (
          <select
            value={file}
            onChange={(e) => setFile(e.currentTarget.value)}
            aria-label={tr("File to install")}
          >
            {details.files.map((f) => (
              <option key={f.page} value={f.page}>
                {f.name}
                {f.size ? ` (${formatBytes(f.size)})` : ""}
              </option>
            ))}
          </select>
        )}
        {size !== null && <span className="mod-size">{formatBytes(size)}</span>}
        {installer
          ? (
            <button
              type="button"
              className="download"
              title={tr("An installer: Exordium never runs one for you. Open its page and install it yourself.")}
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
                (isMod && !chosen && details.files.length > 0)}
              title={root ? undefined : tr("Choose the Diablo II install first")}
              onClick={() => onInstall(target)}
            >
              {job ? jobLabel(job) : tr("INSTALL")}
            </button>
          )}
      </div>
    </article>
  );
}
