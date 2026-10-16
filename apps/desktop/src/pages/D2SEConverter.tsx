import * as React from "react";
import { CopyProgress, setupPost } from "../components/progress.tsx";
import { formatSize } from "../lib/util.ts";
import type { CopyJob, Scan } from "../types.ts";

type Mod = Scan["importableMods"][number];

/** An import queued from this converter: its copy job, and whether it moves the mod. */
interface Queued {
  job: CopyJob;
  move: boolean;
}

/** A mod's identity here: a folder chosen with Import folder by its path, the install's by name. */
const modKey = (mod: Mod) => mod.path ?? mod.folder;
const active = (job: CopyJob) => job.state === "queued" || job.state === "copying";

function percent(job: CopyJob): number {
  return job.total > 0 ? Math.min(100, Math.round((job.copied / job.total) * 100)) : 0;
}

/** A mod's place in the queue, as its row in the list shows it. */
function badge(job: CopyJob | undefined): string | null {
  if (!job) return null;
  switch (job.state) {
    case "queued":
      return "Queued";
    case "copying":
      return `${percent(job)}%`;
    case "done":
      return "Imported";
    case "failed":
      return "Failed";
  }
}

/**
 * The D2SE importer: each mod's exordium.mod.json reviewed before it goes into the library. Import
 * queues the mod's copy and moves on to the next one, so the player keeps editing while earlier mods
 * copy, one at a time (startCopy's queue). Each row shows its mod's place in the queue; closing hands
 * the copies still running to the app, which refreshes the library as they finish.
 */
export function D2SEConverter(
  { root, mods, onClose, onSaved }: {
    root: string;
    mods: Scan["importableMods"];
    /** With the copies still queued or running, for the app to follow. */
    onClose: (running: CopyJob[]) => void;
    /** A copy finished: read the library again and say so. */
    onSaved: (message: string) => Promise<void>;
  },
) {
  const [folder, setFolder] = React.useState(mods[0]?.folder ?? "");
  const current = mods.find((mod) => mod.folder === folder) ?? null;
  const path = current?.path ?? null;
  const [text, setText] = React.useState("");
  const [exists, setExists] = React.useState(false);
  const [from, setFrom] = React.useState("");
  const [size, setSize] = React.useState(0);
  const [problem, setProblem] = React.useState<string | null>(null);
  // Reading a preview or sending an import; the queue's copies never block the editor.
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  // Off by default: a copy leaves the install intact. Move removes the folder from the install.
  const [move, setMove] = React.useState(false);
  // Every import queued from here, by mod; kept after the mod leaves the list so the footer can say so.
  const [queued, setQueued] = React.useState<Record<string, Queued>>({});
  const shownMods = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? mods.filter((mod) => `${mod.title} ${mod.folder}`.toLowerCase().includes(needle)) : mods;
  }, [mods, filter]);
  const entries = Object.values(queued);
  const running = entries.filter((entry) => active(entry.job));
  const imported = entries.filter((entry) => entry.job.state === "done").length;
  const failed = entries.filter((entry) => entry.job.state === "failed");
  const mine = current ? queued[modKey(current)] : undefined;

  const discardOk = React.useCallback(
    () => !dirty || confirm("Discard your unsaved changes to this exordium.mod.json?"),
    [dirty],
  );
  const close = React.useCallback(() => {
    if (busy || !discardOk()) return;
    onClose(Object.values(queued).filter((entry) => active(entry.job)).map((entry) => entry.job));
  }, [busy, discardOk, onClose, queued]);
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

  // Follow the queue while anything in it is waiting or copying. A finished copy reads the library
  // again (its mod then leaves the list) and says so.
  const anyActive = running.length > 0;
  // The app's callback changes on every render of the app; the timer reads the latest without restarting.
  const saved = React.useRef(onSaved);
  saved.current = onSaved;
  React.useEffect(() => {
    if (!anyActive) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const now = Object.entries(queued).filter(([, entry]) => active(entry.job));
      for (const [key, entry] of now) {
        const { body } = await setupPost({ action: "job", job: entry.job.id }).catch(() => ({ body: {} }));
        const job = (body as { job?: CopyJob }).job;
        if (stopped || !job) continue;
        setQueued((all) => ({ ...all, [key]: { ...entry, job } }));
        if (job.state === "done") {
          void saved.current(`${entry.move ? "Moved" : "Imported"} ${job.label} into Exordium's library.`);
        }
      }
    }, 600);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [anyActive, queued]);

  function patchManifest(key: string, value: string) {
    const base = manifest ?? shown ?? {};
    setText(JSON.stringify({ ...base, [key]: value }, null, 2));
    setDirty(true);
  }

  /** Queues this mod's copy and moves straight on to the next mod that is not queued yet. */
  async function save() {
    if (!current) return;
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
      const key = modKey(current);
      const next = { ...queued, [key]: { job: body.job as CopyJob, move } };
      setQueued(next);
      setDirty(false);
      const at = mods.findIndex((mod) => mod.folder === folder);
      const waiting = (mod: Mod) => !next[modKey(mod)];
      const following = mods.slice(at + 1).find(waiting) ?? mods.slice(0, at).find(waiting) ?? null;
      if (following) setFolder(following.folder);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || mine !== undefined;
  const field = (key: "title" | "name" | "author" | "version" | "core") => (
    <label>
      <span>{key}</span>
      <input
        value={String(shown?.[key] ?? "")}
        disabled={locked || !manifest}
        onChange={(event) => patchManifest(key, event.currentTarget.value)}
      />
    </label>
  );
  const copying = running.find((entry) => entry.job.state === "copying") ?? null;
  const waitingCount = running.filter((entry) => entry.job.state === "queued").length;

  return (
    <div className="scrim" onClick={(event) => event.target === event.currentTarget && close()}>
      <div className="converter-modal" role="dialog" aria-modal="true" aria-label="D2SE to Exordium converter">
        <header>
          <div>
            <p className="eyebrow accent">D2SE import</p>
            <h2>Import into the library</h2>
          </div>
          <span className="muted small converter-progress">
            {mods.length} to review{imported > 0 ? ` · ${imported} imported` : ""}
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
            {shownMods.map((mod) => {
              const job = queued[modKey(mod)]?.job;
              const label = badge(job);
              return (
                <button
                  type="button"
                  key={mod.folder}
                  className={mod.folder === folder ? "on" : ""}
                  disabled={busy}
                  onClick={() => mod.folder !== folder && discardOk() && setFolder(mod.folder)}
                >
                  <strong>
                    {mod.title}
                    {label && <span className={`converter-badge ${job!.state}`}>{label}</span>}
                  </strong>
                  <span>{mod.folder}{mod.core ? ` · ${mod.core}` : ""}</span>
                </button>
              );
            })}
          </aside>
          <section className="converter-editor">
            <div className="converter-source">
              <p className="muted small">
                {mine
                  ? mine.job.state === "failed"
                    ? `This import failed: ${mine.job.error ?? "the copy stopped"}.`
                    : `Queued for import${
                      mine.move ? " (moving)" : ""
                    }. Its exordium.mod.json is written once the copy ends.`
                  : from
                  ? `${move ? "Moves" : "Copies"} ${from} (${
                    size ? formatSize(size) : "measuring…"
                  }) into the library and writes this exordium.mod.json there. ${
                    move ? "It is removed from your Diablo II install." : "Your install is not changed."
                  }`
                  : "Choose a mod to import."}
                {!mine && exists ? " It is already in the library." : ""}
                {!mine && dirty ? " Edited." : ""}
              </p>
              <label className="confirm-check">
                <input
                  type="checkbox"
                  checked={move}
                  disabled={locked}
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
                disabled={locked || !manifest}
                onChange={(event) => patchManifest("description", event.currentTarget.value)}
              />
            </label>
            <label className="converter-json">
              <span>JSON preview</span>
              <textarea
                value={text}
                disabled={locked}
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
            {copying && (
              <CopyProgress
                job={copying.job}
                label={`${copying.move ? "Moving" : "Copying"} ${copying.job.label}${
                  waitingCount ? ` (${waitingCount} more queued)` : ""
                }`}
              />
            )}
            {!copying && waitingCount > 0 && <p className="muted small">{waitingCount} queued…</p>}
            {failed.length > 0 && (
              <p className="bad-text small">
                Not imported: {failed.map((entry) => `${entry.job.label} (${entry.job.error ?? "failed"})`).join("; ")}
              </p>
            )}
          </div>
          <button type="button" className="ghost" disabled={busy} onClick={close}>
            {running.length ? "Close (copies continue)" : "Close"}
          </button>
          <button
            type="button"
            className="ghost primary"
            disabled={locked || !manifest || exists}
            onClick={() => void save()}
          >
            {busy ? "Working…" : mine ? badge(mine.job) : "Import"}
          </button>
        </footer>
      </div>
    </div>
  );
}
