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
            <button type="button" className="link-button" onClick={() => onOpen("file")}>Show archive</button>
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
          Installed as MODS\{mod.name} ·{" "}
          <button type="button" className="link-button" onClick={() => onInstalled(mod.name)}>Open in library</button>
        </span>
      ))}
      {job.result.skipped.map((mod) => <span key={mod.name} className="warn-text small">{mod.reason}</span>)}
      {job.result.installed.length === 0 && job.result.skipped.length === 0 && (
        <span className="warn-text small">
          No D2SE mod inside (no D2SE_SETUP.ini) · files unpacked ·{" "}
          <button type="button" className="link-button" onClick={() => onOpen("unpacked")}>Show files</button>
        </span>
      )}
    </>
  );
}
