import * as React from "react";
import { plural, tr } from "../lib/i18n.ts";
import type { Incoming } from "../lib/incoming.ts";
import { formatSize } from "../lib/util.ts";
import { ACTIVE, jobProgress, post } from "../pages/browse/browse-util.ts";
import type { Job } from "../pages/browse/types.ts";

/** A download's identity while it runs: a link's file name is only known once it has started. */
export const jobKey = (job: Job) => `download:${job.source === "url" ? job.id : `${job.id}/${job.file}`}`;

function status(job: Job): string {
  if (job.paused) return tr("Paused");
  const progress = jobProgress(job);
  const percent = progress === null ? null : Math.floor(progress * 100);
  if (job.state === "installing") return tr("Installing…");
  if (job.state === "extracting") {
    return percent === null ? tr("Unpacking…") : tr("Unpacking · {percent}%", { percent });
  }
  return percent === null ? tr("Downloading…") : tr("Downloading · {percent}%", { percent });
}

function detail(job: Job): string | null {
  if (job.state === "downloading" && job.total > 0) {
    return tr("{done} of {total}", { done: formatSize(job.received), total: formatSize(job.total) });
  }
  if (job.state === "extracting" && job.unpackedSize > 0) {
    return tr("{done} of {total}", { done: formatSize(job.extracted), total: formatSize(job.unpackedSize) });
  }
  return null;
}

/**
 * Every download from Browse, followed here rather than in Browse so its card and row, and the work
 * after it (the mod's exordium.mod.json, reading the library again), carry on when the player leaves
 * Browse. A finished download's card stays until the mod's own has replaced it.
 */
export function useDownloads(
  { root, load, say, reportError, onSettled }: {
    root: string | null;
    load: (root: string) => Promise<boolean>;
    say: (message: string) => void;
    reportError: (err: unknown) => void;
    /** It has landed, as this title, or ended without one. */
    onSettled: (key: string, titleKey: string | null) => void;
  },
) {
  const [shown, setShown] = React.useState<Job[]>([]);
  // Every job seen running and not yet settled, with the last that was heard of it.
  const running = React.useRef(new Map<string, Job>());
  const landing = React.useRef(new Set<string>());
  // Downloads whose exordium.mod.json is drafted from their D2SE_SETUP.ini once they are in.
  const drafts = React.useRef(new Set<string>());
  const latest = React.useRef({ root, load, say, reportError, onSettled });
  latest.current = { root, load, say, reportError, onSettled };

  const land = async (key: string, job: Job) => {
    const { root, load, say, onSettled } = latest.current;
    const folders = job.result?.installed.map((mod) => mod.name) ?? [];
    const draft = `${job.id}/${job.file}`;
    if (root && folders.length > 0 && drafts.current.delete(draft)) {
      await post("/api/import-d2se-metadata", { root, folders }).catch(() => {});
    }
    if (root) await load(root);
    onSettled(key, folders[0] ? `mod:${folders[0]}` : null);
    landing.current.delete(key);
    running.current.delete(key);
    say(
      folders.length > 0
        ? plural(folders.length, "Installed {title}.", "Installed {count} mods from {title}.", { title: job.title })
        : tr("{title} was downloaded, but no mod was installed. Browse, Downloads says why.", { title: job.title }),
    );
    setShown([...running.current.values()]);
  };

  const refresh = React.useCallback(async () => {
    const response = await fetch("/api/browse/downloads").catch(() => null);
    if (!response?.ok) return;
    const jobs = (await response.json()).jobs as Job[];
    const byKey = new Map(jobs.map((job) => [jobKey(job), job]));
    for (const [key, last] of running.current) {
      if (landing.current.has(key)) continue;
      const job = byKey.get(key);
      if (job && ACTIVE.includes(job.state)) continue;
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
          new Error(tr("{title} did not install: {error}.", { title: job.title, error: job.error ?? tr("failed") })),
        );
      } else latest.current.say(tr("Download of {title} cancelled.", { title: last.title }));
    }
    for (const job of jobs) if (ACTIVE.includes(job.state)) running.current.set(jobKey(job), job);
    setShown([...running.current.values()]);
  }, []);

  // Downloads run in the server, so they outlive a reload: pick them up again.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const anyRunning = shown.length > 0;
  React.useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);

  const expectDraft = React.useCallback((key: string) => void drafts.current.add(key), []);

  const incoming: Incoming[] = shown.map((job) => {
    const progress = jobProgress(job);
    return {
      kind: "download",
      key: jobKey(job),
      title: job.title,
      subtitle: tr("Download"),
      status: status(job),
      percent: progress === null ? null : Math.floor(progress * 100),
      detail: detail(job),
      cancellable: job.state === "downloading",
      cancel: async () => {
        await post("/api/browse/cancel", { id: job.id, file: job.file });
        await refresh();
      },
      paused: job.paused === true,
      setPaused: async (paused) => {
        await post("/api/browse/pause", { id: job.id, file: job.file, paused });
        await refresh();
      },
    };
  });

  return { incoming, refresh, expectDraft };
}
