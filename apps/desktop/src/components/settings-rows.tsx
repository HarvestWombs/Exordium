import type { ReactNode } from "react";
import { openAppFolder } from "../lib/util.ts";

export function SettingsHead({ title, text }: { title: string; text: string }) {
  return (
    <div className="settings-page-head">
      <h1>{title}</h1>
      <p className="muted">{text}</p>
    </div>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="option-section settings-group">
      <h2 className="eyebrow">{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

export function ToggleRow(
  { label, hint, checked, disabled, onChange }: {
    label: string;
    hint?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (value: boolean) => void;
  },
) {
  return (
    <label className="settings-row">
      <span className="settings-label">
        {label}
        {hint && <small className="settings-hint">{hint}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

export function SelectRow(
  { label, hint, value, options, disabled, onChange }: {
    label: string;
    hint?: string;
    value: string;
    options: [string, string][];
    disabled?: boolean;
    onChange: (value: string) => void;
  },
) {
  return (
    <label className="settings-row">
      <span className="settings-label">
        {label}
        {hint && <small className="settings-hint">{hint}</small>}
      </span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>
  );
}

export function NumberRow(
  { label, hint, value, min, max, disabled, onChange }: {
    label: string;
    hint?: string;
    value: number;
    min: number;
    max: number;
    disabled?: boolean;
    onChange: (value: number) => void;
  },
) {
  return (
    <label className="settings-row">
      <span className="settings-label">
        {label}
        {hint && <small className="settings-hint">{hint}</small>}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

export function PathRow({ label, value, openKey }: { label: string; value: string; openKey?: string }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <div className="path-actions">
        <code>{value}</code>
        {openKey && (
          <button type="button" className="ghost" onClick={() => void openAppFolder(openKey)}>
            Open
          </button>
        )}
      </div>
    </div>
  );
}
