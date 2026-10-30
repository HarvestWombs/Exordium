import { formatTime, tr } from "../../lib/i18n.ts";
import type { Incoming } from "../../lib/incoming.ts";
import { JobResult } from "./JobResult.tsx";
import { ACTIVE, baseName, formatBytes, formatDuration, formatRate, jobLabel, jobProgress } from "./browse-util.ts";
import type { Job, Throughput } from "./types.ts";

/**
 * The downloads page, after Steam's: a graph of network and disk throughput over the last minutes,
 * the numbers beside it, the job running now, then everything finished this session.
 */
export function Downloads(
  { jobs, cores, rates, root, onInstall, onInstalled, onOpen }: {
    jobs: Job[];
    /** Cores on their way in, which are not jobs of this list. */
    cores: Incoming[];
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
  const inProgress = active.length + cores.length;
  const waiting = jobs.filter((job) => job.state === "downloaded" || job.state === "failed");
  const done = jobs.filter((job) => job.state === "installed").sort((a, b) =>
    (b.endedAt ?? "").localeCompare(a.endedAt ?? "")
  );

  return (
    <div className="downloads">
      <section className="dl-graph-card">
        <ThroughputGraph history={history} />
        <dl className="dl-stats">
          <div>
            <dt>
              <span className="swatch net" /> {tr("NETWORK")}
            </dt>
            <dd>{formatRate(current.net)}</dd>
            <span className="muted small">{tr("peak {rate}", { rate: formatRate(rates?.peakNet ?? 0) })}</span>
          </div>
          <div>
            <dt>{tr("TOTAL DOWNLOADED")}</dt>
            <dd>{formatBytes(rates?.totalNet ?? 0) || tr("0 KB")}</dd>
            <span className="muted small">{tr("this session")}</span>
          </div>
          <div>
            <dt>
              <span className="swatch disk" /> {tr("DISK USAGE")}
            </dt>
            <dd>{formatRate(current.disk)}</dd>
            <span className="muted small">{tr("peak {rate}", { rate: formatRate(rates?.peakDisk ?? 0) })}</span>
          </div>
          <div>
            <dt>{tr("TOTAL WRITTEN")}</dt>
            <dd>{formatBytes(rates?.totalDisk ?? 0) || tr("0 KB")}</dd>
            <span className="muted small">{tr("downloads and unpacking")}</span>
          </div>
        </dl>
      </section>

      <div className="dl-head">
        <h2 className="eyebrow">
          {inProgress ? tr("IN PROGRESS ({count})", { count: inProgress }) : tr("NOTHING IN PROGRESS")}
        </h2>
        <button type="button" className="link-button" onClick={() => onOpen({ what: "downloads" })}>
          {tr("Open downloads folder")}
        </button>
      </div>
      {active.map((job) => (
        <DownloadRow
          key={job.id + job.file}
          job={job}
          rate={job.state === "downloading" ? current.net : current.disk}
        />
      ))}

      {cores.map((core) => (
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

/** Two areas over time, network and disk, scaled to the larger peak; newest on the right. */
export function ThroughputGraph({ history }: { history: Throughput["history"] }) {
  const width = 600;
  const height = 120;
  const points = history.slice(-120);
  const max = Math.max(1, ...points.map((p) => Math.max(p.net, p.disk)));
  const x = (i: number) => width - (points.length - 1 - i) * (width / 119);
  const y = (value: number) => height - (value / max) * (height - 8);
  const area = (key: "net" | "disk") =>
    points.length < 2
      ? ""
      : `M${x(0)},${height} ${points.map((p, i) => `L${x(i)},${y(p[key])}`).join(" ")} L${
        x(points.length - 1)
      },${height} Z`;
  return (
    <svg
      className="dl-graph"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={tr("Throughput")}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={width}
          y1={height * f}
          y2={height * f}
          className="grid"
        />
      ))}
      <path d={area("disk")} className="disk" />
      <path d={area("net")} className="net" />
    </svg>
  );
}
