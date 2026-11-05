import { tr } from "../lib/i18n.ts";
import { RENDERERS } from "../lib/util.ts";
import type { ModManifest, TitleUpdateSettings } from "../types.ts";
import * as React from "react";
import { CoreField } from "./CoreField.tsx";

type Page = "about" | "launch" | "updates" | "realm" | "art";
type Section = "art" | "launch" | "loads" | "realm" | "update";

function TextField({ label, value, placeholder, disabled, onChange }: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <section className="option-section">
      <h2 className="eyebrow">{label}</h2>
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value || null)}
      />
    </section>
  );
}

function Check({ label, checked, disabled, onChange, children }: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
      {children}
    </label>
  );
}

function Lines({ label, hint, value, disabled, onChange }: {
  label: string;
  hint: string;
  value: string[] | null | undefined;
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <section className="option-section">
      <div className="section-head">
        <h2 className="eyebrow">{label}</h2>
        <span className="muted small">{hint}</span>
      </div>
      <textarea
        rows={4}
        spellCheck={false}
        value={(value ?? []).join("\n")}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value ? event.currentTarget.value.split(/\r?\n/) : [])}
      />
    </section>
  );
}

/** The complete native manifest form used before a D2SE mod enters the library. */
export function ManifestImportForm({ manifest, folder, disabled, onChange, actions }: {
  manifest: ModManifest;
  folder: string;
  disabled: boolean;
  onChange: (manifest: ModManifest) => void;
  /** Buttons at the right end of the tab bar: the converter's Close and Import. */
  actions?: React.ReactNode;
}) {
  const [page, setPage] = React.useState<Page>("about");
  const set = (next: Partial<ModManifest>) => onChange({ ...manifest, ...next });
  const section = <Name extends Section>(name: Name, next: NonNullable<ModManifest[Name]>) =>
    onChange({ ...manifest, [name]: { ...(manifest[name] as object | null | undefined), ...next } });
  const launch = manifest.launch ?? {};
  const loads = manifest.loads ?? {};
  const update = manifest.update ?? {};
  const realm = manifest.realm ?? {};
  const art = manifest.art ?? {};
  const links = manifest.links ?? [];
  const renderer = launch.renderer ?? "glide";
  const seed = launch.seed == null ? "" : String(launch.seed);
  const seedOn = launch.seedEnabled ?? Boolean(seed);
  const actOn = launch.startActEnabled ?? Boolean(launch.startAct);
  const gammaOn = launch.gammaEnabled ?? Boolean(launch.gamma);

  const pages: [Page, string][] = [
    ["about", tr("About")],
    ["launch", tr("Launch")],
    ["updates", tr("Updates")],
    ["realm", tr("Realm")],
    ["art", tr("Art")],
  ];

  return (
    <div className="manifest-import-form">
      <nav className="manifest-import-nav" aria-label={tr("Properties")}>
        {pages.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={page === id ? "on" : ""}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
        {actions && <div className="manifest-import-actions">{actions}</div>}
      </nav>

      <div className="manifest-import-page stack">
        {page === "about" && (
          <>
            <TextField
              label={tr("NAME")}
              value={manifest.title}
              placeholder={folder}
              disabled={disabled}
              onChange={(title) => set({ title })}
            />
            <div className="option-columns">
              <TextField
                label={tr("VERSION")}
                value={manifest.version}
                placeholder="1.0.0"
                disabled={disabled}
                onChange={(version) => set({ version })}
              />
              <TextField
                label={tr("AUTHOR")}
                value={manifest.author}
                placeholder={tr("Who made this mod")}
                disabled={disabled}
                onChange={(author) => set({ author })}
              />
              <CoreField
                value={manifest.core}
                disabled={disabled}
                onChange={(core) => set({ core })}
              />
            </div>
            <section className="option-section">
              <h2 className="eyebrow">{tr("DESCRIPTION")}</h2>
              <textarea
                rows={5}
                value={manifest.description ?? ""}
                disabled={disabled}
                onChange={(event) => set({ description: event.currentTarget.value || null })}
              />
            </section>
            <TextField
              label={tr("README")}
              value={manifest.readme}
              placeholder="Documentation/ReadMe.txt"
              disabled={disabled}
              onChange={(readme) => set({ readme })}
            />
            <section className="option-section">
              <h2 className="eyebrow">{tr("LINKS")}</h2>
              {links.map((link, index) => (
                <div className="link-row" key={index}>
                  <input
                    type="text"
                    value={link.label ?? ""}
                    placeholder={tr("Label (Discord, Website…)")}
                    disabled={disabled}
                    onChange={(event) =>
                      set({
                        links: links.map((item, at) =>
                          at === index ? { ...item, label: event.currentTarget.value } : item
                        ),
                      })}
                  />
                  <input
                    type="text"
                    value={link.url}
                    placeholder="https://…"
                    disabled={disabled}
                    onChange={(event) =>
                      set({
                        links: links.map((item, at) =>
                          at === index ? { ...item, url: event.currentTarget.value } : item
                        ),
                      })}
                  />
                  <button
                    type="button"
                    className="ghost"
                    disabled={disabled}
                    onClick={() => set({ links: links.filter((_, at) => at !== index) })}
                  >
                    {tr("Remove")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost add-link"
                disabled={disabled}
                onClick={() => set({ links: [...links, { label: "", url: "" }] })}
              >
                {tr("Add link")}
              </button>
            </section>
          </>
        )}

        {page === "launch" && (
          <>
            <TextField
              label={tr("LANGUAGE")}
              value={launch.language}
              placeholder="MOD"
              disabled={disabled}
              onChange={(language) => section("launch", { language })}
            />
            <fieldset disabled={disabled} className="option-section">
              <legend className="eyebrow">{tr("RENDER MODE")}</legend>
              <div className="radio-grid">
                {Object.entries(RENDERERS).map(([id, label]) => (
                  <label key={id} className={renderer === id ? "radio on" : "radio"}>
                    <input
                      type="radio"
                      name="import-renderer"
                      checked={renderer === id}
                      onChange={() =>
                        section("launch", { renderer: id })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="option-columns manifest-check-columns">
              <fieldset disabled={disabled} className="checks option-section">
                <legend className="eyebrow">{tr("LAUNCH OPTIONS")}</legend>
                <div className="option-list">
                  <Check
                    label={tr("Windowed")}
                    checked={launch.windowed ?? false}
                    disabled={disabled}
                    onChange={(windowed) => section("launch", { windowed })}
                  />
                  <Check
                    label={tr("No sound")}
                    checked={launch.noSound ?? false}
                    disabled={disabled}
                    onChange={(noSound) => section("launch", { noSound })}
                  />
                  <Check
                    label={tr("Sound in the background (-sndbkg)")}
                    checked={launch.backgroundSound ?? false}
                    disabled={disabled}
                    onChange={(backgroundSound) => section("launch", { backgroundSound })}
                  />
                  <Check
                    label={tr("Allow hardcore characters")}
                    checked={launch.hardcore ?? true}
                    disabled={disabled}
                    onChange={(hardcore) => section("launch", { hardcore })}
                  />
                  <Check
                    label={tr("Skip to Battle.net")}
                    checked={launch.skipToBNet ?? false}
                    disabled={disabled}
                    onChange={(skipToBNet) => section("launch", { skipToBNet })}
                  />
                  <Check
                    label={tr("Seed")}
                    checked={seedOn}
                    disabled={disabled}
                    onChange={(seedEnabled) => section("launch", { seedEnabled })}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      value={seed}
                      disabled={disabled || !seedOn}
                      onChange={(event) =>
                        section("launch", { seed: event.currentTarget.value.replace(/\D/g, "") || null })}
                    />
                  </Check>
                  <Check
                    label={tr("Start act")}
                    checked={actOn}
                    disabled={disabled}
                    onChange={(startActEnabled) =>
                      section("launch", { startActEnabled, startAct: launch.startAct ?? (startActEnabled ? 1 : null) })}
                  >
                    <select
                      value={launch.startAct ?? 1}
                      disabled={disabled || !actOn}
                      onChange={(event) =>
                        section("launch", { startAct: Number(event.currentTarget.value) as 1 | 2 | 3 | 4 | 5 })}
                    >
                      <option value="1">{tr("Act I")}</option>
                      <option value="2">{tr("Act II")}</option>
                      <option value="3">{tr("Act III")}</option>
                      <option value="4">{tr("Act IV")}</option>
                      <option value="5">{tr("Act V")}</option>
                    </select>
                  </Check>
                </div>
              </fieldset>
              <fieldset disabled={disabled} className="checks option-section">
                <legend className="eyebrow">{tr("VIDEO")}</legend>
                <div className="option-list">
                  <Check
                    label={tr("Perspective (-per)")}
                    checked={launch.perspective ?? false}
                    disabled={disabled}
                    onChange={(perspective) => section("launch", { perspective })}
                  />
                  <Check
                    label={tr("Low quality (-lq)")}
                    checked={launch.lowQuality ?? false}
                    disabled={disabled}
                    onChange={(lowQuality) => section("launch", { lowQuality })}
                  />
                  <Check
                    label={tr("Vertical sync (-vsync)")}
                    checked={launch.vsync ?? false}
                    disabled={disabled}
                    onChange={(vsync) => section("launch", { vsync })}
                  />
                  <Check
                    label={tr("Uncompressed sprites (-nocompress)")}
                    checked={launch.noCompress ?? false}
                    disabled={disabled}
                    onChange={(noCompress) => section("launch", { noCompress })}
                  />
                  <Check
                    label={tr("No fixed aspect ratio (-nofixaspect)")}
                    checked={launch.noFixAspect ?? false}
                    disabled={disabled}
                    onChange={(noFixAspect) => section("launch", { noFixAspect })}
                  />
                  <Check
                    label={tr("Gamma (-gamma)")}
                    checked={gammaOn}
                    disabled={disabled}
                    onChange={(gammaEnabled) => section("launch", { gammaEnabled })}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      value={launch.gamma ?? ""}
                      disabled={disabled || !gammaOn}
                      onChange={(event) => {
                        const gamma = Number(event.currentTarget.value.replace(/\D/g, ""));
                        section("launch", { gamma: gamma >= 1 ? Math.min(gamma, 255) : null });
                      }}
                    />
                  </Check>
                </div>
              </fieldset>
              <fieldset disabled={disabled} className="checks option-section">
                <legend className="eyebrow">{tr("MODDING")}</legend>
                <div className="option-list">
                  <Check
                    label={tr("Read loose data files (-direct)")}
                    checked={launch.direct ?? false}
                    disabled={disabled}
                    onChange={(direct) => section("launch", { direct })}
                  />
                  <Check
                    label={tr("Compile .txt tables (-txt)")}
                    checked={launch.txt ?? false}
                    disabled={disabled}
                    onChange={(txt) => section("launch", { txt })}
                  />
                  <Check
                    label="PlugY"
                    checked={launch.plugY ?? false}
                    disabled={disabled}
                    onChange={(plugY) => section("launch", { plugY })}
                  />
                  <Check
                    label="D2Mod"
                    checked={loads.d2mod ?? false}
                    disabled={disabled}
                    onChange={(d2mod) => section("loads", { d2mod })}
                  />
                  <Check
                    label="Nefex"
                    checked={loads.nefex ?? false}
                    disabled={disabled}
                    onChange={(nefex) => section("loads", { nefex })}
                  />
                  <Check
                    label="D2Extra"
                    checked={loads.d2extra ?? false}
                    disabled={disabled}
                    onChange={(d2extra) => section("loads", { d2extra })}
                  />
                </div>
              </fieldset>
            </div>
            <div className="option-columns">
              <Lines
                label={tr("MPQS")}
                hint={tr("One per line. A later MPQ wins over an earlier one.")}
                value={loads.mpqs}
                disabled={disabled}
                onChange={(mpqs) => section("loads", { mpqs })}
              />
              <Lines
                label={tr("PLUGIN DLLS")}
                hint={tr("One per line, loaded in this order.")}
                value={loads.dlls}
                disabled={disabled}
                onChange={(dlls) => section("loads", { dlls })}
              />
            </div>
          </>
        )}

        {page === "updates" && (
          <>
            <fieldset disabled={disabled} className="checks option-section">
              <legend className="eyebrow">{tr("AUTOMATIC UPDATES")}</legend>
              <Check
                label={tr("Automatic updates")}
                checked={update.automatic ?? true}
                disabled={disabled}
                onChange={(automatic) => section("update", { automatic })}
              />
              <Check
                label={tr("Allow background downloads")}
                checked={update.background ?? true}
                disabled={disabled}
                onChange={(background) => section("update", { background })}
              />
            </fieldset>
            <TextField
              label={tr("Manifest URL or file")}
              value={update.endpoint}
              placeholder="updates.json, https://example.com/mod.json"
              disabled={disabled}
              onChange={(endpoint) => section("update", { endpoint })}
            />
            <section className="option-section">
              <h2 className="eyebrow">{tr("Channel")}</h2>
              <select
                value={update.channel ?? "stable"}
                disabled={disabled}
                onChange={(event) =>
                  section("update", { channel: event.currentTarget.value as TitleUpdateSettings["channel"] })}
              >
                <option value="stable">{tr("Stable")}</option>
                <option value="testing">{tr("Testing")}</option>
                <option value="local">{tr("Local files only")}</option>
              </select>
            </section>
          </>
        )}

        {page === "realm" && (
          <div className="option-columns">
            <TextField
              label={tr("Gateway")}
              value={realm.gateway}
              placeholder="realm.example.com"
              disabled={disabled}
              onChange={(gateway) => section("realm", { gateway })}
            />
            <TextField
              label={tr("Port")}
              value={realm.port}
              placeholder="6112"
              disabled={disabled}
              onChange={(port) => section("realm", { port })}
            />
            <TextField
              label={tr("Name")}
              value={realm.gatewayName}
              disabled={disabled}
              onChange={(gatewayName) => section("realm", { gatewayName })}
            />
            <TextField
              label={tr("Selected")}
              value={realm.selected}
              disabled={disabled}
              onChange={(selected) => section("realm", { selected })}
            />
            <TextField
              label={tr("Timezone")}
              value={realm.timezone}
              placeholder="-5"
              disabled={disabled}
              onChange={(timezone) => section("realm", { timezone })}
            />
          </div>
        )}

        {page === "art" && (
          <>
            <p className="muted small">
              {tr("Image paths are relative to the mod folder. Choose new images from Properties after import.")}
            </p>
            <TextField
              label={tr("BANNER")}
              value={art.banner}
              placeholder="art/banner.png"
              disabled={disabled}
              onChange={(banner) => section("art", { banner })}
            />
            <TextField
              label={tr("ICON")}
              value={art.icon}
              placeholder="art/icon.png"
              disabled={disabled}
              onChange={(icon) => section("art", { icon })}
            />
            <TextField
              label={tr("PORTRAIT")}
              value={art.portrait}
              placeholder="art/portrait.png"
              disabled={disabled}
              onChange={(portrait) => section("art", { portrait })}
            />
          </>
        )}
      </div>
    </div>
  );
}
