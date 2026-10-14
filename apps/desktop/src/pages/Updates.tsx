import * as React from "react";
import { SettingsGroup } from "../components/settings-rows.tsx";
import { openLink } from "../lib/util.ts";
import type { Status, UpdateView } from "../types.ts";

/** Applies the downloaded update; Exordium restarts, so the page reloads when the new one answers. */
export async function applyUpdate(): Promise<void> {
  const response = await fetch("/api/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "apply" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "The update could not be applied.");
}

/** Settings > Updates: the running version, what GitHub has, and the one button that fits. */
export function UpdatesPanel({ status }: { status: Status }) {
  const [view, setView] = React.useState<UpdateView | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    const response = await fetch("/api/update");
    if (response.ok) setView(await response.json());
  }, []);
  // Status events arrive as the check and download move along; downloads also tick while running.
  React.useEffect(() => void refresh(), [refresh, status.update.phase, status.update.version]);
  React.useEffect(() => {
    if (view?.phase !== "downloading" && view?.phase !== "checking") return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [view?.phase, refresh]);

  async function run(action: "check" | "download") {
    setProblem(null);
    const response = await fetch("/api/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setProblem(body.error ?? "Could not reach GitHub.");
    else setView(body);
  }

  if (!view) return <p className="muted">Reading update status…</p>;
  const update = view.update;
  const percent = update && update.asset.size > 0 ? Math.round((view.received / update.asset.size) * 100) : 0;
  const line = view.phase === "checking"
    ? "Checking GitHub…"
    : view.phase === "downloading"
    ? `Downloading ${update?.version} — ${percent}%`
    : view.phase === "ready"
    ? `${update?.version} is downloaded and checked. Restart to update.`
    : view.phase === "available"
    ? `${update?.version} is available.`
    : view.phase === "current"
    ? "Exordium is up to date."
    : view.phase === "failed"
    ? view.error ?? "The last check failed."
    : "Not checked yet.";

  return (
    <SettingsGroup title="Exordium">
      <div className="settings-row update-row">
        <div>
          <strong>Version {view.current}</strong>
          <p className={view.phase === "failed" ? "bad-text small" : "muted small"}>{line}</p>
          {view.checkedAt && (
            <p className="muted small">
              Checked {new Date(view.checkedAt).toLocaleString()} · github.com/{view.repo}
            </p>
          )}
          {!view.packaged && view.phase === "ready" && (
            <p className="warn-text small">This is a dev server: updates install into the packaged app only.</p>
          )}
        </div>
        <div className="row-actions">
          {view.phase === "ready"
            ? (
              <button
                type="button"
                className="ghost primary"
                disabled={!view.packaged}
                onClick={() => void applyUpdate().catch((e) => setProblem(e.message))}
              >
                Restart to update
              </button>
            )
            : view.phase === "available"
            ? (
              <button type="button" className="ghost primary" onClick={() => void run("download")}>
                Download {update?.version}
              </button>
            )
            : (
              <button
                type="button"
                className="ghost"
                disabled={view.phase === "checking" || view.phase === "downloading"}
                onClick={() => void run("check")}
              >
                {view.phase === "checking" ? "Checking…" : "Check now"}
              </button>
            )}
        </div>
      </div>
      {view.phase === "downloading" && (
        <div
          className="update-progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {update && (view.phase === "available" || view.phase === "downloading" || view.phase === "ready") && (
        <div className="settings-row update-notes">
          <div>
            <strong>
              {update.name}
              {update.prerelease ? " · pre-release" : ""}
            </strong>
            {update.publishedAt && (
              <p className="muted small">Released {new Date(update.publishedAt).toLocaleDateString()}</p>
            )}
            {update.notes && <p className="update-notes-text">{update.notes}</p>}
            <button type="button" className="link-button" onClick={() => openLink(update.url)}>
              Release page ↗
            </button>
          </div>
        </div>
      )}
      {problem && <p className="bad-text small">{problem}</p>}
    </SettingsGroup>
  );
}
