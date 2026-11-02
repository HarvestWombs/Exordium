import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { TitleIcon } from "../../components/icons.tsx";
import { ART_ACCEPT, ART_SLOTS, artAsPng, artUrl } from "../../lib/art.ts";
import type { ArtKind, Title } from "../../types.ts";
import { ManifestFooter } from "./ManifestFooter.tsx";
import type { ManifestEditor } from "./useManifest.ts";

/**
 * The title's art, named under `art` in its exordium.mod.json. Choosing an image saves it in the title's
 * folder and names it straight away; a path can also be typed, to an image already there, and applied.
 */
export function ArtPage(
  { t, root, art, editor, onChanged }: {
    t: Title;
    root: string;
    art: number;
    editor: ManifestEditor;
    onChanged: () => Promise<void>;
  },
) {
  const [busy, setBusy] = React.useState<ArtKind | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const paths = editor.manifest!.art ?? {};
  const query = (kind: ArtKind) => new URLSearchParams({ root, key: t.key, kind });

  async function change(kind: ArtKind, method: "POST" | "DELETE", file?: File) {
    setBusy(kind);
    setProblem(null);
    try {
      const body = file ? await (await artAsPng(file, kind)).arrayBuffer() : null;
      const response = await fetch(`/api/art?${query(kind)}`, { method, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? tr("Could not save that image."));
      editor.adoptArt(kind, result.path);
      await onChanged();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const has = (kind: ArtKind) => kind === "banner" ? t.art.banner === "png" : t.art[kind];
  return (
    <div className="page-with-footer">
      <div className="stack">
        {problem && <div className="banner-error" role="alert">{problem}</div>}
        {ART_SLOTS.map(({ kind, label, hint }) => (
          <section key={kind} className="art-slot">
            <div className="section-head">
              <h2 className="eyebrow">{label}</h2>
              <span className="muted small">{hint}</span>
            </div>
            <div className={`art-preview ${kind}`}>
              {has(kind) || (kind === "banner" && t.art.banner === "d2se")
                ? <img src={artUrl(root, t.key, kind, art)} alt="" />
                : kind === "icon"
                ? <TitleIcon t={t} root={root} art={art} size={72} />
                : <span className="muted small">{tr("None")}</span>}
            </div>
            <p className="muted small">
              {kind === "banner" && t.art.banner === "d2se" &&
                tr("Showing the D2SE banner from the mod's folder until one is set here.")}
              {kind === "icon" && !t.art.icon && tr("No icon: the list shows the title's initials.")}
            </p>
            <div className="art-file">
              <input
                type="text"
                aria-label={label}
                data-tooltip={tr("An image in the title's folder, as a path from that folder.")}
                value={paths[kind] ?? ""}
                disabled={busy !== null || editor.saving}
                placeholder={`art/${kind}.png`}
                onChange={(e) => editor.section("art", { [kind]: e.currentTarget.value || null })}
              />
              <label className={busy === kind ? "ghost disabled" : "ghost"}>
                {busy === kind ? tr("Saving…") : tr("Choose image…")}
                <input
                  type="file"
                  accept={ART_ACCEPT}
                  hidden
                  disabled={busy !== null}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (file) void change(kind, "POST", file);
                  }}
                />
              </label>
              {paths[kind] && (
                <button
                  type="button"
                  className="ghost"
                  disabled={busy !== null}
                  onClick={() => void change(kind, "DELETE")}
                >
                  {tr("Remove")}
                </button>
              )}
            </div>
          </section>
        ))}
        <p className="muted small">
          {tr(
            "A chosen image is saved in the title's folder and named in its exordium.mod.json. Remove stops naming it and leaves the file. The icon reaches Game.exe the next time the title starts.",
          )}
        </p>
      </div>
      <ManifestFooter editor={editor} />
    </div>
  );
}
