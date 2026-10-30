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

export function CopyProgress({ job, label }: { job: CopyJob; label?: string | undefined }) {
  const percent = job.total > 0 ? Math.min(100, Math.round((job.copied / job.total) * 100)) : 0;
  return (
    <div className="setup-progress">
      <div className="update-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="muted small">
        {job.state === "failed"
          ? job.error
          : `${label ?? (job.state === "done" ? tr("Copied") : tr("Copying"))}${
            job.total > 0
              ? ` — ${tr("{done} of {total}", { done: formatSize(job.copied), total: formatSize(job.total) })}`
              : ""
          }`}
      </span>
    </div>
  );
}
