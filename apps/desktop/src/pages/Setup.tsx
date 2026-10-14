import * as React from "react";
import { CopyProgress, followCopy, setupPost } from "../components/progress.tsx";
import { formatSize } from "../lib/util.ts";
import type { AppSettingsState, CatalogCore, CopyJob, InstallCheck } from "../types.ts";

/**
 * Setup's second step: the cores from HarvestLabs' catalog (cores.ts), downloaded into the library
 * one at a time. Cores already in the library show ticked and cannot be chosen again. A failed one is
 * reported and the rest carry on; the step can be skipped and finished later from Browse → Cores.
 */
export function SetupCores({ onDone }: { onDone: () => void }) {
  const [library, setLibrary] = React.useState<string | null>(null);
  const [list, setList] = React.useState<CatalogCore[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [running, setRunning] = React.useState<
    { core: string; index: number; count: number; received: number; total: number } | null
  >(null);
  const [failed, setFailed] = React.useState<{ core: string; error: string }[]>([]);

  const read = React.useCallback(async (root: string) => {
    const response = await fetch(`/api/cores?root=${encodeURIComponent(root)}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Could not read the cores catalog.");
    if (body.error) throw new Error(body.error);
    if (!body.configured) throw new Error("No cores are published yet.");
    return body.cores as CatalogCore[];
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const setup = await (await fetch("/api/setup")).json();
        const root = String(setup.library ?? "").replace(/\\/g, "/");
        setLibrary(root);
        const cores = await read(root);
        setList(cores);
        setChosen(new Set(cores.filter((c) => c.status === "available").map((c) => c.core)));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [read]);

  async function download() {
    if (!library || !list) return;
    const queue = list.filter((c) => c.status === "available" && chosen.has(c.core));
    const failures: { core: string; error: string }[] = [];
    for (const [index, entry] of queue.entries()) {
      setRunning({ core: entry.core, index: index + 1, count: queue.length, received: 0, total: entry.size });
      const response = await fetch("/api/cores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: library, core: entry.core }),
      });
      if (!response.ok) {
        failures.push({
          core: entry.core,
          error: (await response.json().catch(() => ({}))).error ?? "It did not start.",
        });
        continue;
      }
      // Follow this core's job until it ends, then the next one.
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const job = (await read(library).catch(() => [])).find((c) => c.core === entry.core)?.job;
        if (job) setRunning((r) => r && { ...r, received: job.received, total: job.total || r.total });
        if (!job || job.state === "installed") break;
        if (job.state === "failed") {
          failures.push({ core: entry.core, error: job.error ?? "The download failed." });
          break;
        }
      }
    }
    setRunning(null);
    setFailed(failures);
    setList(await read(library).catch(() => list));
    if (failures.length === 0) onDone();
  }

  const available = list?.filter((c) => c.status === "available") ?? [];
  const queued = available.filter((c) => chosen.has(c.core));
  const bytes = queued.reduce((sum, c) => sum + c.size, 0);
  const busy = running !== null;
  const toggle = (core: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(core)) next.delete(core);
      else next.add(core);
      return next;
    });

  if (error) {
    return (
      <>
        <p className="bad-text small">{error}</p>
        <p className="muted small">You can install cores later from Browse → Cores.</p>
        <div className="setup-actions">
          <button type="button" className="ghost" onClick={onDone}>Skip for now</button>
        </div>
      </>
    );
  }
  if (!list) return <p className="muted small">Reading the cores catalog…</p>;
  return (
    <>
      <p className="muted small">
        Downloaded from HarvestLabs and checked against their published checksums. Choose which to install:
      </p>
      <div className="setup-cores">
        {list.map((core) => (
          <label key={core.core} className="confirm-check">
            <input
              type="checkbox"
              checked={core.status !== "available" || chosen.has(core.core)}
              disabled={busy || core.status !== "available"}
              onChange={() => toggle(core.core)}
            />
            {core.core}
            <span className="muted small">{core.status === "available" ? formatSize(core.size) : "installed"}</span>
          </label>
        ))}
      </div>
      {available.length > 1 && !busy && (
        <div className="setup-actions">
          <button
            type="button"
            className="link-button"
            onClick={() => setChosen(new Set(available.map((c) => c.core)))}
          >
            Select all
          </button>
          <button type="button" className="link-button" onClick={() => setChosen(new Set())}>Select none</button>
        </div>
      )}
      {running && (
        <CopyProgress
          job={{
            id: running.core,
            kind: "core",
            label: running.core,
            state: "copying",
            copied: running.received,
            total: running.total,
            error: null,
          }}
          label={`Downloading ${running.core} (${running.index} of ${running.count})`}
        />
      )}
      {failed.length > 0 && (
        <p className="bad-text small">
          Not installed: {failed.map((f) => `${f.core} (${f.error})`).join("; ")}
        </p>
      )}
      <div className="setup-actions">
        <button
          type="button"
          className="ghost primary"
          disabled={busy || queued.length === 0}
          onClick={() => void download()}
        >
          {busy
            ? "Downloading…"
            : failed.length > 0
            ? "Try again"
            : `Download ${queued.length} core${queued.length === 1 ? "" : "s"} (${formatSize(bytes)})`}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={onDone}>
          {available.length === 0 ? "Continue" : failed.length > 0 ? "Continue without them" : "Skip"}
        </button>
      </div>
    </>
  );
}

/**
 * First launch: link the Diablo II install, copy its game files into Exordium's own library, copy
 * its D2SE cores (or get them from the Cores tab), then the library, where D2SE mods are imported
 * through the converter. Nothing in the install is changed, and nothing runs from it afterwards.
 */
export function SetupPage(
  { app, install, onDone }: {
    app: AppSettingsState;
    install: string | null;
    onDone: (next: "library" | "cores") => void;
  },
) {
  const [folder, setFolder] = React.useState(install ?? "");
  const [check, setCheck] = React.useState<InstallCheck | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState<"install" | "cores" | "done">("install");
  const [gameJob, setGameJob] = React.useState<CopyJob | null>(null);
  const [symlink, setSymlink] = React.useState<{ ok: boolean; admin: boolean; error: string | null } | null>(null);
  React.useEffect(() => {
    void fetch("/api/symlink-status").then((response) => response.json()).then(setSymlink).catch(() => {});
  }, []);

  async function inspect(path: string) {
    setProblem(null);
    setCheck(null);
    if (!path.trim()) return;
    setBusy(true);
    const { body } = await setupPost({ action: "check", install: path.trim() });
    setBusy(false);
    if (body.check) {
      setCheck(body.check);
      if (body.check.problem) setProblem(body.check.problem);
    } else setProblem(body.error ?? "Could not read that folder.");
  }

  React.useEffect(() => {
    if (install) void inspect(install);
    // Only the install known at first launch; later checks follow the folder field.
  }, []);

  async function choose() {
    const params = new URLSearchParams({ title: "Choose your Diablo II folder" });
    if (folder) params.set("path", folder);
    const response = await fetch(`/api/pick-folder?${params}`);
    if (!response.ok) return;
    const body = await response.json();
    if (body.path) {
      setFolder(body.path);
      void inspect(body.path);
    }
  }

  async function copyGame() {
    setBusy(true);
    setProblem(null);
    const { ok, body } = await setupPost({ action: "start", install: folder.trim() });
    if (!ok || !body.job) {
      setBusy(false);
      return setProblem(body.error ?? body.check?.problem ?? "Could not start copying.");
    }
    const job = await followCopy(body.job, setGameJob);
    setBusy(false);
    if (job.state === "done") setStep("cores");
    else setProblem(job.error ?? "Copying stopped.");
  }

  const ready = check !== null && !check.problem;

  return (
    <main className="setup-page">
      <div className="setup-shell">
        <div className="setup-head">
          <p className="eyebrow accent">First launch</p>
          <h1>Set up Exordium</h1>
          <p className="muted">
            Exordium keeps its own copy of the game files, cores and mods it runs, so your Diablo II folder is only read
            during setup and is never changed.
          </p>
        </div>
        <ol className="setup-steps">
          <li className={`setup-step ${step === "install" ? "active" : "done"}`}>
            <span className="setup-num">{step === "install" ? "1" : "✓"}</span>
            <div>
              <h2>Your Diablo II install</h2>
              <p className="muted">The folder with Diablo II: Lord of Destruction (d2data.mpq, d2exp.mpq).</p>
              <div className="setup-path">
                <input
                  value={folder}
                  placeholder="C:\Program Files (x86)\Diablo II"
                  disabled={busy || step !== "install"}
                  onChange={(event) => setFolder(event.currentTarget.value)}
                  onBlur={() => folder.trim() && folder.trim() !== check?.install && void inspect(folder)}
                  onKeyDown={(event) => event.key === "Enter" && void inspect(folder)}
                  autoFocus
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || step !== "install"}
                  onClick={() => void choose()}
                >
                  Choose…
                </button>
              </div>
              {check && !check.problem && (
                <ul className="setup-found">
                  <li>
                    {GAME_ARCHIVE_COUNT - check.missing.length} of {GAME_ARCHIVE_COUNT} game archives
                    {check.missing.length > 0 && (
                      <span className="warn-text">(missing {check.missing.join(", ")})</span>
                    )}
                  </li>
                  <li>
                    {check.d2se
                      ? `D2SE: ${check.mods.length} mod${check.mods.length === 1 ? "" : "s"} to import`
                      : "No D2SE in this install"}
                  </li>
                </ul>
              )}
              {gameJob && <CopyProgress job={gameJob} />}
              {step === "install" && ready && (
                <div className="setup-actions">
                  <button type="button" className="ghost primary" disabled={busy} onClick={() => void copyGame()}>
                    {busy && gameJob ? "Copying…" : `Copy game files (${formatSize(check.gameBytes)})`}
                  </button>
                  <span className="muted small">Into {app.paths.data}\library</span>
                </div>
              )}
            </div>
          </li>

          <li className={`setup-step ${step === "cores" ? "active" : step === "done" ? "done" : ""}`}>
            <span className="setup-num">{step === "done" ? "✓" : "2"}</span>
            <div>
              <h2>Cores</h2>
              <p className="muted">The game versions mods run on, such as 1.10f or 1.13c.</p>
              {step === "cores" && <SetupCores onDone={() => setStep("done")} />}
            </div>
          </li>

          <li className={`setup-step ${step === "done" ? "active" : ""}`}>
            <span className="setup-num">3</span>
            <div>
              <h2>Library</h2>
              <p className="muted">
                {check && check.mods.length > 0
                  ? `${check.mods.length} D2SE mod${
                    check.mods.length === 1 ? " was" : "s were"
                  } found in your install. The library offers to import them, each reviewed in the converter first.`
                  : "Install mods from Browse, or import a mod archive from disk."}
              </p>
              {step === "done" && (
                <div className="setup-actions">
                  <button type="button" className="ghost primary" onClick={() => onDone("library")}>
                    Open the library
                  </button>
                </div>
              )}
            </div>
          </li>
        </ol>
        {problem && (
          <div className="setup-warning">
            <strong>{problem}</strong>
          </div>
        )}
        {symlink && !symlink.ok && (
          <div className="setup-warning">
            <strong>Symlinks are not available.</strong>
            <span>
              Boxes need file symlinks to avoid copying full MPQs. Enable Windows Developer Mode or restart Exordium as
              administrator.
            </span>
            {!symlink.admin && (
              <button
                type="button"
                className="ghost"
                onClick={() => void fetch("/api/restart-admin", { method: "POST" })}
              >
                Restart as admin
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export const GAME_ARCHIVE_COUNT = 10;
