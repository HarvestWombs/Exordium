import { formatTime, tr } from "../../lib/i18n.ts";
import type * as React from "react";
import { jobKey } from "../../hooks/useDownloads.ts";
import type { Incoming } from "../../lib/incoming.ts";
import { PlayIcon } from "../../components/icons.tsx";
import { JobResult } from "./JobResult.tsx";
import {
  ACTIVE,
  baseName,
  formatBytes,
  formatClock,
  formatDuration,
  formatRate,
  jobLabel,
  jobProgress,
} from "./browse-util.ts";
import type { Job, Throughput } from "./types.ts";

/** What the header shows for the download in front. */
interface Hero {
  key: string;
  title: string;
  cover: string | null;
  item: Incoming | undefined;
  data: { done: string; total: string; fraction: number | null };
  files: { label: string; value: string; fraction: number | null };
  remaining: string | null;
}

function heroOfJob(job: Job, item: Incoming | undefined, cover: string | null, rate: number): Hero {
  const downloading = job.state === "downloading";
  const unpacked = job.unpackedSize ? Math.min(1, job.extracted / job.unpackedSize) : null;
  return {
    key: jobKey(job),
    title: job.title,
    cover,
    item,
    data: {
      done: formatBytes(downloading ? job.received : job.total),
      total: job.total > 0 ? formatBytes(job.total) : "",
      fraction: !downloading ? 1 : job.total ? job.received / job.total : null,
    },
    files: job.state === "installing" ? { label: tr("Installing files"), value: tr("Installing…"), fraction: 1 } : {
      label: tr("Unpacking files"),
      value: downloading ? tr("Waiting") : unpacked === null ? "" : `${Math.floor(unpacked * 100)}%`,
      fraction: downloading ? 0 : unpacked,
    },
    remaining: downloading && !job.paused && job.total > 0 && rate > 0
      ? tr("Estimated {time} remaining", { time: formatClock((job.total - job.received) / rate) })
      : null,
  };
}

function heroOfCore(item: Incoming): Hero {
  return {
    key: item.key,
    title: item.title,
    cover: null,
    item,
    data: {
      done: item.detail ?? "",
      total: "",
      fraction: item.percent === null ? 1 : item.percent / 100,
    },
    files: {
      label: tr("Installing files"),
      value: item.percent === null ? item.status : tr("Waiting"),
      fraction: item.percent === null ? null : 0,
    },
    remaining: null,
  };
}

function Meter(
  { label, value, fraction, tone }: {
    label: string;
    value: React.ReactNode;
    fraction: number | null;
    tone: "net" | "disk";
  },
) {
  return (
    <div className="dl-meter">
      <div className="dl-meter-head">
        <span>{label}</span>
        <span className="dl-meter-value">{value}</span>
      </div>
      <span className={`progress wide ${tone}`}>
        <span
          className={fraction === null ? "indeterminate" : undefined}
          style={{ width: `${Math.round((fraction ?? 1) * 100)}%` }}
        />
      </span>
    </div>
  );
}

const BarsIcon = () => (
  <svg className="dl-stat-icon net" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M1 12V7h2v5zM5 12V1h2v11zM9 12V4h2v8z" />
  </svg>
);

const LineIcon = () => (
  <svg className="dl-stat-icon disk" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M0 5h12v2H0z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="dl-size-icon" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M6 1h2v6h3L7 11 3 7h3zM1 12h12v1.5H1z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 14 14" aria-hidden="true" width="14" height="14" fill="currentColor">
    <path d="M3 2h3v10H3zM8 2h3v10H8z" />
  </svg>
);

/**
 * The downloads page, after Steam's: a header with the download in front, its art, a live graph, the
 * network and disk numbers and a bar each for downloading and installing, then the rest below it.
 */
export function Downloads(
  { jobs, downloads, coverOf, rates, root, onCancel, onInstall, onInstalled, onOpen }: {
    jobs: Job[];
    /** What is on its way in, as the library shows it; cores are not jobs of this list. */
    downloads: Incoming[];
    coverOf: (job: Job) => string | null;
    onCancel: (item: Incoming) => void;
    rates: Throughput | null;
    root: string | null;
    onInstall: (job: Job) => void;
    onInstalled: (name: string) => void;
    onOpen: (body: unknown) => void;
  },
) {
  const history = rates?.history ?? [];
  const current = history[history.length - 1] ?? { net: 0, disk: 0 };
  const active = jobs.filter((job) => ACTIVE.includes(job.state));
  const cores = downloads.filter((item) => !active.some((job) => jobKey(job) === item.key));
  const first = active[0];
  const hero = first
    ? heroOfJob(first, downloads.find((item) => item.key === jobKey(first)), coverOf(first), current.net)
    : cores[0]
    ? heroOfCore(cores[0])
    : null;
  const others = active.filter((job) => jobKey(job) !== hero?.key);
  const otherCores = cores.filter((item) => item.key !== hero?.key);
  const below = others.length + otherCores.length;
  const waiting = jobs.filter((job) => job.state === "downloaded" || job.state === "failed");
  const done = jobs.filter((job) => job.state === "installed").sort((a, b) =>
    (b.endedAt ?? "").localeCompare(a.endedAt ?? "")
  );

  return (
    <div className="downloads">
      <section className="dl-hero">
        <div className="dl-hero-art">
          {hero?.cover && <img src={hero.cover} alt="" />}
          <div className="dl-hero-title">
            <span className="eyebrow accent">{hero ? tr("DOWNLOADING") : tr("DOWNLOADS")}</span>
            <h2>{hero?.title ?? tr("NOTHING IN PROGRESS")}</h2>
          </div>
        </div>
        <ThroughputGraph history={history} />
        <div className="dl-hero-status">
          <dl className="dl-stats">
            <div>
              <dt>
                <BarsIcon /> {tr("NETWORK")}
              </dt>
              <dd>{formatRate(current.net)}</dd>
            </div>
            <div>
              <dt>
                <BarsIcon /> {tr("PEAK")}
              </dt>
              <dd>{formatRate(rates?.peakNet ?? 0)}</dd>
            </div>
            <div>
              <dt>
                <LineIcon /> {tr("DISK USAGE")}
              </dt>
              <dd>{formatRate(current.disk)}</dd>
            </div>
          </dl>
          {hero && (
            <>
              <Meter
                label={tr("Downloading data")}
                value={
                  <>
                    <strong>{hero.data.done}</strong>
                    {hero.data.total && <span>/ {hero.data.total}</span>}
                    <DownloadIcon />
                  </>
                }
                fraction={hero.data.fraction}
                tone="net"
              />
              <Meter label={hero.files.label} value={hero.files.value} fraction={hero.files.fraction} tone="disk" />
              <div className="dl-hero-foot">
                <span className="muted small">{hero.item?.paused ? tr("Paused") : hero.remaining}</span>
                <div className="dl-hero-actions">
                  <button
                    type="button"
                    className="square"
                    aria-label={tr("Cancel download")}
                    data-tooltip={tr("Cancel download")}
                    disabled={!hero.item?.cancellable}
                    onClick={() => hero.item && onCancel(hero.item)}
                  >
                    ×
                  </button>
                  {hero.item?.setPaused && (
                    <button
                      type="button"
                      className="square dl-pause"
                      aria-label={hero.item.paused ? tr("Resume download") : tr("Pause download")}
                      data-tooltip={hero.item.paused ? tr("Resume download") : tr("Pause download")}
                      disabled={!hero.item.cancellable}
                      onClick={() => void hero.item?.setPaused?.(!hero.item.paused)}
                    >
                      {hero.item.paused ? <PlayIcon /> : <PauseIcon />}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="dl-head">
        <h2 className="eyebrow">
          {below > 0 ? tr("IN PROGRESS ({count})", { count: below }) : null}
        </h2>
        <button type="button" className="small-button" onClick={() => onOpen({ what: "downloads" })}>
          {tr("Open downloads folder")}
        </button>
      </div>
      {others.map((job) => (
        <DownloadRow
          key={job.id + job.file}
          job={job}
          rate={job.state === "downloading" ? current.net : current.disk}
        />
      ))}

      {otherCores.map((core) => (
        <div className="dl-row active" key={core.key}>
          <div className="dl-main">
            <span className="dl-title">{core.title}</span>
            <span className="muted small">{core.detail ? `${core.status} — ${core.detail}` : core.status}</span>
            <span className="progress wide">
              <span
                className={core.percent === null ? "indeterminate" : undefined}
                style={{ width: `${core.percent ?? 100}%` }}
              />
            </span>
          </div>
        </div>
      ))}

      {waiting.length > 0 && (
        <>
          <h2 className="eyebrow dl-section">{tr("WAITING")}</h2>
          {waiting.map((job) => (
            <div className="dl-row" key={job.id + job.file}>
              <div className="dl-main">
                <span className="dl-title">{job.title}</span>
                <span className="muted small">
                  {baseName(job.file)} · {formatBytes(job.total)} ·{" "}
                  {job.state === "failed" ? job.error : tr("downloaded, not installed")}
                </span>
              </div>
              <button type="button" className="download" disabled={!root} onClick={() => onInstall(job)}>
                {job.state === "failed" && !job.path ? tr("RETRY") : tr("INSTALL")}
              </button>
            </div>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <h2 className="eyebrow dl-section">{tr("COMPLETED")}</h2>
          {done.map((job) => (
            <div className="dl-row" key={job.id + job.file}>
              <div className="dl-main">
                <span className="dl-title">{job.title}</span>
                <span className="muted small">
                  {tr("{size} downloaded", { size: formatBytes(job.total) })}
                  {job.unpackedSize ? tr(" · {size} unpacked", { size: formatBytes(job.unpackedSize) }) : ""}
                  {job.endedAt ? ` · ${formatTime(job.endedAt)}` : ""}
                </span>
              </div>
              <JobResult
                job={job}
                onInstalled={onInstalled}
                onOpen={(what) => onOpen({ what, id: job.id, file: job.file })}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function DownloadRow({ job, rate }: { job: Job; rate: number }) {
  const progress = jobProgress(job);
  const phase = job.state === "downloading"
    ? `${formatBytes(job.received)} of ${formatBytes(job.total)}`
    : job.state === "extracting"
    ? job.unpackedSize
      ? tr("{done} of {total} unpacked", { done: formatBytes(job.extracted), total: formatBytes(job.unpackedSize) })
      : tr("Unpacking…")
    : tr("Moving {installing} into the library", { installing: job.installing ?? tr("the mod") });
  const left = job.state === "downloading" && rate > 0 ? (job.total - job.received) / rate : null;
  return (
    <div className="dl-row active">
      <div className="dl-main">
        <span className="dl-title">{job.title}</span>
        <span className="muted small">
          {jobLabel(job)} · {phase}
          {left !== null ? ` · ${formatDuration(left)} left` : ""}
        </span>
        <span className="progress wide">
          <span
            className={progress === null ? "indeterminate" : undefined}
            style={{ width: `${Math.round((progress ?? 1) * 100)}%` }}
          />
        </span>
      </div>
      <span className="dl-rate">{formatRate(rate)}</span>
    </div>
  );
}

/** The last minutes as Steam draws them: network as bars, disk as a line, scaled to the larger peak. */
export function ThroughputGraph({ history }: { history: Throughput["history"] }) {
  const width = 300;
  const height = 120;
  const slots = 60;
  const points = history.slice(-slots);
  const max = Math.max(1, ...points.map((p) => Math.max(p.net, p.disk)));
  const step = width / slots;
  const x = (i: number) => width - (points.length - i) * step;
  const y = (value: number) => height - (value / max) * (height - 8);
  return (
    <svg
      className="dl-graph"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={tr("Throughput")}
    >
      {points.map((p, i) => (
        <rect key={i} className="net" x={x(i)} y={y(p.net)} width={step - 1} height={height - y(p.net)} />
      ))}
      {points.length > 1 && (
        <polyline
          className="disk"
          points={points.map((p, i) => `${x(i) + step / 2},${y(p.disk)}`).join(" ")}
        />
      )}
    </svg>
  );
}
