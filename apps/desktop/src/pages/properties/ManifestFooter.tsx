import { tr } from "../../lib/i18n.ts";
import type * as React from "react";
import type { ManifestEditor } from "./useManifest.ts";

/** The foot of a page that edits exordium.mod.json. `children` go before Reset and Apply. */
export function ManifestFooter({ editor, children }: { editor: ManifestEditor; children?: React.ReactNode }) {
  const status = editor.problem ??
    (editor.changed
      ? tr("Unsaved changes")
      : editor.exists
      ? tr("Saved")
      : tr("No exordium.mod.json yet. Apply creates it."));
  return (
    <footer className="dialog-footer">
      <span className={editor.problem ? "error" : "muted small"}>{status}</span>
      <div className="row-actions">
        {children}
        <button type="button" className="ghost" disabled={!editor.changed || editor.saving} onClick={editor.reset}>
          {tr("Reset")}
        </button>
        <button
          type="button"
          className="ghost primary"
          disabled={(!editor.changed && editor.exists) || editor.saving}
          onClick={() => void editor.apply()}
        >
          {editor.saving ? tr("Applying…") : tr("Apply")}
        </button>
      </div>
    </footer>
  );
}
