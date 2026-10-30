import { plural, tr } from "../lib/i18n.ts";
import { type Toast, TOAST_MS } from "../hooks/useToasts.ts";

export interface ImportReminder {
  count: number;
  onImport: () => void;
  onNever: () => void;
  onDismiss: () => void;
}

/**
 * The stack over the page. The D2SE reminder stays until it is answered, since it needs one; × puts it
 * off until Exordium next opens, and Never ask again turns it off (Settings, Library turns it back on).
 */
export function Toasts(
  { toasts, size, reminder, onDismiss }: {
    toasts: Toast[];
    size: "small" | "medium" | "large";
    reminder: ImportReminder | null;
    onDismiss: (id: number) => void;
  },
) {
  return (
    <div className={`toasts ${size}`}>
      {reminder && (
        <div className="toast accent" role="status">
          <div className="toast-body">
            <strong>{tr("Import your D2SE mods?")}</strong>
            <span>
              {plural(
                reminder.count,
                "{count} mod is in your Diablo II install. Each is reviewed, then copied into Exordium's library.",
                "{count} mods are in your Diablo II install. Each is reviewed, then copied into Exordium's library.",
              )}
            </span>
            <div className="toast-actions">
              <button type="button" className="ghost primary compact" onClick={reminder.onImport}>
                {tr("Import mods")}
              </button>
              <button type="button" className="ghost compact" onClick={reminder.onNever}>
                {tr("Never ask again")}
              </button>
            </div>
          </div>
          <button type="button" className="toast-close" aria-label={tr("Close")} onClick={reminder.onDismiss}>×</button>
        </div>
      )}
      {toasts.map((toast) => (
        <div className={`toast ${toast.tone}`} role={toast.tone === "bad" ? "alert" : "status"} key={toast.id}>
          <div className="toast-timer">
            <span style={{ animationDuration: `${TOAST_MS}ms` }} />
          </div>
          <span className="toast-body">{toast.text}</span>
          <button
            type="button"
            className="toast-close"
            aria-label={tr("Close")}
            onClick={() =>
              onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
