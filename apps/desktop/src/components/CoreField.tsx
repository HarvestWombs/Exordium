import { tr } from "../lib/i18n.ts";
import { SUPPORTED_CORES } from "../../../../packages/launch/game-exe.ts";

export function CoreField({ value, disabled, onChange }: {
  value: string | null | undefined;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const current = value?.trim() ?? "";
  const known = SUPPORTED_CORES.find((core) => core.toLowerCase() === current.toLowerCase()) ?? null;

  return (
    <section className="option-section">
      <h2 className="eyebrow">{tr("CORE")}</h2>
      <select
        value={known ?? current}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value || null)}
      >
        <option value="" disabled>{tr("Select a core")}</option>
        {current && !known && <option value={current}>{current}</option>}
        {SUPPORTED_CORES.map((core) => <option key={core} value={core}>{core}</option>)}
      </select>
      {current && !known && <span className="warn-text small">{tr("This core is not supported by Exordium.")}</span>}
    </section>
  );
}
