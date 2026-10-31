import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { baseName } from "./browse-util.ts";

export function InstallModModal(
  { request, defaultRoot, onInstall, onClose }: {
    request: { file: string; title: string; mode: "archive" | "downloaded" | "url"; url?: string };
    /** Exordium's library: every install goes into it. */
    defaultRoot: string;
    onInstall: (root: string, importMetadata: boolean) => Promise<void>;
    onClose: () => void;
  },
) {
  const folder = defaultRoot.replaceAll("/", "\\");
  const [importMetadata, setImportMetadata] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ready = folder.trim().length > 0;
  const target = folder.trim().replace(/[\\/]+$/, "").replaceAll("/", "\\");
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !busy && onClose();
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  async function run() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onInstall(folder.trim(), importMetadata);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const what = request.mode === "url"
    ? tr(
      "Downloads the archive, unpacks it and adds it to the Diablo II install below. Existing mod folders are never overwritten.",
    )
    : request.mode === "downloaded"
    ? tr(
      "Unpacks {file} and adds it to the Diablo II install below. Existing mod folders are never overwritten.",
      { file: baseName(request.file) },
    )
    : tr(
      "Downloads {file}, unpacks it and adds it to the Diablo II install below. Existing mod folders are never overwritten.",
      { file: baseName(request.file) },
    );
  return (
    <div className="scrim" role="presentation" onMouseDown={() => !busy && onClose()}>
      <form
        className="install-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Install {title}", { title: request.title })}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <h2>{tr("Install {title}", { title: request.title })}</h2>
        <p className="muted">
          {what}
        </p>
        {target && <p className="muted small">{tr("Installs into {target}\\mods", { target })}</p>}
        <label className="confirm-check">
          <input
            type="checkbox"
            checked={importMetadata}
            disabled={busy}
            onChange={(event) => setImportMetadata(event.currentTarget.checked)}
          />
          {tr("Draft an exordium.mod.json from its D2SE_SETUP.ini")}
        </label>
        {error && <p className="bad-text small" role="alert">{error}</p>}
        <div className="row-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>{tr("Cancel")}</button>
          <button type="submit" className="ghost primary action-install" disabled={busy || !ready}>
            {busy ? tr("Starting…") : tr("Install")}
          </button>
        </div>
      </form>
    </div>
  );
}
