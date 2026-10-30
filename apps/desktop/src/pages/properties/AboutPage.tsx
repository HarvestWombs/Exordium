import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import type { Title } from "../../types.ts";

/**
 * Who made the title and where to find it: shown on its page, never used to launch. Saved with the
 * title's other options, so the whole set is sent back.
 */
export function AboutPage({ t, root, onChanged }: { t: Title; root: string; onChanged: () => Promise<void> }) {
  const [name, setName] = React.useState(t.options.title ?? "");
  const [author, setAuthor] = React.useState(t.options.author ?? "");
  const [links, setLinks] = React.useState(t.options.links ?? []);
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  React.useEffect(() => {
    setName(t.options.title ?? "");
    setAuthor(t.options.author ?? "");
    setLinks(t.options.links ?? []);
    setProblem(null);
  }, [t.key, t.options]);
  const changed = name !== (t.options.title ?? "") ||
    author !== (t.options.author ?? "") ||
    JSON.stringify(links) !== JSON.stringify(t.options.links ?? []);
  const own = t.links.filter((link) => !(t.options.links ?? []).some((mine) => mine.url === link.url));

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
          options: { ...t.options, title: name.trim() || null, author, links: links.filter((link) => link.url.trim()) },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? tr("Could not save."));
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
        <section className="option-section">
          <h2 className="eyebrow">{tr("NAME")}</h2>
          <p className="muted small">
            {tr("What the library shows for this mod. Leave blank to use the mod's own name")}
            {t.kind === "mod" ? ` (${t.folder})` : ""}.
          </p>
          <input
            type="text"
            value={name}
            disabled={saving}
            placeholder={t.title}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </section>
        <section className="option-section">
          <h2 className="eyebrow">{tr("AUTHOR")}</h2>
          <input
            type="text"
            value={author}
            disabled={saving}
            placeholder={tr("Who made this mod")}
            onChange={(e) => setAuthor(e.currentTarget.value)}
          />
        </section>
        <section className="option-section">
          <h2 className="eyebrow">{tr("LINKS")}</h2>
          {own.length > 0 && (
            <p className="muted small">
              {tr("From the mod itself:")} {own.map((link) => link.label).join(", ")}
              {tr(". Those always show; add your own below.")}
            </p>
          )}
          {links.map((link, i) => (
            <div className="link-row" key={i}>
              <input
                type="text"
                value={link.label}
                placeholder={tr("Label (Discord, Website…)")}
                disabled={saving}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, label: e.currentTarget.value } : l)))}
              />
              <input
                type="text"
                value={link.url}
                placeholder="https://…"
                disabled={saving}
                onChange={(e) => setLinks(links.map((l, j) => (j === i ? { ...l, url: e.currentTarget.value } : l)))}
              />
              <button
                type="button"
                className="ghost"
                disabled={saving}
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
              >
                {tr("Remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ghost add-link"
            disabled={saving}
            onClick={() => setLinks([...links, { label: "", url: "" }])}
          >
            {tr("Add link")}
          </button>
        </section>
        <section className="option-section">
          <h2 className="eyebrow">{tr("REALMS")}</h2>
          {t.realm
            ? (
              <dl className="realm-grid">
                {t.realm.gatewayName && (
                  <>
                    <dt>{tr("Name")}</dt>
                    <dd>{t.realm.gatewayName}</dd>
                  </>
                )}
                {t.realm.gateway && (
                  <>
                    <dt>{tr("Gateway")}</dt>
                    <dd>{t.realm.gateway}{t.realm.port ? `:${t.realm.port}` : ""}</dd>
                  </>
                )}
                {t.realm.selected && (
                  <>
                    <dt>{tr("Selected")}</dt>
                    <dd>{t.realm.selected}</dd>
                  </>
                )}
                {t.realm.timezone && (
                  <>
                    <dt>{tr("Timezone")}</dt>
                    <dd>{t.realm.timezone}</dd>
                  </>
                )}
              </dl>
            )
            : (
              <p className="muted small">
                {tr("This mod sets no private realm; it uses Battle.net's own gateway list.")}
              </p>
            )}
        </section>
      </div>
      <footer className="dialog-footer">
        <span className={problem ? "error" : "muted small"}>
          {problem ?? (changed ? tr("Unsaved changes") : tr("Saved"))}
        </span>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            disabled={!changed || saving}
            onClick={() => {
              setName(t.options.title ?? "");
              setAuthor(t.options.author ?? "");
              setLinks(t.options.links ?? []);
            }}
          >
            {tr("Reset")}
          </button>
          <button type="button" className="ghost primary" disabled={!changed || saving} onClick={() => void apply()}>
            {tr("Apply")}
          </button>
        </div>
      </footer>
    </div>
  );
}
