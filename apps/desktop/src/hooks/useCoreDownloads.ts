import * as React from "react";
import { tr } from "../lib/i18n.ts";
import type { Incoming } from "../lib/incoming.ts";
import { formatSize } from "../lib/util.ts";

export interface CoreJob {
  core: string;
  state: "downloading" | "verifying" | "installing" | "installed" | "failed";
  received: number;
  total: number;
  error?: string;
  paused?: boolean;
}

const active = (job: CoreJob) => job.state !== "installed" && job.state !== "failed";
const jobKey = (job: CoreJob) => `core:${job.core.toLowerCase()}`;
const name = (job: CoreJob) => tr("Core {core}", { core: job.core });

function status(job: CoreJob): string {
  if (job.paused) return tr("Paused");
  if (job.state === "verifying") return tr("Verifying…");
  if (job.state === "installing") return tr("Installing…");
  const percent = job.total > 0 ? Math.floor((job.received / job.total) * 100) : null;
  return percent === null ? tr("Downloading…") : tr("Downloading · {percent}%", { percent });
}

/**
 * Every core on its way in, however it was started (Browse's Cores tab, or a mod's Install core),
 * followed here so its card and row carry on wherever the player goes. A finished core's card stays
 * until the library has read it.
 */
export function useCoreDownloads(
  { root, load, say, reportError, onSettled }: {
    root: string | null;
    load: (root: string) => Promise<boolean>;
    say: (message: string) => void;
    reportError: (err: unknown) => void;
    /** It has landed, as this title, or ended without one. */
    onSettled: (key: string, titleKey: string | null) => void;
  },
) {
  const [shown, setShown] = React.useState<CoreJob[]>([]);
  const running = React.useRef(new Map<string, CoreJob>());
  const landing = React.useRef(new Set<string>());
  const latest = React.useRef({ root, load, say, reportError, onSettled });
  latest.current = { root, load, say, reportError, onSettled };

  const land = async (key: string, job: CoreJob) => {
    const { root, load, say, onSettled } = latest.current;
    if (root) await load(root);
    onSettled(key, `core:${job.core}`);
    landing.current.delete(key);
    running.current.delete(key);
    say(tr("Core {core} is installed.", { core: job.core }));
    setShown([...running.current.values()]);
  };

  const refresh = React.useCallback(async () => {
    const response = await fetch("/api/cores/jobs").catch(() => null);
    if (!response?.ok) return;
    const jobs = (await response.json()).jobs as CoreJob[];
    const byKey = new Map(jobs.map((job) => [jobKey(job), job]));
    for (const [key, last] of running.current) {
      if (landing.current.has(key)) continue;
      const job = byKey.get(key);
      if (job && active(job)) continue;
      if (job?.state === "installed") {
        landing.current.add(key);
        running.current.set(key, job);
        void land(key, job);
        continue;
      }
      running.current.delete(key);
      latest.current.onSettled(key, null);
      if (job?.state === "failed") {
        latest.current.reportError(
          new Error(tr("{title} did not install: {error}.", { title: name(job), error: job.error ?? tr("failed") })),
        );
      } else latest.current.say(tr("Download of {title} cancelled.", { title: name(last) }));
    }
    for (const job of jobs) if (active(job)) running.current.set(jobKey(job), job);
    setShown([...running.current.values()]);
  }, []);

  // Installs run in the server, so they outlive a reload: pick them up again.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const anyRunning = shown.length > 0;
  React.useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);

  const incoming: Incoming[] = shown.map((job) => ({
    kind: "download",
    key: jobKey(job),
    title: name(job),
    subtitle: tr("Download"),
    status: status(job),
    percent: job.state === "downloading" && job.total > 0 ? Math.floor((job.received / job.total) * 100) : null,
    detail: job.state === "downloading" && job.total > 0
      ? tr("{done} of {total}", { done: formatSize(job.received), total: formatSize(job.total) })
      : null,
    cancellable: job.state === "downloading",
    cancel: async () => {
      await fetch("/api/cores/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ core: job.core }),
      });
      await refresh();
    },
    paused: job.paused === true,
    setPaused: async (paused) => {
      await fetch("/api/cores/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ core: job.core, paused }),
      });
      await refresh();
    },
  }));

  return { incoming, jobs: shown, refresh };
}
