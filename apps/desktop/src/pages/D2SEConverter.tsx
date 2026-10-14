import * as React from "react";
import { CopyProgress, followCopy } from "../components/progress.tsx";
import { formatSize } from "../lib/util.ts";
import type { CopyJob, Scan } from "../types.ts";

export function D2SEConverter(
  { root, mods, onClose, onSaved }: {
    root: string;
    mods: Scan["importableMods"];
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
  },
) {
  const [folder, setFolder] = React.useState(mods[0]?.folder ?? "");
  // A folder chosen with Import folder is addressed by its path; the install's mods by name.
  const path = mods.find((mod) => mod.folder === folder)?.path ?? null;
  const [text, setText] = React.useState("");
  const [exists, setExists] = React.useState(false);
  const [from, setFrom] = React.useState("");
  const [size, setSize] = React.useState(0);
  const [copy, setCopy] = React.useState<CopyJob | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [saved, setSaved] = React.useState(0);
  // Off by default: a copy leaves the install intact. Move removes the folder from the install.
  const [move, setMove] = React.useState(false);
  const shownMods = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? mods.filter((mod) => `${mod.title} ${mod.folder}`.toLowerCase().includes(needle)) : mods;
  }, [mods, filter]);
  const discardOk = React.useCallback(
    () => !dirty || confirm("Discard your unsaved changes to this exordium.mod.json?"),
    [dirty],
  );
  const close = React.useCallback(() => {
    if (!busy && discardOk()) onClose();
  }, [busy, discardOk, onClose]);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [close]);
  const manifest = React.useMemo(() => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [text]);

  // The fields and import read the JSON. While the textarea is mid-edit it is often briefly invalid;
  // keep the last valid parse so the upper form shows it instead of blanking on every keystroke.
  const [lastValid, setLastValid] = React.useState<Record<string, unknown> | null>(null);
  React.useEffect(() => {
    if (manifest) setLastValid(manifest);
  }, [manifest]);
  const shown = manifest ?? lastValid;

  React.useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    setBusy(true);
    setProblem(null);
    fetch("/api/d2se-converter/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, folder, ...(path ? { path } : {}) }),
    })
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) throw new Error(body.error ?? "Could not convert this mod.");
        setText(JSON.stringify(body.manifest, null, 2));
        setExists(body.exists === true);
        setFrom(body.from ?? "");
        setSize(typeof body.size === "number" ? body.size : 0);
        setCopy(null);
        setDirty(false);
      })
      .catch((error) => !cancelled && setProblem((error as Error).message))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [folder, root, path]);

  // The size is walked separately, after the preview: a multi-GB mod takes a while to measure, and the
  // fields should not wait for it.
  React.useEffect(() => {
    if (!folder || !from) return;
    let cancelled = false;
    fetch("/api/d2se-converter/size", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folder, ...(path ? { path } : {}) }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && typeof body?.size === "number") setSize(body.size);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [folder, from, path]);

  function patchManifest(key: string, value: string) {
    const base = manifest ?? shown ?? {};
    setText(JSON.stringify({ ...base, [key]: value }, null, 2));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/d2se-converter/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root, folder, ...(path ? { path } : {}), text, overwrite: exists, move }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not import the mod.");
      // The folder is copied in the background; the mod is in the library once that ends.
      const done = body.job ? await followCopy(body.job, setCopy) : null;
      if (done && done.state !== "done") throw new Error(done.error ?? "Copying stopped.");
      // The imported mod leaves the list once the library is read again: move on to the next one.
      const at = mods.findIndex((mod) => mod.folder === folder);
      const next = mods[at + 1] ?? mods[at - 1] ?? null;
      setDirty(false);
      setSaved((n) => n + 1);
      await onSaved(`${move ? "Moved" : "Imported"} ${folder} into Exordium's library.`);
      if (next) setFolder(next.folder);
      else onClose();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (key: "title" | "name" | "author" | "version" | "core") => (
    <label>
      <span>{key}</span>
      <input
        value={String(shown?.[key] ?? "")}
        disabled={busy || !manifest}
        onChange={(event) => patchManifest(key, event.currentTarget.value)}
      />
    </label>
  );

  return (
    <div className="scrim" onClick={(event) => event.target === event.currentTarget && close()}>
      <div className="converter-modal" role="dialog" aria-modal="true" aria-label="D2SE to Exordium converter">
        <header>
          <div>
            <p className="eyebrow accent">D2SE import</p>
            <h2>Import into the library</h2>
          </div>
          <span className="muted small converter-progress">
            {mods.length} to review{saved > 0 ? ` · ${saved} saved` : ""}
          </span>
          <button type="button" className="window-button" aria-label="Close" disabled={busy} onClick={close}>
            ×
          </button>
        </header>
        <div className="converter-body">
          <aside className="converter-list">
            {mods.length > 8 && (
              <input
                className="converter-filter"
                value={filter}
                onChange={(event) => setFilter(event.currentTarget.value)}
                placeholder="Filter mods…"
                aria-label="Filter mods"
              />
            )}
            {shownMods.map((mod) => (
              <button
                type="button"
                key={mod.folder}
                className={mod.folder === folder ? "on" : ""}
                disabled={busy}
                onClick={() => mod.folder !== folder && discardOk() && setFolder(mod.folder)}
              >
                <strong>{mod.title}</strong>
                <span>{mod.folder}{mod.core ? ` · ${mod.core}` : ""}</span>
              </button>
            ))}
          </aside>
          <section className="converter-editor">
            <div className="converter-source">
              <p className="muted small">
                {from
                  ? `${move ? "Moves" : "Copies"} ${from} (${
                    size ? formatSize(size) : "measuring…"
                  }) into the library and writes this exordium.mod.json there. ${
                    move ? "It is removed from your Diablo II install." : "Your install is not changed."
                  }`
                  : "Choose a mod to import."}
                {exists ? " It is already in the library." : ""}
                {dirty ? " Edited." : ""}
              </p>
              <label className="confirm-check">
                <input
                  type="checkbox"
                  checked={move}
                  disabled={busy}
                  onChange={(event) => setMove(event.currentTarget.checked)}
                />
                Move instead of copy — removes {folder || "the mod"} from your Diablo II install to save space
              </label>
            </div>
            <div className="converter-grid">
              {field("title")}
              {field("name")}
              {field("author")}
              {field("version")}
              {field("core")}
            </div>
            <label className="converter-description">
              <span>description</span>
              <textarea
                value={String(shown?.description ?? "")}
                disabled={busy || !manifest}
                onChange={(event) => patchManifest("description", event.currentTarget.value)}
              />
            </label>
            <label className="converter-json">
              <span>JSON preview</span>
              <textarea
                value={text}
                disabled={busy}
                spellCheck={false}
                onChange={(event) => {
                  setText(event.currentTarget.value);
                  setDirty(true);
                }}
              />
            </label>
            {!manifest && text.trim() !== "" && (
              <p className="warn-text small">The JSON is not valid yet — fix it to edit the fields or import.</p>
            )}
            {problem && <p className="bad-text small">{problem}</p>}
          </section>
        </div>
        <footer>
          <div className="converter-copy">
            {copy && <CopyProgress job={copy} label={move ? "Moving" : undefined} />}
          </div>
          <button type="button" className="ghost" disabled={busy} onClick={close}>Close</button>
          <button
            type="button"
            className="ghost primary"
            disabled={busy || !manifest || exists}
            onClick={() => void save()}
          >
            {busy ? (copy ? "Importing…" : "Working…") : "Import"}
          </button>
        </footer>
      </div>
    </div>
  );
}
