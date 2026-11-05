import { plural, tr } from "../lib/i18n.ts";
import * as React from "react";
import { CopyProgress, followCopy, setupPost } from "../components/progress.tsx";
import { formatSize } from "../lib/util.ts";
import type { AppSettingsState, CatalogCore, CopyJob, InstallCheck } from "../types.ts";

const CLASSIC_CORES = new Set([
  "1.00",
  "1.01",
  "1.02",
  "1.03",
  "1.04b",
  "1.04c",
  "1.05",
  "1.05b",
  "1.06",
  "1.06b",
]);
const LOD_CORES = new Set([
  "1.07",
  "1.08",
  "1.09",
  "1.09b",
  "1.09d",
  "1.10f",
  "1.11",
  "1.11b",
  "1.12a",
  "1.13c",
  "1.13d",
]);

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
    if (!response.ok) throw new Error(body.error ?? tr("Could not read the cores catalog."));
    if (body.error) throw new Error(body.error);
    if (!body.configured) throw new Error(tr("No cores are published yet."));
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
          error: (await response.json().catch(() => ({}))).error ?? tr("It did not start."),
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
          failures.push({ core: entry.core, error: job.error ?? tr("The download failed.") });
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
  const selectFamily = (family: ReadonlySet<string>) =>
    setChosen(new Set(available.filter((core) => family.has(core.core.toLowerCase())).map((core) => core.core)));

  if (error) {
    return (
      <>
        <p className="bad-text small">{error}</p>
        <p className="muted small">{tr("You can install cores later from Browse → Cores.")}</p>
        <div className="setup-actions">
          <button type="button" className="ghost" onClick={onDone}>{tr("Skip for now")}</button>
        </div>
      </>
    );
  }
  if (!list) return <p className="muted small">{tr("Reading the cores catalog…")}</p>;
  return (
    <>
      <p className="muted small">
        {tr("Downloaded from HarvestLabs and checked against their published checksums. Choose which to install:")}
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
            <span className="muted small">{core.status === "available" ? formatSize(core.size) : tr("installed")}</span>
          </label>
        ))}
      </div>
      {available.length > 1 && !busy && (
        <div className="setup-actions">
          <button type="button" className="small-button" onClick={() => selectFamily(CLASSIC_CORES)}>
            {tr("Classic (1.00-1.06b)")}
          </button>
          <button type="button" className="small-button" onClick={() => selectFamily(LOD_CORES)}>
            {tr("LOD (1.07-1.13d)")}
          </button>
          <button
            type="button"
            className="small-button"
            onClick={() => setChosen(new Set(available.map((c) => c.core)))}
          >
            {tr("Select all")}
          </button>
          <button type="button" className="small-button" onClick={() => setChosen(new Set())}>
            {tr("Select none")}
          </button>
        </div>
      )}
      {running && (
        <CopyProgress
          job={{
            id: running.core,
            kind: "core",
            label: running.core,
            state: "copying",
            cancelling: false,
            copied: running.received,
            total: running.total,
            error: null,
          }}
          label={tr("Downloading {core} ({index} of {count})", {
            core: running.core,
            index: running.index,
            count: running.count,
          })}
        />
      )}
      {failed.length > 0 && (
        <p className="bad-text small">
          {tr("Not installed:")} {failed.map((f) => `${f.core} (${f.error})`).join("; ")}
        </p>
      )}
      <div className="setup-actions">
        <button
          type="button"
          className="ghost primary action-install"
          disabled={busy || queued.length === 0}
          onClick={() => void download()}
        >
          {busy
            ? tr("Downloading…")
            : failed.length > 0
            ? tr("Try again")
            : plural(queued.length, "Download {count} core ({bytes})", "Download {count} cores ({bytes})", {
              bytes: formatSize(bytes),
            })}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={onDone}>
          {available.length === 0 ? tr("Continue") : failed.length > 0 ? tr("Continue without them") : tr("Skip")}
        </button>
      </div>
    </>
  );
}

/**
 * First launch: link the Diablo II game files into Exordium's library, get cores from the Cores tab,
 * then open the library, where D2SE mods are imported through the converter. The player can choose
 * an independent copy instead, or explicitly move the files into Exordium.
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
  const [transferMode, setTransferMode] = React.useState<"auto" | "symlink" | "hardlink" | "copy" | "move">(
    "auto",
  );
  const [symlink, setSymlink] = React.useState<{ ok: boolean; admin: boolean; error: string | null } | null>(null);
  const inspectSequence = React.useRef(0);
  React.useEffect(() => {
    void fetch("/api/symlink-status").then((response) => response.json()).then(setSymlink).catch(() => {});
  }, []);

  async function inspect(path: string): Promise<boolean> {
    const value = path.trim();
    const sequence = ++inspectSequence.current;
    setProblem(null);
    setCheck(null);
    if (!value) return false;
    setBusy(true);
    const { body } = await setupPost({ action: "check", install: value });
    if (sequence !== inspectSequence.current) return false;
    setBusy(false);
    if (body.check) {
      setCheck(body.check);
      if (body.check.problem) setProblem(body.check.problem);
      return !body.check.problem;
    }
    setProblem(body.error ?? tr("Could not read that folder."));
    return false;
  }

  React.useEffect(() => {
    if (install) void inspect(install);
    // Only inspect an install detected before setup; typed paths wait for explicit submission.
  }, []);

  async function choose() {
    const params = new URLSearchParams({ title: tr("Choose your Diablo II folder") });
    if (folder) params.set("path", folder);
    const response = await fetch(`/api/pick-folder?${params}`);
    if (!response.ok) return;
    const body = await response.json();
    if (body.path) {
      setFolder(body.path);
      void inspect(body.path);
    }
  }

  async function setupGame(path = folder) {
    setBusy(true);
    setProblem(null);
    const { ok, body } = await setupPost({ action: "start", install: path.trim(), mode: transferMode });
    if (!ok || !body.job) {
      setBusy(false);
      return setProblem(body.error ?? body.check?.problem ?? tr("Could not set up the game files."));
    }
    const job = await followCopy(body.job, setGameJob);
    setBusy(false);
    if (job.state === "done") setStep("cores");
    else setProblem(job.error ?? tr("Game file setup stopped."));
  }

  async function submitTypedPath() {
    const path = folder.trim();
    if (!path || busy || step !== "install") return;
    const valid = path === check?.install && !check.problem ? true : await inspect(path);
    if (valid) await setupGame(path);
  }

  const ready = check !== null && !check.problem;
  const transferProgressLabel = gameJob?.state === "done"
    ? tr("Game files ready")
    : transferMode === "copy"
    ? tr("Copying game files…")
    : transferMode === "move"
    ? tr("Moving game files…")
    : transferMode === "symlink"
    ? tr("Creating symbolic links…")
    : transferMode === "hardlink"
    ? tr("Creating hardlinks…")
    : tr("Linking game files…");

  return (
    <main className="setup-page">
      <div className="setup-shell">
        <div className="setup-head">
          <p className="eyebrow accent">{tr("First launch")}</p>
          <h1>{tr("Set up Exordium")}</h1>
          <p className="muted">
            {tr(
              "Exordium links to your existing game files by default, avoiding another large copy. Cores and mods remain in Exordium's library.",
            )}
          </p>
        </div>
        <ol className="setup-steps">
          <li className={`setup-step ${step === "install" ? "active" : "done"}`}>
            <span className="setup-num">{step === "install" ? "1" : "✓"}</span>
            <div>
              <h2>{tr("Your Diablo II install")}</h2>
              <p className="muted">{tr("The folder with Diablo II: Lord of Destruction (d2data.mpq, d2exp.mpq).")}</p>
              <div className="setup-path">
                <input
                  value={folder}
                  placeholder="C:\Program Files (x86)\Diablo II"
                  disabled={busy || step !== "install"}
                  onChange={(event) => {
                    setFolder(event.currentTarget.value);
                    setCheck(null);
                    setProblem(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void submitTypedPath();
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || step !== "install"}
                  onClick={() => void choose()}
                >
                  {tr("Choose…")}
                </button>
              </div>
              {check && !check.problem && (
                <ul className="setup-found">
                  <li>
                    {tr("{found} of {total} game archives", {
                      found: GAME_ARCHIVE_COUNT - check.missing.length,
                      total: GAME_ARCHIVE_COUNT,
                    })}
                    {check.missing.length > 0 && (
                      <span className="warn-text">{tr("(missing {files})", { files: check.missing.join(", ") })}</span>
                    )}
                  </li>
                  <li>
                    {check.d2se
                      ? plural(check.mods.length, "D2SE: {count} mod to import", "D2SE: {count} mods to import")
                      : tr("No D2SE in this install")}
                  </li>
                </ul>
              )}
              {gameJob && <CopyProgress job={gameJob} label={transferProgressLabel} />}
              {step === "install" && ready && (
                <>
                  <div className="setup-transfer">
                    <label htmlFor="setup-transfer-mode">{tr("Game file method")}</label>
                    <select
                      id="setup-transfer-mode"
                      value={transferMode}
                      disabled={busy}
                      onChange={(event) => setTransferMode(event.currentTarget.value as typeof transferMode)}
                    >
                      <option value="auto">{tr("Automatic: symlink, hardlink, then copy")}</option>
                      <option value="symlink" disabled={symlink?.ok === false}>{tr("Symbolic links")}</option>
                      <option value="hardlink">{tr("Hardlinks (same drive only)")}</option>
                      <option value="copy">{tr("Copy (independent)")}</option>
                      <option value="move">{tr("Move (removes original files)")}</option>
                    </select>
                    <span className="muted small">
                      {transferMode === "auto"
                        ? tr("Uses no extra space when linking is available.")
                        : transferMode === "symlink"
                        ? tr("Works across drives; the original install must remain in place.")
                        : transferMode === "hardlink"
                        ? tr("Uses no extra space, but both folders share the same files.")
                        : transferMode === "copy"
                        ? tr("Uses {gameBytes} and does not depend on the original install.", {
                          gameBytes: formatSize(check.gameBytes),
                        })
                        : tr("Removes these files from the original install and may prevent it from running.")}
                    </span>
                  </div>
                  <div className="setup-actions">
                    <button type="button" className="ghost primary" disabled={busy} onClick={() => void setupGame()}>
                      {busy && gameJob
                        ? transferProgressLabel
                        : transferMode === "copy"
                        ? tr("Copy game files ({gameBytes})", { gameBytes: formatSize(check.gameBytes) })
                        : transferMode === "move"
                        ? tr("Move game files ({gameBytes})", { gameBytes: formatSize(check.gameBytes) })
                        : tr("Link game files")}
                    </button>
                    <span className="muted small">{tr("Into {data}\\library", { data: app.paths.data })}</span>
                  </div>
                </>
              )}
            </div>
          </li>

          <li className={`setup-step ${step === "cores" ? "active" : step === "done" ? "done" : ""}`}>
            <span className="setup-num">{step === "done" ? "✓" : "2"}</span>
            <div>
              <h2>{tr("Cores")}</h2>
              <p className="muted">{tr("The game versions mods run on, such as 1.10f or 1.13c.")}</p>
              {step === "cores" && <SetupCores onDone={() => setStep("done")} />}
            </div>
          </li>

          <li className={`setup-step ${step === "done" ? "active" : ""}`}>
            <span className="setup-num">3</span>
            <div>
              <h2>{tr("Library")}</h2>
              <p className="muted">
                {check && check.mods.length > 0
                  ? plural(
                    check.mods.length,
                    "{count} D2SE mod was found in your install. Use Import… in the library to bring it in, reviewed in the converter first.",
                    "{count} D2SE mods were found in your install. Use Import… in the library to bring them in, each reviewed in the converter first.",
                  )
                  : tr("Install mods from Browse, or import a mod archive from disk.")}
              </p>
              {step === "done" && (
                <div className="setup-actions">
                  <button type="button" className="ghost primary" onClick={() => onDone("library")}>
                    {tr("Open the library")}
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
            <strong>{tr("Symlinks are not available.")}</strong>
            <span>
              {tr(
                "Boxes need file symlinks to avoid copying full MPQs. Enable Windows Developer Mode or restart Exordium as administrator.",
              )}
            </span>
            {!symlink.admin && (
              <button
                type="button"
                className="ghost"
                onClick={() => void fetch("/api/restart-admin", { method: "POST" })}
              >
                {tr("Restart as admin")}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export const GAME_ARCHIVE_COUNT = 10;
