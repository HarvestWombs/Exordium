import { formatDateTime, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { openLink } from "../../lib/util.ts";
import type { Title, TitleUpdateCheck, TitleUpdateSettings } from "../../types.ts";
import { ManifestFooter } from "./ManifestFooter.tsx";
import type { ManifestEditor } from "./useManifest.ts";

export function UpdatesPage(
  { t, root, editor, onChanged }: { t: Title; root: string; editor: ManifestEditor; onChanged: () => Promise<void> },
) {
  const update = editor.manifest!.update ?? {};
  const [check, setCheck] = React.useState<TitleUpdateCheck | null>(t.updateCheck);
  const [checking, setChecking] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const busy = checking || editor.saving;

  React.useEffect(() => {
    setCheck(t.updateCheck);
    setProblem(null);
  }, [t.key, t.updateCheck]);

  async function runCheck() {
    setChecking(true);
    setProblem(null);
    try {
      const response = await fetch("/api/title-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root,
          ...(t.kind === "core" ? { core: t.folder } : { folder: t.folder }),
          version: editor.manifest!.version ?? t.version,
          settings: update,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? tr("Could not update settings."));
      setCheck(body.check ?? check);
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const checkedAt = check?.checkedAt ? formatDateTime(check.checkedAt) : null;

  return (
    <div className="page-with-footer">
      <div className="stack">
        {problem && <div className="banner-error" role="alert">{problem}</div>}
        <fieldset disabled={busy} className="checks option-section">
          <legend className="eyebrow">{tr("AUTOMATIC UPDATES")}</legend>
          <label>
            <input
              type="checkbox"
              checked={update.automatic ?? true}
              onChange={(e) => editor.section("update", { automatic: e.currentTarget.checked })}
            />{" "}
            {tr("Automatic updates")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={update.background ?? true}
              onChange={(e) => editor.section("update", { background: e.currentTarget.checked })}
            />{" "}
            {tr("Allow background downloads")}
          </label>
        </fieldset>
        <section className="option-section">
          <div className="section-head">
            <h2 className="eyebrow">{tr("ENDPOINT")}</h2>
            <span className="muted small">{tr("An Exordium update feed (see exordium.update.example.json)")}</span>
          </div>
          <label className="field compact-field">
            {tr("Manifest URL or file")}
            <input
              type="text"
              value={update.endpoint ?? ""}
              disabled={busy}
              placeholder="updates.json, https://example.com/mod.json"
              onChange={(e) => editor.section("update", { endpoint: e.currentTarget.value || null })}
            />
          </label>
          <label className="field compact-field">
            {tr("Channel")}
            <select
              value={update.channel ?? "stable"}
              disabled={busy}
              onChange={(e) =>
                editor.section("update", { channel: e.currentTarget.value as TitleUpdateSettings["channel"] })}
            >
              <option value="stable">{tr("Stable")}</option>
              <option value="testing">{tr("Testing")}</option>
              <option value="local">{tr("Local files only")}</option>
            </select>
          </label>
        </section>
        <section className="option-section">
          <div className="section-head">
            <h2 className="eyebrow">{tr("LATEST CHECK")}</h2>
            <span className={check?.available ? "warn-text small" : check?.error ? "bad-text small" : "muted small"}>
              {check ? checkedAt : tr("Never checked")}
            </span>
          </div>
          <dl className="kv wide">
            <dt>{tr("Status")}</dt>
            <dd>
              {check?.error
                ? check.error
                : check?.available
                ? tr("Update available: {latestVersion}", { latestVersion: check.latestVersion })
                : check
                ? tr("No update found")
                : "—"}
            </dd>
            <dt>{tr("Installed")}</dt>
            <dd>{check?.currentVersion || t.version || "—"}</dd>
            <dt>{tr("Latest")}</dt>
            <dd>{check?.latestVersion || "—"}</dd>
            <dt>{tr("Downloads")}</dt>
            <dd>{check ? String(check.downloadCount) : "—"}</dd>
          </dl>
          {check?.notes && <p className="muted small">{check.notes}</p>}
          {check?.page && (
            <button type="button" className="ghost fit" onClick={() => void openLink(check.page!)}>
              {tr("Open release page")}
            </button>
          )}
        </section>
      </div>
      <ManifestFooter editor={editor}>
        <button type="button" className="ghost" disabled={busy || !update.endpoint} onClick={() => void runCheck()}>
          {checking ? tr("Checking…") : tr("Check now")}
        </button>
      </ManifestFooter>
    </div>
  );
}
