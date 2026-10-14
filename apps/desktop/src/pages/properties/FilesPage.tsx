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
    if (!response.ok) setResult((await response.json()).error ?? "Could not open the folder.");
  }

  async function build(action: "rebuild" | "verify") {
    const settings = action === "rebuild"
      ? await fetch("/api/app-settings").then((r) => r.json()).then((body) => body.settings as AppPreferences)
        .catch(() => null)
      : null;
    if (
      action === "rebuild" && settings?.boxes.confirmRebuild !== false &&
      !confirm(`Rebuild ${t.title}'s box? Its links and copied files are brought up to date; saves are not touched.`)
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
        throw new Error(body.error ?? (action === "verify" ? "Could not verify the box." : "Could not build the box."));
      }
      if (action === "verify") {
        const issues = body.issues ?? [];
        setResult(
          body.ok
            ? `Integrity OK: ${body.checkedFiles} files checked (${body.checkedHashes} hashes) in ${body.folder}`
            : `Integrity found ${issues.length} issue${issues.length === 1 ? "" : "s"}: ${
              issues.slice(0, 4).map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`)
                .join("; ")
            }${issues.length > 4 ? "; ..." : ""}`,
        );
      } else {
        setResult(`${body.files} files ready in ${body.folder}`);
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
        <h2 className="eyebrow">INSTALLATION LOCATION</h2>
        <div className="path-row">
          <code className="path-box">{installLocation(root, t)}</code>
          <button type="button" className="ghost" onClick={() => void openFolder()}>
            <FolderIcon /> Open folder
          </button>
        </div>
      </section>
      <section className="option-section">
        <h2 className="eyebrow">ARCHIVES</h2>
        <p className="muted small">{t.files} files of its own · archives load in this order, highest priority last.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Kind</th>
              <th>Archive</th>
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
        <h2 className="eyebrow">ACTIONS</h2>
        <div className="row-actions">
          <button type="button" className="ghost" disabled>
            Create Backup
          </button>
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => void build("rebuild")}>
            {busy === "rebuild" ? "Rebuilding…" : "Rebuild Box"}
          </button>
          <button type="button" className="ghost" disabled={busy !== null} onClick={() => void build("verify")}>
            {busy === "verify" ? "Verifying…" : "Verify Integrity"}
          </button>
        </div>
        {result && <p className="muted small">{result}</p>}
      </section>
    </div>
  );
}
