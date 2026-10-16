import * as React from "react";
import { openLink } from "../../lib/util.ts";
import type { Title, TitleUpdateCheck, TitleUpdateSettings } from "../../types.ts";

export function UpdatesPage({ t, root, onChanged }: { t: Title; root: string; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = React.useState<TitleUpdateSettings>(t.updateSettings);
  const [check, setCheck] = React.useState<TitleUpdateCheck | null>(t.updateCheck);
  const [busy, setBusy] = React.useState<"save" | "check" | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(t.updateSettings);

  React.useEffect(() => {
    setDraft(t.updateSettings);
    setCheck(t.updateCheck);
    setProblem(null);
  }, [t.key, t.updateSettings, t.updateCheck]);

  function update(next: Partial<TitleUpdateSettings>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function post(action: "save" | "check") {
    setBusy(action);
    setProblem(null);
    try {
      const response = await fetch("/api/title-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root,
          ...(t.kind === "core" ? { core: t.folder } : { folder: t.folder }),
          action,
          version: t.version,
          settings: draft,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update settings.");
      setDraft(body.settings ?? draft);
      setCheck(body.check ?? check);
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const checkedAt = check?.checkedAt ? new Date(check.checkedAt).toLocaleString() : null;

  return (
    <div className="page-with-footer">
      <div className="stack">
        <fieldset disabled={busy !== null} className="checks option-section">
          <legend className="eyebrow">AUTOMATIC UPDATES</legend>
          <label>
            <input
              type="checkbox"
              checked={draft.automatic}
              onChange={(e) => update({ automatic: e.currentTarget.checked })}
            />{" "}
            Automatic updates
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.background}
              onChange={(e) => update({ background: e.currentTarget.checked })}
            />{" "}
            Allow background downloads
          </label>
        </fieldset>
        <section className="option-section">
          <div className="section-head">
            <h2 className="eyebrow">ENDPOINT</h2>
            <span className="muted small">An Exordium update feed (see exordium.update.example.json)</span>
          </div>
          <label className="field compact-field">
            Manifest URL or file
            <input
              type="text"
              value={draft.endpoint ?? ""}
              disabled={busy !== null}
              placeholder="updates.json, https://example.com/mod.json"
              onChange={(e) => update({ endpoint: e.currentTarget.value || null })}
            />
          </label>
          <label className="field compact-field">
            Channel
            <select
              value={draft.channel}
              disabled={busy !== null}
              onChange={(e) => update({ channel: e.currentTarget.value as TitleUpdateSettings["channel"] })}
            >
              <option value="stable">Stable</option>
              <option value="testing">Testing</option>
              <option value="local">Local files only</option>
            </select>
          </label>
        </section>
        <section className="option-section">
          <div className="section-head">
            <h2 className="eyebrow">LATEST CHECK</h2>
            <span className={check?.available ? "warn-text small" : check?.error ? "bad-text small" : "muted small"}>
              {check ? checkedAt : "Never checked"}
            </span>
          </div>
          <dl className="kv wide">
            <dt>Status</dt>
            <dd>
              {check?.error
                ? check.error
                : check?.available
                ? `Update available: ${check.latestVersion}`
                : check
                ? "No update found"
                : "—"}
            </dd>
            <dt>Installed</dt>
            <dd>{check?.currentVersion || t.version || "—"}</dd>
            <dt>Latest</dt>
            <dd>{check?.latestVersion || "—"}</dd>
            <dt>Downloads</dt>
            <dd>{check ? String(check.downloadCount) : "—"}</dd>
          </dl>
          {check?.notes && <p className="muted small">{check.notes}</p>}
          {check?.page && (
            <button type="button" className="ghost fit" onClick={() => void openLink(check.page!)}>
              Open release page
            </button>
          )}
        </section>
      </div>
      <footer className="dialog-footer">
        <span className={problem ? "error" : "muted small"}>{problem ?? (changed ? "Unsaved changes" : "Saved")}</span>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            disabled={busy !== null || (!changed && !draft.endpoint)}
            onClick={() => void post("check")}
          >
            {busy === "check" ? "Checking…" : "Check now"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={!changed || busy !== null}
            onClick={() => setDraft(t.updateSettings)}
          >
            Reset
          </button>
          <button
            type="button"
            className="ghost primary"
            disabled={!changed || busy !== null}
            onClick={() => void post("save")}
          >
            {busy === "save" ? "Applying…" : "Apply"}
          </button>
        </div>
      </footer>
    </div>
  );
}
