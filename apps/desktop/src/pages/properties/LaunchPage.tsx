import { tr } from "../../lib/i18n.ts";
import type * as React from "react";
import { RENDERERS } from "../../lib/util.ts";
import type { Title } from "../../types.ts";
import { ManifestFooter } from "./ManifestFooter.tsx";
import type { ManifestEditor } from "./useManifest.ts";

/** "Low quality (-lq)", with the switch kept whole where the line wraps. */
function switchLabel(text: string) {
  const at = text.lastIndexOf(" (-");
  if (at < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, at)} <span className="option-switch">{text.slice(at + 1)}</span>
    </span>
  );
}

/** One option: a checkbox with its label, and the value it turns on, when it takes one. */
function Option({ label, tip, checked, disabled, onChange, children }: {
  label: string;
  tip: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <label data-tooltip={tip}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled ?? false}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      {switchLabel(label)}
      {children}
    </label>
  );
}

/** A plugin system's DLL. Without the file there is nothing to turn on, and a tick would block Play. */
function PluginOption({ name, tip, shipped, checked, onChange }: {
  name: string;
  tip: string;
  shipped: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Option
      label={name}
      tip={shipped ? tip : tr("This title has no {file}.", { file: `${name}.dll` })}
      checked={checked}
      disabled={!shipped && !checked}
      onChange={onChange}
    />
  );
}

/** A list in the manifest, one entry per line, in order. */
function ListField({ legend, hint, values, disabled, onChange }: {
  legend: string;
  hint: string;
  values: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  return (
    <section className="option-section">
      <div className="section-head">
        <h2 className="eyebrow">{legend}</h2>
        <span className="muted small">{hint}</span>
      </div>
      <textarea
        rows={4}
        spellCheck={false}
        value={values.join("\n")}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value ? e.currentTarget.value.split(/\r?\n/) : [])}
      />
    </section>
  );
}

export function LaunchPage({ t, editor }: { t: Title; editor: ManifestEditor }) {
  const manifest = editor.manifest!;
  const launch = manifest.launch ?? {};
  const loads = manifest.loads ?? {};
  const busy = editor.saving;
  const setLaunch = (next: NonNullable<typeof manifest.launch>) => editor.section("launch", next);
  const setLoads = (next: NonNullable<typeof manifest.loads>) => editor.section("loads", next);
  const renderer = launch.renderer ?? "glide";
  const seed = launch.seed === null || launch.seed === undefined ? "" : String(launch.seed);
  // -nofixaspect and -sndbkg arrived with patch 1.13.
  const from113 = /^1\.1[34]/.test(t.core ?? "");
  // 1.14 starts Blizzard's own Game.exe, with no loader to load any of these.
  const singleExe = /^1\.14/.test(t.core ?? "");
  // Switched off, a value is kept and left out of the launch. Never set, it is on when it has a value.
  const seedOn = launch.seedEnabled ?? Boolean(seed);
  const startActOn = launch.startActEnabled ?? Boolean(launch.startAct);
  const gammaOn = launch.gammaEnabled ?? Boolean(launch.gamma);
  const rendererTips: Record<string, string> = {
    glide: tr("Uses a Glide wrapper such as D2GL or dgVoodoo, which also controls the window."),
    ddraw: tr("Needs no wrapper, and is the only renderer Windowed applies to."),
    d3d: tr("Direct3D. Full screen only in these versions of the game."),
    opengl: tr("OpenGL. Full screen only in these versions of the game."),
  };

  return (
    <div className="page-with-footer">
      <div className="stack">
        <section className="option-section">
          <div className="section-head">
            <h2 className="eyebrow">{tr("LANGUAGE")}</h2>
            <span className="muted small">
              {t.languages.length ? tr("{count} available", { count: t.languages.length }) : tr("MOD")}
            </span>
          </div>
          <select
            value={launch.language ?? "MOD"}
            disabled={busy}
            data-tooltip={tr("The language of the game's text. MOD uses the mod's own text, with no language pack.")}
            onChange={(e) => setLaunch({ language: e.currentTarget.value })}
          >
            <option value="MOD">{tr("MOD")}</option>
            {t.languages.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
        </section>
        <fieldset disabled={busy} className="option-section">
          <legend className="eyebrow">{tr("RENDER MODE")}</legend>
          <div className="radio-grid">
            {Object.entries(RENDERERS).map(([id, label]) => (
              <label key={id} className={renderer === id ? "radio on" : "radio"} data-tooltip={rendererTips[id]}>
                <input
                  type="radio"
                  name="renderer"
                  checked={renderer === id}
                  onChange={() =>
                    setLaunch({ renderer: id })}
                />{" "}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="option-columns">
          <fieldset disabled={busy} className="checks option-section">
            <legend className="eyebrow">{tr("LAUNCH OPTIONS")}</legend>
            <div className="option-list">
              <Option
                label={tr("Windowed")}
                tip={tr("Run in a window instead of full screen. Applies to DirectDraw only.")}
                checked={launch.windowed ?? false}
                onChange={(windowed) => setLaunch({ windowed })}
              />
              <Option
                label={tr("No sound")}
                tip={tr("Start with the game's sound turned off.")}
                checked={launch.noSound ?? false}
                onChange={(noSound) => setLaunch({ noSound })}
              />
              {from113 && (
                <Option
                  label={tr("Sound in the background (-sndbkg)")}
                  tip={tr("Keep the sound playing while another window is in front.")}
                  checked={launch.backgroundSound ?? false}
                  onChange={(backgroundSound) => setLaunch({ backgroundSound })}
                />
              )}
              <Option
                label={tr("Allow hardcore characters")}
                tip={tr("Allow hardcore characters, if the mod permits them.")}
                checked={launch.hardcore ?? true}
                onChange={(hardcore) => setLaunch({ hardcore })}
              />
              <Option
                label={tr("Skip to Battle.net")}
                tip={tr(
                  "Go straight to the Battle.net login instead of the main menu. Needs a mod with its own realm, or the lockdown turned off.",
                )}
                checked={launch.skipToBNet ?? false}
                onChange={(skipToBNet) => setLaunch({ skipToBNet })}
              />
              <Option
                label={tr("Seed")}
                tip={tr("Use this number as the map seed, so single-player maps come out the same each time.")}
                checked={seedOn}
                onChange={(seedEnabled) => setLaunch({ seedEnabled })}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={seed}
                  disabled={!seedOn}
                  placeholder={tr("None")}
                  onChange={(e) => setLaunch({ seed: e.currentTarget.value.replace(/\D/g, "") || null })}
                />
              </Option>
              <Option
                label={tr("Start act")}
                tip={tr("New single-player characters start in this act.")}
                checked={startActOn}
                onChange={(startActEnabled) =>
                  setLaunch({ startActEnabled, startAct: launch.startAct ?? (startActEnabled ? 1 : null) })}
              >
                <select
                  value={launch.startAct ?? 1}
                  disabled={!startActOn}
                  onChange={(e) => setLaunch({ startAct: Number(e.currentTarget.value) as 1 | 2 | 3 | 4 | 5 })}
                >
                  <option value="1">{tr("Act I")}</option>
                  <option value="2">{tr("Act II")}</option>
                  <option value="3">{tr("Act III")}</option>
                  <option value="4">{tr("Act IV")}</option>
                  <option value="5">{tr("Act V")}</option>
                </select>
              </Option>
            </div>
          </fieldset>
          <fieldset disabled={busy} className="checks option-section">
            <legend className="eyebrow">{tr("VIDEO")}</legend>
            <div className="option-list">
              <Option
                label={tr("Perspective (-per)")}
                tip={tr("Draw the game world with depth. Glide, OpenGL and Direct3D only.")}
                checked={launch.perspective ?? false}
                disabled={renderer === "ddraw"}
                onChange={(perspective) => setLaunch({ perspective })}
              />
              <Option
                label={tr("Low quality (-lq)")}
                tip={tr("Use the game's low-quality graphics mode.")}
                checked={launch.lowQuality ?? false}
                onChange={(lowQuality) => setLaunch({ lowQuality })}
              />
              <Option
                label={tr("Vertical sync (-vsync)")}
                tip={tr("Wait for the monitor's refresh before drawing, which stops tearing.")}
                checked={launch.vsync ?? false}
                onChange={(vsync) => setLaunch({ vsync })}
              />
              <Option
                label={tr("Uncompressed sprites (-nocompress)")}
                tip={tr("Keep sprites uncompressed in memory. Uses more memory.")}
                checked={launch.noCompress ?? false}
                onChange={(noCompress) => setLaunch({ noCompress })}
              />
              {from113 && (
                <Option
                  label={tr("No fixed aspect ratio (-nofixaspect)")}
                  tip={tr("Turn off the game's fixed aspect ratio, so the picture can fill the screen.")}
                  checked={launch.noFixAspect ?? false}
                  onChange={(noFixAspect) => setLaunch({ noFixAspect })}
                />
              )}
              <Option
                label={tr("Gamma (-gamma)")}
                tip={tr("The game's brightness, from 1 to 255. The game's own default is 155.")}
                checked={gammaOn}
                onChange={(gammaEnabled) => setLaunch({ gammaEnabled })}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={launch.gamma ?? ""}
                  disabled={!gammaOn}
                  placeholder={tr("Default")}
                  onChange={(e) => {
                    const gamma = Number(e.currentTarget.value.replace(/\D/g, ""));
                    setLaunch({ gamma: gamma >= 1 ? Math.min(gamma, 255) : null });
                  }}
                />
              </Option>
            </div>
          </fieldset>
          <fieldset disabled={busy} className="checks option-section">
            <legend className="eyebrow">{tr("MODDING")}</legend>
            <div className="option-list">
              <Option
                label={tr("Read loose data files (-direct)")}
                tip={tr("Read loose files from the mod's data folder before the MPQs.")}
                checked={launch.direct ?? false}
                onChange={(direct) => setLaunch({ direct })}
              />
              <Option
                label={tr("Compile .txt tables (-txt)")}
                tip={tr("Build the game's data tables from .txt files at startup, rather than reading .bin files.")}
                checked={launch.txt ?? false}
                onChange={(txt) => setLaunch({ txt })}
              />
              {!singleExe && (
                <>
                  <Option
                    label="PlugY"
                    tip={tr(
                      "Load PlugY, for its larger stash and other additions. Uses the mod's PlugY, else the one in the library's plugy folder. Also turns on loose data files.",
                    )}
                    checked={launch.plugY ?? false}
                    onChange={(plugY) => setLaunch({ plugY })}
                  />
                  <PluginOption
                    name="D2Mod"
                    tip={tr("Load D2Mod.dll, which loads the plugins its D2Mod.ini lists.")}
                    shipped={t.pluginFiles.d2mod}
                    checked={loads.d2mod ?? false}
                    onChange={(d2mod) => setLoads({ d2mod })}
                  />
                  <PluginOption
                    name="Nefex"
                    tip={tr(
                      "Load Nefex.dll, for mods built on it. Exordium loads the file but does not start it yet.",
                    )}
                    shipped={t.pluginFiles.nefex}
                    checked={loads.nefex ?? false}
                    onChange={(nefex) => setLoads({ nefex })}
                  />
                  <PluginOption
                    name="D2Extra"
                    tip={tr(
                      "Load D2Extra.dll, for mods built on it. Exordium loads the file but does not start it yet.",
                    )}
                    shipped={t.pluginFiles.d2extra}
                    checked={loads.d2extra ?? false}
                    onChange={(d2extra) => setLoads({ d2extra })}
                  />
                </>
              )}
            </div>
          </fieldset>
        </div>
        <div className="option-columns">
          <ListField
            legend={tr("MPQS")}
            hint={tr("One per line. A later MPQ wins over an earlier one.")}
            values={loads.mpqs ?? []}
            disabled={busy}
            onChange={(mpqs) => setLoads({ mpqs })}
          />
          <ListField
            legend={tr("PLUGIN DLLS")}
            hint={tr("One per line, loaded in this order.")}
            values={loads.dlls ?? []}
            disabled={busy}
            onChange={(dlls) => setLoads({ dlls })}
          />
        </div>
      </div>
      <ManifestFooter editor={editor} />
    </div>
  );
}
