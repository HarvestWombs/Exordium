import { tr } from "../lib/i18n.ts";
import * as React from "react";
import type { ConfirmRequest, NameRequest } from "../types.ts";

/** Asks for a name: a new collection, or a new name for one. */
export function NameDialog({ request, onClose }: { request: NameRequest; onClose: () => void }) {
  const [name, setName] = React.useState(request.initial);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  async function run() {
    if (!name.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      await request.run(name.trim());
      onClose();
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        className="confirm"
        role="dialog"
        aria-labelledby="name-title"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <h2 id="name-title">{request.title}</h2>
        <input
          className="name-input"
          value={name}
          maxLength={60}
          autoFocus
          disabled={busy}
          placeholder={tr("Name")}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        {problem && <p className="bad-text small">{problem}</p>}
        <div className="row-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>{tr("Cancel")}</button>
          <button type="submit" className="ghost primary" disabled={busy || !name.trim()}>
            {busy ? tr("Working…") : request.action}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [checked, setChecked] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  async function run() {
    setBusy(true);
    setProblem(null);
    try {
      await request.run(checked);
      onClose();
    } catch (err) {
      setProblem((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="confirm" role="alertdialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.body}</p>
        {request.checkbox && (
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={checked}
              disabled={busy}
              onChange={(e) => setChecked(e.currentTarget.checked)}
            />
            {request.checkbox}
          </label>
        )}
        {problem && <p className="bad-text small">{problem}</p>}
        <div className="row-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>
            {request.dismiss ?? tr("Cancel")}
          </button>
          <button
            type="button"
            className={request.danger ? "ghost danger" : "ghost primary"}
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? tr("Working…") : request.action}
          </button>
        </div>
      </div>
    </div>
  );
}
