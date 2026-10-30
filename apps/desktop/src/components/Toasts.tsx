import { tr } from "../lib/i18n.ts";
import type { Toast } from "../hooks/useToasts.ts";

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div className="toast" role="alert" key={toast.id}>
          <span>{toast.text}</span>
          <button type="button" aria-label={tr("Close")} onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
