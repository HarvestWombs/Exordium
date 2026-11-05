import { tr } from "../lib/i18n.ts";
import * as React from "react";
import type { ImportMode } from "../hooks/useConversions.ts";
import { formatSize } from "../lib/util.ts";

/**
 * Asked when the converter's Import is pressed: how the mod goes into the library. Link comes first
 * and is chosen to begin with; each choice says what it costs.
 */
export function ImportModeDialog(
  { title, size, fromInstall, onImport, onCancel }: {
    title: string;
    /** The mod folder's size in bytes, 0 while it is still measured. */
    size: number;
    /** It comes from the Diablo II install's MODS folder, not a folder chosen by hand. */
    fromInstall: boolean;
    onImport: (mode: ImportMode) => void;
    onCancel: () => void;
  },
) {
  const [mode, setMode] = React.useState<ImportMode>("link");
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onCancel]);
  const space = size ? formatSize(size) : tr("its size");
  const choices: { id: ImportMode; label: string; pros: string; cons: string }[] = [
    {
      id: "link",
      label: tr("Link"),
      pros: tr("Instant, and takes no extra disk space."),
      cons: tr(
        "The original folder has to stay where it is. Characters saved in Exordium are the original's files, so it changes them too. Without symbolic links, files on another drive are copied.",
      ),
    },
    {
      id: "copy",
      label: tr("Copy"),
      pros: tr("The library's copy stands on its own; the original is never changed."),
      cons: tr("Uses {size} more disk space, and a large mod takes a while.", { size: space }),
    },
    {
      id: "move",
      label: tr("Move"),
      pros: tr("No extra disk space, and instant on the same drive."),
      cons: fromInstall
        ? tr("The mod leaves your Diablo II install, so D2SE can no longer start it.")
        : tr("The mod leaves the folder it was in."),
    },
  ];
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm import-dialog" role="dialog" aria-labelledby="import-mode-title">
        <h2 id="import-mode-title">{tr("Import {title}", { title })}</h2>
        <p>{tr("How should it go into Exordium's library?")}</p>
        <div className="import-choices" role="radiogroup">
          {choices.map((choice) => (
            <button
              type="button"
              key={choice.id}
              role="radio"
              aria-checked={mode === choice.id}
              className={`import-choice${mode === choice.id ? " on" : ""}`}
              onClick={() => setMode(choice.id)}
              onDoubleClick={() => onImport(choice.id)}
            >
              <strong>{choice.label}</strong>
              <span className="good-text">+ {choice.pros}</span>
              <span className="warn-text">− {choice.cons}</span>
            </button>
          ))}
        </div>
        <div className="row-actions">
          <button type="button" className="ghost" onClick={onCancel}>{tr("Cancel")}</button>
          <button type="button" className="ghost primary" onClick={() => onImport(mode)}>
            {mode === "link" ? tr("Link") : mode === "move" ? tr("Move") : tr("Copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
