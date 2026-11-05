import { plural, tr } from "../lib/i18n.ts";
import { type Toast, TOAST_MS } from "../hooks/useToasts.ts";

/** A downloaded update not put off yet: its version, the running one, and what to do about it. */
export interface ReadyUpdate {
  version: string;
  current: string;
  onRestart: () => void;
  onLater: () => void;
  /** Opens Settings > Updates, where the patch notes are. */
  onNotes: () => void;
}

export interface ImportReminder {
  count: number;
  onImport: () => void;
  onNever: () => void;
  onDismiss: () => void;
}

/** The badge's glyphs: a download for the update, a box for the import, a check, and an alert. */
const ICONS = {
  update: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  import: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  good: "M5 12.5l4.5 4.5L19 7.5",
  bad: "M12 7v6M12 16.5v.5",
} as const;

function Badge({ icon }: { icon: keyof typeof ICONS }) {
  return (
    <div className="toast-badge" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={ICONS[icon]} />
      </svg>
    </div>
  );
}

function Close({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="toast-close" aria-label={label} data-tooltip={label} onClick={onClick}>
      ×
    </button>
  );
}

/**
 * A downloaded update, at the top of the stack until it is answered: restart now, read what is new,
 * or later (× too), which puts this version off until Exordium next opens.
 */
function UpdateToast({ update }: { update: ReadyUpdate }) {
  return (
    <div className="toast accent" role="status">
      <Badge icon="update" />
      <div className="toast-body">
        <span className="toast-eyebrow">{tr("Update ready")}</span>
        <strong className="toast-title">{tr("Exordium {version} is ready", { version: update.version })}</strong>
        <span className="toast-chip">
          <span>{update.current}</span>
          <span aria-hidden="true">→</span>
          <span className="next">{update.version}</span>
        </span>
        <span className="toast-text">
          {tr("Restart to finish. Your library, boxes and characters stay as they are.")}
        </span>
        <div className="toast-actions">
          <button type="button" className="toast-primary" onClick={update.onRestart}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
            </svg>
            {tr("Restart now")}
          </button>
          <button type="button" className="toast-link" onClick={update.onNotes}>{tr("What's new")}</button>
          <button type="button" className="toast-link" onClick={update.onLater}>{tr("Later")}</button>
        </div>
      </div>
      <Close label={tr("Later")} onClick={update.onLater} />
    </div>
  );
}

/**
 * The stack over the page. The update and the D2SE reminder stay until they are answered, since each
 * needs one; × on the reminder puts it off until Exordium next opens, and Never ask again turns it off
 * (Settings, Library turns it back on). Errors and notices go by themselves after TOAST_MS.
 */
export function Toasts(
  { toasts, size, update, reminder, onDismiss }: {
    toasts: Toast[];
    size: "small" | "medium" | "large";
    update: ReadyUpdate | null;
    reminder: ImportReminder | null;
    onDismiss: (id: number) => void;
  },
) {
  return (
    <div className={`toasts ${size}`}>
      {update && <UpdateToast update={update} />}
      {reminder && (
        <div className="toast accent" role="status">
          <Badge icon="import" />
          <div className="toast-body">
            <span className="toast-eyebrow">{tr("D2SE import")}</span>
            <strong className="toast-title">{tr("Import your D2SE mods?")}</strong>
            <span className="toast-text">
              {plural(
                reminder.count,
                "{count} mod is in your Diablo II install. Each is reviewed, then copied into Exordium's library.",
                "{count} mods are in your Diablo II install. Each is reviewed, then copied into Exordium's library.",
              )}
            </span>
            <div className="toast-actions">
              <button type="button" className="toast-primary" onClick={reminder.onImport}>
                {tr("Import mods")}
              </button>
              <button type="button" className="toast-link" onClick={reminder.onNever}>
                {tr("Never ask again")}
              </button>
            </div>
          </div>
          <Close label={tr("Close")} onClick={reminder.onDismiss} />
        </div>
      )}
      {toasts.map((toast) => (
        <div className={`toast ${toast.tone}`} role={toast.tone === "bad" ? "alert" : "status"} key={toast.id}>
          <Badge icon={toast.tone} />
          <div className="toast-body">
            <span className="toast-eyebrow">{toast.tone === "bad" ? tr("Error") : tr("Done")}</span>
            <span className="toast-message">{toast.text}</span>
          </div>
          <Close
            label={tr("Close")}
            onClick={() =>
              onDismiss(toast.id)}
          />
          <div className="toast-timer">
            <span style={{ animationDuration: `${TOAST_MS}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
