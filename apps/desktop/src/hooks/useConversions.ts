import * as React from "react";
import { setupPost } from "../components/progress.tsx";
import { tr } from "../lib/i18n.ts";
import type { Incoming } from "../lib/incoming.ts";
import { formatSize } from "../lib/util.ts";
import type { CopyJob } from "../types.ts";

/** A mod going into the library. `settled` once it has landed or failed. */
export interface Conversion {
  /** The mod's identity in the converter: its folder, or its path for a folder chosen by hand. */
  key: string;
  title: string;
  core: string | null;
  move: boolean;
  job: CopyJob;
  settled: boolean;
}

const active = (job: CopyJob) => job.state === "queued" || job.state === "copying";

export function copyPercent(job: CopyJob): number {
  return job.total > 0 ? Math.min(100, Math.round((job.copied / job.total) * 100)) : 0;
}

function conversionStatus({ job, move }: Conversion): string {
  if (job.cancelling) return tr("Cancelling…");
  if (job.state === "queued") return tr("Queued");
  const percent = copyPercent(job);
  return move ? tr("Moving · {percent}%", { percent }) : tr("Copying · {percent}%", { percent });
}

/**
 * Every import in progress, followed here rather than in the converter so the copies, their cards
 * and their sidebar rows carry on wherever the player goes. A finished copy reads the library again
 * and says so; its card stays until the mod's own has replaced it.
 */
export function useConversions(
  { root, load, say, reportError, onSettled }: {
    root: string | null;
    load: (root: string) => Promise<boolean>;
    say: (message: string) => void;
    reportError: (err: unknown) => void;
    /** It has landed, as this title, or ended without one. */
    onSettled: (key: string, titleKey: string | null) => void;
  },
) {
  const [conversions, setConversions] = React.useState<Record<string, Conversion>>({});
  // The timer outlives renders; it reads the latest of these without restarting.
  const latest = React.useRef({ conversions, root, load, say, reportError, onSettled });
  latest.current = { conversions, root, load, say, reportError, onSettled };

  const add = React.useCallback((conversion: Conversion) => {
    setConversions((all) => ({ ...all, [conversion.key]: conversion }));
  }, []);

  /** Drops what has settled, so a mod uninstalled later can be imported again. */
  const forgetSettled = React.useCallback(() => {
    setConversions((all) => Object.fromEntries(Object.entries(all).filter(([, entry]) => !entry.settled)));
  }, []);

  // Copies run in the server, so they outlive a reload (changing language is one): pick them up again.
  React.useEffect(() => {
    if (!root) return;
    let stopped = false;
    void fetch("/api/setup")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { jobs?: CopyJob[] } | null) => {
        if (stopped) return;
        for (const job of body?.jobs ?? []) {
          if (job.kind !== "mod" || !active(job)) continue;
          setConversions((all) =>
            all[job.label] ? all : {
              ...all,
              [job.label]: { key: job.label, title: job.label, core: null, move: false, job, settled: false },
            }
          );
        }
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [root]);

  const settle = (key: string) => {
    setConversions((all) => all[key] ? { ...all, [key]: { ...all[key]!, settled: true } } : all);
  };

  /** A cancelled import leaves no trace, so the mod can be imported again. */
  const dropped = (entry: Conversion) => {
    latest.current.onSettled(entry.key, null);
    setConversions((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== entry.key)));
    latest.current.say(tr("Import of {title} cancelled.", { title: entry.title }));
  };

  async function cancel(entry: Conversion) {
    const { body } = await setupPost({ action: "cancel", job: entry.job.id });
    const job = (body as { job?: CopyJob }).job;
    if (!job) return;
    if (job.state === "cancelled") dropped(entry);
    else setConversions((all) => ({ ...all, [entry.key]: { ...entry, ...all[entry.key], job } }));
  }

  async function landed(entry: Conversion, job: CopyJob) {
    const { root, load, say } = latest.current;
    if (root) await load(root);
    latest.current.onSettled(entry.key, `mod:${job.label}`);
    settle(entry.key);
    say(
      entry.move
        ? tr("Moved {label} into Exordium's library.", { label: job.label })
        : tr("Imported {label} into Exordium's library.", { label: job.label }),
    );
  }

  const anyActive = Object.values(conversions).some((entry) => active(entry.job));
  React.useEffect(() => {
    if (!anyActive) return;
    let stopped = false;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      for (const entry of Object.values(latest.current.conversions).filter((each) => active(each.job))) {
        const { body } = await setupPost({ action: "job", job: entry.job.id }).catch(() => ({ body: {} }));
        const job = (body as { job?: CopyJob }).job;
        if (stopped || !job) continue;
        setConversions((all) => ({ ...all, [entry.key]: { ...entry, ...all[entry.key], job } }));
        if (job.state === "done") void landed(entry, job);
        if (job.state === "cancelled") dropped(entry);
        if (job.state === "failed") {
          latest.current.onSettled(entry.key, null);
          settle(entry.key);
          latest.current.reportError(
            new Error(
              tr("{label} was not imported: {error}.", {
                label: job.label,
                error: job.error ?? tr("the copy stopped"),
              }),
            ),
          );
        }
      }
      polling = false;
    }, 600);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [anyActive]);

  /** What the library shows a card and a row for. */
  const incoming: Incoming[] = Object.values(conversions)
    .filter((entry) => !entry.settled && entry.job.state !== "failed")
    .map((entry) => ({
      kind: "import",
      key: entry.key,
      title: entry.title,
      subtitle: tr("Mod · {core}", { core: entry.core ?? "?" }),
      status: conversionStatus(entry),
      percent: entry.job.state === "queued" ? null : copyPercent(entry.job),
      detail: entry.job.total > 0
        ? tr("{done} of {total}", { done: formatSize(entry.job.copied), total: formatSize(entry.job.total) })
        : null,
      cancellable: !entry.job.cancelling,
      cancel: () => cancel(entry),
    }));

  return { conversions, incoming, add, forgetSettled };
}
