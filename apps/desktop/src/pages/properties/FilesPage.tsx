import { plural, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { FolderIcon } from "../../components/icons.tsx";
import { installLocation } from "../../lib/util.ts";
import type { AppPreferences, Title } from "../../types.ts";

export function FilesPage({ t, root }: { t: Title; root: string }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);

  async function openFolder() {
    const response = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, key: t.key }),
    });
    if (!response.ok) setResult((await response.json()).error ?? tr("Could not open the folder."));
  }

  async function build(action: "rebuild" | "verify") {
    const settings = action === "rebuild"
      ? await fetch("/api/app-settings").then((r) => r.json()).then((body) => body.settings as AppPreferences)
        .catch(() => null)
      : null;
    if (
      action === "rebuild" && settings?.boxes.confirmRebuild !== false &&
      !confirm(
        tr("Rebuild {title}'s box? Its links and copied files are brought up to date; saves are not touched.", {
          title: t.title,
        }),
      )
    ) return;
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch("/api/build-box", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(t.kind === "core" ? { root, core: t.folder, action } : { root, folder: t.folder, action }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body.error ?? (action === "verify" ? tr("Could not verify the box.") : tr("Could not build the box.")),
        );
      }
      if (action === "verify") {
        const issues = body.issues ?? [];
        setResult(
          body.ok
            ? tr("Integrity OK: {checkedFiles} files checked ({checkedHashes} hashes) in {folder}", {
              checkedFiles: body.checkedFiles,
              checkedHashes: body.checkedHashes,
              folder: body.folder,
            })
            : plural(issues.length, "Integrity found {count} issue: {list}", "Integrity found {count} issues: {list}", {
              list: issues.slice(0, 4).map((issue: { path: string; message: string }) =>
                `${issue.path}: ${issue.message}`
              )
                .join("; ") + (issues.length > 4 ? "; ..." : ""),
            }),
        );
      } else {
        setResult(tr("{files} files ready in {folder}", { files: body.files, folder: body.folder }));
      }
    } catch (error) {
      setResult((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <section className="option-section">
        <h2 className="eyebrow">{tr("INSTALLATION LOCATION")}</h2>
        <div className="path-row">
          <code className="path-box">{installLocation(root, t)}</code>
          <button type="button" className="ghost" onClick={() => void openFolder()}>
            <FolderIcon /> {tr("Open folder")}
          </button>
        </div>
      </section>
      <section className="option-section">
        <h2 className="eyebrow">{tr("ARCHIVES")}</h2>
        <p className="muted small">
          {tr("{files} files of its own · archives load in this order, highest priority last.", { files: t.files })}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>{tr("Priority")}</th>
              <th>{tr("Kind")}</th>
              <th>{tr("Archive")}</th>
            </tr>
          </thead>
          <tbody>
            {t.archives.map((a) => (
              <tr key={`${a.priority}-${a.path}`}>
                <td>{a.priority}</td>
                <td>{a.kind}</td>
                <td>{a.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="option-section">
        <h2 className="eyebrow">{tr("ACTIONS")}</h2>
        <div className="row-actions">
          <button type="button" className="ghost" disabled>
            {tr("Create Backup")}
          </button>
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => void build("rebuild")}>
            {busy === "rebuild" ? tr("Rebuilding…") : tr("Rebuild Box")}
          </button>
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => void build("verify")}>
            {busy === "verify" ? tr("Verifying…") : tr("Verify Integrity")}
          </button>
        </div>
        {result && <p className="muted small">{result}</p>}
      </section>
    </div>
  );
}
