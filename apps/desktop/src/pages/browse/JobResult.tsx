import { tr } from "../../lib/i18n.ts";
import type { Job } from "./types.ts";

/** What a finished or failed job left: the installed mod, a reason, or files to look at. */
export function JobResult(
  { job, onInstalled, onOpen }: {
    job: Job | undefined;
    onInstalled: (name: string) => void;
    onOpen: (what: "file" | "unpacked") => void;
  },
) {
  if (!job) return null;
  if (job.state === "failed") {
    return (
      <span className="bad-text small">
        {job.error}
        {job.path && (
          <>
            {" · "}
            <button type="button" className="small-button" onClick={() => onOpen("file")}>{tr("Show archive")}</button>
          </>
        )}
      </span>
    );
  }
  if (job.state !== "installed" || !job.result) return null;
  return (
    <>
      {job.result.installed.map((mod) => (
        <span key={mod.name} className="good-text small">
          {tr("Installed as MODS\\{name}", { name: mod.name })} ·{" "}
          <button type="button" className="small-button" onClick={() => onInstalled(mod.name)}>
            {tr("Open in library")}
          </button>
        </span>
      ))}
      {job.result.skipped.map((mod) => <span key={mod.name} className="warn-text small">{mod.reason}</span>)}
      {job.result.installed.length === 0 && job.result.skipped.length === 0 && (
        <span className="warn-text small">
          {tr("No D2SE mod inside (no D2SE_SETUP.ini) · files unpacked ·")}{" "}
          <button type="button" className="small-button" onClick={() => onOpen("unpacked")}>{tr("Show files")}</button>
        </span>
      )}
    </>
  );
}
