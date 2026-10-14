import * as React from "react";
import { RENDERERS } from "../../lib/util.ts";
import type { Title, TitleOptions } from "../../types.ts";

export function GeneralPage({ t, root, onChanged }: { t: Title; root: string; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = React.useState<TitleOptions>(t.options);
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const s = { ...(t.settings ?? {}), ...draft } as NonNullable<Title["settings"]> & TitleOptions;
  const changed = JSON.stringify(draft) !== JSON.stringify(t.options);

  React.useEffect(() => {
    setDraft(t.options);
    setProblem(null);
  }, [t.key, t.options]);

  function update(next: TitleOptions) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function apply() {
    setSaving(true);
    setProblem(null);
    try {
      const response = await fetch("/api/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root,
          ...(t.kind === "core" ? { core: t.folder } : { folder: t.folder }),
          options: draft,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save options.");
      setDraft(body.options ?? draft);
      await onChanged();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-with-footer">
      <div className="stack">
        {!t.settings && <p className="muted">This title has no D2SE_SETUP.ini to launch from.</p>}
        {t.settings && (
          <>
            <section className="option-section">
              <div className="section-head">
                <h2 className="eyebrow">LANGUAGE</h2>
                <span className="muted small">{t.languages.length ? `${t.languages.length} available` : "MOD"}</span>
              </div>
              <select
                value={s.language ?? "MOD"}
                disabled={saving}
                onChange={(e) => update({ language: e.currentTarget.value })}
              >
                <option value="MOD">MOD</option>
                {t.languages.map((language) => <option key={language} value={language}>{language}</option>)}
              </select>
            </section>
            <fieldset disabled={saving} className="option-section">
              <legend className="eyebrow">RENDER MODE</legend>
              <div className="radio-grid">
                {Object.entries(RENDERERS).map(([id, label]) => (
                  <label key={id} className={s.renderer === id ? "radio on" : "radio"}>
                    <input
                      type="radio"
                      name="renderer"
                      checked={s.renderer === id}
                      onChange={() =>
                        update({ renderer: id })}
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={saving} className="checks option-section">
              <legend className="eyebrow">LAUNCH OPTIONS</legend>
              <label>
                <input
                  type="checkbox"
                  checked={s.windowed}
                  onChange={(e) => update({ windowed: e.currentTarget.checked })}
                />{" "}
                Windowed
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.noSound}
                  onChange={(e) => update({ noSound: e.currentTarget.checked })}
                />{" "}
                No sound
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.hardcore}
                  onChange={(e) => update({ hardcore: e.currentTarget.checked })}
                />{" "}
                Allow hardcore characters
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={s.skipToBNet ?? false}
                  onChange={(e) => update({ skipToBNet: e.currentTarget.checked })}
                />{" "}
                Skip to Battle.net
              </label>
              <label>
                <input type="checkbox" checked={s.plugY} onChange={(e) => update({ plugY: e.currentTarget.checked })} />
                {" "}
                PlugY
              </label>
              <label>
                Seed{" "}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={s.seed ?? ""}
                  placeholder="None"
                  onChange={(e) => update({ seed: e.currentTarget.value.replace(/\D/g, "") || null })}
                />
              </label>
              <label>
                Start act{" "}
                <select
                  value={s.startAct ?? ""}
                  onChange={(e) =>
                    update({
                      startAct: e.currentTarget.value ? Number(e.currentTarget.value) as 1 | 2 | 3 | 4 | 5 : null,
                    })}
                >
                  <option value="">Normal</option>
                  <option value="1">Act I</option>
                  <option value="2">Act II</option>
                  <option value="3">Act III</option>
                  <option value="4">Act IV</option>
                  <option value="5">Act V</option>
                </select>
              </label>
            </fieldset>
            <fieldset disabled={saving} className="checks option-section">
              <legend className="eyebrow">MODDING</legend>
              <label>
                <input
                  type="checkbox"
                  checked={s.direct}
                  onChange={(e) => update({ direct: e.currentTarget.checked })}
                />{" "}
                Read loose data files (-direct)
              </label>
              <label>
                <input type="checkbox" checked={s.txt} onChange={(e) => update({ txt: e.currentTarget.checked })} />
                {" "}
                Compile .txt tables (-txt)
              </label>
            </fieldset>
          </>
        )}
      </div>
      <footer className="dialog-footer">
        <span className={problem ? "error" : "muted small"}>{problem ?? (changed ? "Unsaved changes" : "Saved")}</span>
        <div className="row-actions">
          <button type="button" className="ghost" disabled={!changed || saving} onClick={() => setDraft(t.options)}>
            Reset
          </button>
          <button type="button" className="ghost primary" disabled={!changed || saving} onClick={() => void apply()}>
            {saving ? "Applying…" : "Apply"}
          </button>
        </div>
      </footer>
    </div>
  );
}
