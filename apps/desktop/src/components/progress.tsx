import { tr } from "../lib/i18n.ts";
import { formatSize } from "../lib/util.ts";
import type { CopyJob } from "../types.ts";

export function setupPost(body: unknown) {
  return fetch("/api/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) }));
}

/** Follows a copy job (library-setup.ts) until it ends; `onTick` gets every state on the way. */
export async function followCopy(job: CopyJob, onTick: (job: CopyJob) => void): Promise<CopyJob> {
  let current = job;
  onTick(current);
  while (current.state === "copying" || current.state === "queued") {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const { body } = await setupPost({ action: "job", job: current.id });
    if (!body.job) break;
    current = body.job as CopyJob;
    onTick(current);
  }
  return current;
}

/** Linking takes as long for a large file as a small one, so a linking job is measured in files. */
function countsFiles(job: CopyJob): boolean {
  return (job.mode === "auto" || job.mode === "symlink" || job.mode === "hardlink") && (job.files ?? 0) > 0;
}

export function copyPercent(job: CopyJob): number {
  const [done, total] = countsFiles(job) ? [job.filesDone ?? 0, job.files ?? 0] : [job.copied, job.total];
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

/** "120 MB of 400 MB", or "300 of 1,200 files" while linking; null before the size is known. */
export function copyDetail(job: CopyJob): string | null {
  if (countsFiles(job)) {
    return tr("{done} of {total} files", {
      done: (job.filesDone ?? 0).toLocaleString(),
      total: (job.files ?? 0).toLocaleString(),
    });
  }
  return job.total > 0 ? tr("{done} of {total}", { done: formatSize(job.copied), total: formatSize(job.total) }) : null;
}

/** What a job does once its files are in (job.step), or null while it is placing them. */
export function copyStepLabel(job: CopyJob): string | null {
  if (job.state !== "copying" || !job.step) return null;
  return job.step.kind === "core"
    ? tr("Copying the {core} core from your install…", { core: job.step.core })
    : tr("Checking the new files…");
}

export function CopyProgress({ job, label }: { job: CopyJob; label?: string | undefined }) {
  const step = copyStepLabel(job);
  const percent = copyPercent(job);
  const detail = copyDetail(job);
  return (
    <div className="setup-progress">
      <div
        className="update-progress"
        role="progressbar"
        aria-valuenow={step ? undefined : percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* A step has no measure of its own: the bar moves to show it is working. */}
        {step ? <span className="indeterminate" /> : <span style={{ width: `${percent}%` }} />}
      </div>
      <span className="muted small">
        {job.state === "failed" ? job.error : step ??
          `${label ?? (job.state === "done" ? tr("Copied") : tr("Copying"))}${detail ? ` — ${detail}` : ""}`}
      </span>
    </div>
  );
}
