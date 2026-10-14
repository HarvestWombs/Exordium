import * as React from "react";
import { TitleIcon } from "../../components/icons.tsx";
import { ART_ACCEPT, ART_SLOTS, artAsPng, artUrl } from "../../lib/art.ts";
import type { ArtKind, Title } from "../../types.ts";

export function ArtworkPage(
  { t, root, art, onChanged }: { t: Title; root: string; art: number; onChanged: () => Promise<void> },
) {
  const [busy, setBusy] = React.useState<ArtKind | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  async function upload(kind: ArtKind, file: File) {
    setBusy(kind);
    setProblem(null);
    try {
      const png = await artAsPng(file, kind);
      const response = await fetch(`/api/art?key=${encodeURIComponent(t.key)}&kind=${kind}`, {
        method: "POST",
        body: await png.arrayBuffer(),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not save that image.");
      await onChanged();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function reset(kind: ArtKind) {
    setBusy(kind);
    await fetch(`/api/art?key=${encodeURIComponent(t.key)}&kind=${kind}`, { method: "DELETE" });
    await onChanged();
    setBusy(null);
  }

  const has = (kind: ArtKind) => kind === "banner" ? t.art.banner === "png" : t.art[kind];
  return (
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
              : <span className="muted small">None</span>}
          </div>
          <p className="muted small">
            {kind === "banner" && t.art.banner === "d2se" &&
              "Showing the D2SE banner from the mod's folder until one is set here."}
            {kind === "icon" && !t.art.icon && "No icon: the list shows the title's initials."}
          </p>
          <div className="row-actions">
            <label className={busy === kind ? "ghost disabled" : "ghost"}>
              {busy === kind ? "Saving…" : "Choose image…"}
              <input
                type="file"
                accept={ART_ACCEPT}
                hidden
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void upload(kind, file);
                }}
              />
            </label>
            {has(kind) && (
              <button
                type="button"
                className="ghost"
                disabled={busy !== null}
                onClick={() => void reset(kind)}
              >
                Remove
              </button>
            )}
          </div>
        </section>
      ))}
      <p className="muted small">
        Artwork is kept in Exordium's library; the mod's folder is never changed. The icon reaches Game.exe the next
        time the title starts.
      </p>
    </div>
  );
}
