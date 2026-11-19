import { formatDate, formatNumber, tr } from "../../lib/i18n.ts";
import * as React from "react";
import type { ReactNode } from "react";
import { Lightbox, VideoPlayer } from "../../components/Lightbox.tsx";
import { useTranslation } from "../../hooks/useTranslation.tsx";
import { FileType } from "./FileType.tsx";
import { InspectionFacts } from "./InspectionFacts.tsx";
import { JobResult } from "./JobResult.tsx";
import { PlayBadge } from "./ShotGallery.tsx";
import {
  ACTIVE,
  baseName,
  formatBytes,
  jobLabel,
  jobProgress,
  openLink,
  smallerModDbImage,
  uniqueLinks,
} from "./browse-util.ts";
import { useArchiveEntry, useModDbEntry } from "./entry-data.ts";
import type { CatalogEntry, Details, Inspection, Item, Job, ModDbItem, Shot } from "./types.ts";

/** What the page shows, the same for either source. */
interface DetailsView {
  title: string;
  source: string;
  /** The entry's own page on its source. */
  page: { label: string; url: string };
  cover: string;
  shots: Shot[];
  loading: boolean;
  error: string | null;
  description: string;
  descriptionSource: string | null;
  facts: { label: string; value: ReactNode }[];
  inspection: Inspection | null;
  keywords: string[];
  links: { label: string; url: string }[];
  files: { name: string; size: number | null; note?: string | null }[];
  install: ReactNode;
  installed: boolean;
}

/**
 * A mod's own page, opened from its card: the media large with every screenshot and video, the facts
 * and tags beside it, then installing, the whole description, its files and what its archive says.
 * The list stays where it was behind it; Back returns to it.
 */
export function ModDetails(
  props: {
    entry: CatalogEntry;
    cached: Details | null;
    labels: Map<string, string>;
    keywords: string[];
    installed: boolean;
    /** The archive.org item's downloads; for a ModDB entry, its link download. */
    jobs: Job[];
    root: string | null;
    onBack: () => void;
    onDetails: (details: Details) => void;
    onInstallArchive: (item: Item, file: string, fromDisk: boolean) => void;
    onInstallUrl: (url: string, title: string) => void;
    onInstalled: (name: string) => void;
    onOpenArchive: (what: "page" | "file" | "unpacked", file?: string) => void;
    onOpenJob: (what: "file" | "unpacked", job: Job) => void;
    onKeyword: (keyword: string) => void;
  },
) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".lightbox")) props.onBack();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [props.onBack]);
  return props.entry.archive
    ? <ArchiveDetails {...props} item={props.entry.archive} modDb={props.entry.moddb} />
    : <ModDbEntryDetails {...props} item={props.entry.moddb!} variants={props.entry.moddbVariants} />;
}

function ArchiveDetails(
  {
    item,
    modDb,
    cached,
    labels,
    keywords,
    installed,
    jobs,
    root,
    onBack,
    onDetails,
    onInstallArchive,
    onInstalled,
    onOpenArchive,
    onKeyword,
  }:
    & Parameters<typeof ModDetails>[0]
    & { item: Item; modDb: ModDbItem | null },
) {
  const { details, error, loading, file, setFile } = useArchiveEntry(item, cached, null, onDetails);
  const job = jobs.find((j) => baseName(j.file) === baseName(file)) ?? jobs[0];
  const progress = job ? jobProgress(job) : null;
  const running = job ? ACTIVE.includes(job.state) : false;
  const shots = details?.screenshots ?? [];
  const view: DetailsView = {
    title: item.title,
    source: modDb ? "Internet Archive + ModDB" : "Internet Archive",
    page: { label: tr("archive.org page"), url: item.page },
    cover: shots.find((shot) => !shot.video)?.full ?? item.cover,
    shots,
    loading,
    error,
    description: details?.description ?? "",
    descriptionSource: details?.descriptionSource ?? null,
    facts: [
      { label: tr("ADDED"), value: item.addedAt ? formatDate(item.addedAt) : "—" },
      { label: tr("BY"), value: item.creator ?? "—" },
      { label: tr("DOWNLOADS"), value: formatNumber(item.downloads) },
      { label: tr("SIZE"), value: formatBytes(item.size) },
    ],
    inspection: details?.inspection ?? null,
    keywords,
    links: [...(modDb ? [{ label: "ModDB", url: modDb.page }] : []), ...(details?.links ?? [])],
    files: (details?.archives ?? []).map((archive) => ({ name: archive.name, size: archive.size })),
    installed,
    install: (
      <>
        <JobResult job={job} onInstalled={onInstalled} onOpen={(what) => onOpenArchive(what, job?.file)} />
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
        <FileType name={file} />
        <span className="mod-size">
          {formatBytes(details?.archives.find((a) => a.name === file)?.size ?? item.size)}
        </span>
        <button
          type="button"
          className="download"
          disabled={!details || !file || !root || running || job?.state === "installed"}
          data-tooltip={root ? undefined : tr("Choose the Diablo II install first")}
          onClick={() => onInstallArchive(item, file, job?.state === "downloaded")}
        >
          {job ? jobLabel(job) : details && !file ? tr("NO FILES") : tr("INSTALL")}
        </button>
      </>
    ),
  };
  return <DetailsLayout view={view} labels={labels} onBack={onBack} onKeyword={onKeyword} />;
}

function ModDbEntryDetails(
  { item, variants, labels, installed, jobs, root, onBack, onInstallUrl, onInstalled, onOpenJob, onKeyword }:
    & Parameters<typeof ModDetails>[0]
    & { item: ModDbItem; variants: ModDbItem[] },
) {
  const entry = useModDbEntry(item, variants, null);
  const { details, isMod, availableFiles, chosen, file, setFile, size, filename, installer, target } = entry;
  const job = jobs[0];
  const progress = job ? jobProgress(job) : null;
  const running = job ? ACTIVE.includes(job.state) : false;
  const shots = details?.screenshots ?? [];
  const view: DetailsView = {
    title: item.title,
    source: `ModDB · ${item.sourceLabel}`,
    page: { label: tr("ModDB page"), url: item.page },
    cover: item.cover,
    shots,
    loading: entry.loading,
    error: entry.error,
    description: details?.description || item.description,
    descriptionSource: null,
    facts: [
      {
        label: tr("ADDED"),
        value: (details?.addedAt ?? item.addedAt) ? formatDate(details?.addedAt ?? item.addedAt!) : "—",
      },
      ...(details?.updatedAt ? [{ label: tr("UPDATED"), value: formatDate(details.updatedAt) }] : []),
      { label: tr("BY"), value: details?.creator ?? "—" },
      isMod
        ? { label: tr("FILES"), value: details ? String(availableFiles.length) : "—" }
        : { label: tr("DOWNLOADS"), value: details?.downloads != null ? formatNumber(details.downloads) : "—" },
    ],
    inspection: null,
    keywords: item.keywords,
    links: details?.links ?? [],
    files: isMod
      ? availableFiles.map((f) => ({ name: f.name, size: f.size, note: f.category }))
      : details
      ? [{ name: details.filename ?? item.title, size: details.size }]
      : [],
    installed,
    install: (
      <>
        {job && <JobResult job={job} onInstalled={onInstalled} onOpen={(what) => onOpenJob(what, job)} />}
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
              data-tooltip={tr("An installer: Exordium never runs one for you. Open its page and install it yourself.")}
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
              onClick={() => onInstallUrl(target, item.title)}
            >
              {job ? jobLabel(job) : tr("INSTALL")}
            </button>
          )}
      </>
    ),
  };
  return <DetailsLayout view={view} labels={labels} onBack={onBack} onKeyword={onKeyword} />;
}

function DetailsLayout(
  { view, labels, onBack, onKeyword }: {
    view: DetailsView;
    labels: Map<string, string>;
    onBack: () => void;
    onKeyword: (keyword: string) => void;
  },
) {
  const translation = useTranslation(view.description);
  const top = React.useRef<HTMLDivElement>(null);
  // In braces: scrollTo returns a Promise in Chromium now, and an effect may return only its clean-up.
  React.useEffect(() => {
    top.current?.scrollTo({ top: 0 });
  }, [view.title]);
  return (
    <div className="mod-details" ref={top}>
      <div className="mod-details-inner">
        <nav className="mod-details-crumbs">
          <button type="button" className="small-button" onClick={onBack}>‹ {tr("Back to Browse")}</button>
          <span className="muted small">{view.source}</span>
        </nav>
        <h1 className="mod-details-title">{view.title}</h1>

        <div className="mod-details-hero">
          <DetailsMedia shots={view.shots} loading={view.loading} />
          <aside className="mod-details-side">
            <img className="mod-details-capsule" src={view.cover} alt="" onError={smallerModDbImage} />
            <p className="mod-details-summary">
              {view.loading
                ? (
                  <>
                    <span className="skeleton skeleton-line" aria-hidden="true" />
                    <span className="skeleton skeleton-line" aria-hidden="true" />
                    <span className="skeleton skeleton-line w-70" aria-hidden="true" />
                  </>
                )
                : view.error ?? (translation.text || tr("The uploader gave no description."))}
            </p>
            <dl className="mod-details-facts">
              {view.facts.map((fact) => (
                <React.Fragment key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </React.Fragment>
              ))}
            </dl>
            {view.keywords.length > 0 && (
              <div className="mod-details-tags">
                <span className="muted small">{tr("Tags for this mod:")}</span>
                <div>
                  {view.keywords.map((keyword) => (
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
              </div>
            )}
          </aside>
        </div>

        <div className="mod-details-actions">
          <button type="button" className="small-button" onClick={() => openLink(view.page.url)}>
            {view.page.label} ↗
          </button>
          {uniqueLinks(view.links).filter((link) => link.url !== view.page.url).map((link) => (
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

        {view.installed && (
          <div className="mod-details-owned">
            <span className="ribbon">{tr("IN LIBRARY")}</span>
            {tr("{title} is already in your library.", { title: view.title })}
          </div>
        )}

        <section className="mod-details-install">
          <h2>{tr("Install {title}", { title: view.title })}</h2>
          <div className="mod-details-install-bar">{view.install}</div>
        </section>

        <div className="mod-details-body">
          <div className="mod-details-main">
            <section>
              <h3 className="eyebrow">{tr("ABOUT THIS MOD")}</h3>
              <div className="mod-details-description">
                {translation.text || (view.loading ? "…" : tr("The uploader gave no description."))}
              </div>
              <div className="mod-under">
                {view.descriptionSource && view.description && (
                  <span className="muted small">
                    {tr("From {descriptionSource}", { descriptionSource: view.descriptionSource })}
                  </span>
                )}
                {translation.button}
              </div>
            </section>
            {view.files.length > 0 && (
              <section>
                <h3 className="eyebrow">{tr("FILES")}</h3>
                <ul className="mod-details-files">
                  {view.files.map((f) => (
                    <li key={f.name}>
                      <FileType name={f.name} />
                      <span className="mod-details-file-name">{f.name}</span>
                      {f.note && <span className="muted small">{f.note}</span>}
                      <span className="muted">{f.size !== null ? formatBytes(f.size) : ""}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {view.inspection && (
            <aside className="mod-details-panel">
              <h3 className="eyebrow">{tr("FROM ITS ARCHIVE")}</h3>
              <dl className="mod-facts">
                <InspectionFacts inspection={view.inspection} />
              </dl>
              <p className="muted small">
                {tr("Tags, game versions and other details are inferred from each upload and may be wrong.")}
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

/** The large viewer: a picture opens full size, a video plays in place; every entry in the strip. */
function DetailsMedia({ shots, loading }: { shots: Shot[]; loading: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [gallery, setGallery] = React.useState(false);
  const strip = React.useRef<HTMLDivElement>(null);
  const shot = shots[index] ?? shots[0];
  const choose = (i: number) => {
    setIndex(i);
    setPlaying(false);
  };
  React.useEffect(() => {
    strip.current?.querySelector(".mod-details-thumb.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);
  const scroll = (direction: number) =>
    strip.current?.scrollBy({ left: direction * strip.current.clientWidth * 0.8, behavior: "smooth" });

  if (loading) {
    return (
      <div className="mod-details-media">
        <span className="skeleton mod-details-stage" aria-hidden="true" />
      </div>
    );
  }
  if (!shot) {
    return (
      <div className="mod-details-media">
        <div className="mod-details-stage shot-empty muted small">{tr("No screenshots")}</div>
      </div>
    );
  }
  return (
    <div className="mod-details-media">
      {shot.video && playing ? <VideoPlayer video={shot.video} className="mod-details-stage" /> : (
        <button
          type="button"
          className={shot.video ? "mod-details-stage video" : "mod-details-stage"}
          data-tooltip={shot.video ? tr("Play the video") : tr("Open the gallery")}
          onClick={() => (shot.video ? setPlaying(true) : setGallery(true))}
        >
          <img src={shot.full} alt="" onError={smallerModDbImage} />
          {shot.video && <PlayBadge />}
        </button>
      )}
      <div className="mod-details-strip-row">
        <button type="button" className="uploads-arrow" aria-label={tr("Previous")} onClick={() => scroll(-1)}>
          ‹
        </button>
        <div className="mod-details-strip" ref={strip}>
          {shots.map((s, i) => (
            <button
              type="button"
              key={`${s.thumb}-${i}`}
              className={i === index ? "mod-details-thumb shot on" : "mod-details-thumb shot"}
              onClick={() => choose(i)}
            >
              <img src={s.thumb} alt="" loading="lazy" onError={smallerModDbImage} />
              {s.video && <PlayBadge />}
            </button>
          ))}
        </div>
        <button type="button" className="uploads-arrow" aria-label={tr("Next")} onClick={() => scroll(1)}>›</button>
      </div>
      {gallery && (
        <Lightbox
          images={shots.map((s) => ({ src: s.full, thumb: s.thumb, ...(s.video ? { video: s.video } : {}) }))}
          start={index}
          onClose={() => setGallery(false)}
        />
      )}
    </div>
  );
}
