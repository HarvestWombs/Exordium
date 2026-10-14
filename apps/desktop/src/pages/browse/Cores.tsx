import * as React from "react";

interface CoreJob {
  core: string;
  state: "downloading" | "verifying" | "installing" | "installed" | "failed";
  received: number;
  total: number;
  error?: string;
}

interface CoreEntry {
  version: string;
  core: string;
  file: string;
  size: number;
  status: "available" | "installed" | "install";
  job: CoreJob | null;
}

const ACTIVE: CoreJob["state"][] = ["downloading", "verifying", "installing"];

function formatMB(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * The browser's Cores tab: one version's game files per row, from HarvestLabs' host (cores.ts),
 * installed into the library's cores folder under the name mods ask for.
 */
export function Cores(
  { root, onInstalled }: { root: string | null; onInstalled: (core: string) => void },
) {
  const [list, setList] = React.useState<{ configured: boolean; cores: CoreEntry[]; error?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const reported = React.useRef(new Set<string>());
  // The library's callback changes every render; the catalog is read only when the install changes.
  const installedRef = React.useRef(onInstalled);
  installedRef.current = onInstalled;

  const load = React.useCallback(async (refresh = false) => {
    const query = new URLSearchParams();
    if (root) query.set("root", root);
    if (refresh) query.set("refresh", "1");
    const response = await fetch(`/api/cores?${query}`);
    const body = await response.json();
    setList(body);
    // A core that finished installing since the last look: the library reads it in.
    for (const entry of body.cores as CoreEntry[]) {
      if (entry.job?.state === "installed" && !reported.current.has(entry.core)) {
        reported.current.add(entry.core);
        installedRef.current(entry.core);
      }
    }
  }, [root]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const busy = list?.cores.some((c) => c.job && ACTIVE.includes(c.job.state)) ?? false;
  React.useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void load(), 500);
    return () => clearInterval(timer);
  }, [busy, load]);

  async function install(core: string) {
    setError(null);
    const response = await fetch("/api/cores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, core }),
    });
    if (!response.ok) setError((await response.json()).error ?? "Could not start the install.");
    await load();
  }

  return (
    <div className="browse-list cores">
      <div className="cores-head">
        <p className="muted">
          One Diablo II version's own files each: its DLLs, <code>Patch_D2.mpq</code> and{" "}
          <code>Game.exe</code>. A mod built on a version needs its core. They install into{" "}
          Exordium's library, and Exordium checks each download against its published checksum.
        </p>
        <button type="button" className="ghost" onClick={() => void load(true)}>Refresh</button>
      </div>
      {error && <div className="banner-error" role="alert">{error}</div>}
      {list?.error && <div className="banner-error" role="alert">{list.error}</div>}
      {list === null && <p className="muted pad">Reading the cores…</p>}
      {list && !list.configured && <p className="muted pad">Cores are not published yet.</p>}
      {list && !root && list.configured && (
        <p className="muted pad">Set up Exordium's library first: cores are installed into it.</p>
      )}
      {list && list.cores.length > 0 && (
        <ul className="core-list">
          {list.cores.map((c) => {
            const job = c.job;
            const running = job !== null && ACTIVE.includes(job.state);
            return (
              <li key={c.core} className="core-row">
                <div className="core-name">
                  <strong>{c.version}</strong>
                  {c.core !== c.version && <span className="muted small">mods call it {c.core}</span>}
                </div>
                <span className="muted small">{formatMB(c.size)}</span>
                <div className="grow" />
                {job?.state === "failed" && <span className="bad-text small">{job.error}</span>}
                {running && (
                  <span className="core-progress">
                    <span className="muted small">
                      {job.state === "downloading"
                        ? `${formatMB(job.received)} of ${formatMB(job.total)}`
                        : job.state === "verifying"
                        ? "Checking…"
                        : "Installing…"}
                    </span>
                    <span className="progress">
                      <span style={{ width: `${Math.round((job.received / Math.max(1, job.total)) * 100)}%` }} />
                    </span>
                  </span>
                )}
                {c.status === "installed" && <span className="core-state">Installed</span>}
                {c.status === "install" && (
                  <span
                    className="muted small"
                    title="1.14 is the whole game in one Game.exe, from Blizzard's installer"
                  >
                    Comes with Diablo II itself
                  </span>
                )}
                {c.status === "available" && !running && (
                  <button
                    type="button"
                    className="ghost primary"
                    disabled={!root}
                    onClick={() => void install(c.core)}
                  >
                    {job?.state === "failed" ? "Try again" : "Install"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
