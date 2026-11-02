import { tr } from "../../lib/i18n.ts";
import type { Title } from "../../types.ts";
import { CoreField } from "../../components/CoreField.tsx";
import { ManifestFooter } from "./ManifestFooter.tsx";
import type { ManifestEditor } from "./useManifest.ts";

/** A one-line field of the manifest, null when empty. */
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
        disabled={disabled}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.currentTarget.value || null)}
      />
    </section>
  );
}

/** Who made the title and where to find it: the manifest's own details. */
export function AboutPage({ t, editor }: { t: Title; editor: ManifestEditor }) {
  const manifest = editor.manifest!;
  const links = manifest.links ?? [];
  const busy = editor.saving;

  return (
    <div className="page-with-footer">
      <div className="stack">
        <TextField
          label={tr("NAME")}
          value={manifest.title}
          placeholder={t.kind === "mod" ? t.folder : t.title}
          disabled={busy}
          onChange={(title) => editor.set({ title })}
        />
        <div className="option-columns">
          <TextField
            label={tr("VERSION")}
            value={manifest.version}
            placeholder="1.0.0"
            disabled={busy}
            onChange={(version) => editor.set({ version })}
          />
          <TextField
            label={tr("AUTHOR")}
            value={manifest.author}
            placeholder={tr("Who made this mod")}
            disabled={busy}
            onChange={(author) => editor.set({ author })}
          />
          {t.kind === "mod" && (
            <CoreField
              value={manifest.core}
              disabled={busy}
              onChange={(core) => editor.set({ core })}
            />
          )}
        </div>
        <section className="option-section">
          <h2 className="eyebrow">{tr("DESCRIPTION")}</h2>
          <textarea
            rows={5}
            value={manifest.description ?? ""}
            disabled={busy}
            onChange={(e) => editor.set({ description: e.currentTarget.value || null })}
          />
        </section>
        <TextField
          label={tr("README")}
          value={manifest.readme}
          placeholder="Documentation/ReadMe.txt"
          disabled={busy}
          onChange={(readme) => editor.set({ readme })}
        />
        <section className="option-section">
          <h2 className="eyebrow">{tr("LINKS")}</h2>
          {links.map((link, i) => (
            <div className="link-row" key={i}>
              <input
                type="text"
                value={link.label ?? ""}
                placeholder={tr("Label (Discord, Website…)")}
                disabled={busy}
                onChange={(e) => {
                  const label = e.currentTarget.value;
                  editor.set({ links: links.map((l, j) => (j === i ? { ...l, label } : l)) });
                }}
              />
              <input
                type="text"
                value={link.url}
                placeholder="https://…"
                disabled={busy}
                onChange={(e) => {
                  const url = e.currentTarget.value;
                  editor.set({ links: links.map((l, j) => (j === i ? { ...l, url } : l)) });
                }}
              />
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => editor.set({ links: links.filter((_, j) => j !== i) })}
              >
                {tr("Remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ghost add-link"
            disabled={busy}
            onClick={() => editor.set({ links: [...links, { label: "", url: "" }] })}
          >
            {tr("Add link")}
          </button>
        </section>
      </div>
      <ManifestFooter editor={editor} />
    </div>
  );
}
