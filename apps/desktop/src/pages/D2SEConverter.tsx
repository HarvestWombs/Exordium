import { tr } from "../lib/i18n.ts";
import * as React from "react";
import { ManifestImportForm } from "../components/ManifestImportForm.tsx";
import { CopyProgress } from "../components/progress.tsx";
import { type Conversion, copyPercent } from "../hooks/useConversions.ts";
import { formatSize } from "../lib/util.ts";
import type { ConfirmRequest, CopyJob, ModManifest, Scan } from "../types.ts";

type Mod = Scan["importableMods"][number];

/** A mod's identity here: a folder chosen with Import folder by its path, the install's by name. */
const modKey = (mod: Mod) => mod.path ?? mod.folder;
const active = (job: CopyJob) => job.state === "queued" || job.state === "copying";

/** A mod's place in the queue, as its row in the list shows it. */
function badge(job: CopyJob | undefined): string | null {
  if (!job) return null;
  switch (job.state) {
    case "queued":
      return tr("Queued");
    case "copying":
      return `${copyPercent(job)}%`;
    case "done":
      return tr("Imported");
    case "failed":
      return tr("Failed");
    case "cancelled":
      return null;
  }
}

/**
 * The D2SE importer, a page of the library: each mod's exordium.mod.json reviewed before it goes in.
 * Import queues the mod's copy and moves on to the next one, so the player keeps editing while earlier
 * mods copy, one at a time (startCopy's queue). The app follows the copies (useConversions), so they
 * carry on when the player leaves, and stays mounted while hidden, so a draft does too.
 */
export function D2SEConverter(
  { root, mods, hidden, queued, onQueued, onConfirm, onClose }: {
    root: string;
    mods: Scan["importableMods"];
    /** Another page of the library is showing. */
    hidden: boolean;
    /** Every import in progress or finished this visit, by mod. */
    queued: Record<string, Conversion>;
    onQueued: (conversion: Conversion) => void;
    onConfirm: (request: ConfirmRequest) => void;
    onClose: () => void;
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
  const shownMods = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? mods.filter((mod) => `${mod.title} ${mod.folder}`.toLowerCase().includes(needle)) : mods;
  }, [mods, filter]);
  const entries = Object.values(queued);
  const running = entries.filter((entry) => active(entry.job));
  const imported = entries.filter((entry) => entry.job.state === "done").length;
  const failed = entries.filter((entry) => entry.job.state === "failed");
  const mine = current ? queued[modKey(current)] : undefined;

  const discardOrRun = React.useCallback((run: () => void) => {
    if (!dirty) {
      run();
      return;
    }
    onConfirm({
      title: tr("Unsaved changes"),
      body: tr("Discard your unsaved changes to this exordium.mod.json?"),
      action: tr("Discard changes"),
      danger: true,
      run: () => {
        run();
        return Promise.resolve();
      },
    });
  }, [dirty, onConfirm]);
  const close = React.useCallback(() => {
    if (busy) return;
    discardOrRun(onClose);
  }, [busy, discardOrRun, onClose]);
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
        if (!ok) throw new Error(body.error ?? tr("Could not convert this mod."));
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

  function replaceManifest(next: ModManifest) {
    setText(JSON.stringify(next, null, 2));
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
      if (!response.ok) throw new Error(body.error ?? tr("Could not import the mod."));
      const conversion: Conversion = {
        key: modKey(current),
        title: String(shown?.title || current.title),
        core: String(shown?.core || current.core || "") || null,
        move,
        job: body.job as CopyJob,
        settled: false,
      };
      const next = { ...queued, [conversion.key]: conversion };
      onQueued(conversion);
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
  const copying = running.find((entry) => entry.job.state === "copying") ?? null;
  const waitingCount = running.filter((entry) => entry.job.state === "queued").length;

  return (
    <div className="converter-page" hidden={hidden} aria-label={tr("D2SE to Exordium converter")}>
      <header>
        <div>
          <p className="eyebrow accent">{tr("D2SE import")}</p>
          <h2>{tr("Import into the library")}</h2>
        </div>
        <span className="muted small converter-progress">
          {mods.length} {tr("to review")}
          {imported > 0 ? tr(" · {count} imported", { count: imported }) : ""}
        </span>
        <button type="button" className="ghost compact" disabled={busy} onClick={close}>
          {tr("‹ Library")}
        </button>
      </header>
      <div className="converter-body">
        <aside className="converter-list">
          {mods.length > 8 && (
            <input
              className="converter-filter"
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value)}
              placeholder={tr("Filter mods…")}
              aria-label={tr("Filter mods")}
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
                onClick={() => mod.folder !== folder && discardOrRun(() => setFolder(mod.folder))}
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
                  ? tr("This import failed: {error}.", { error: mine.job.error ?? tr("the copy stopped") })
                  : mine.move
                  ? tr("Queued for import (moving). Its exordium.mod.json is written once the copy ends.")
                  : tr("Queued for import. Its exordium.mod.json is written once the copy ends.")
                : from
                ? move
                  ? tr(
                    "Moves {from} ({size}) into the library and writes this exordium.mod.json there. It is removed from your Diablo II install.",
                    { from, size: size ? formatSize(size) : tr("measuring…") },
                  )
                  : tr(
                    "Copies {from} ({size}) into the library and writes this exordium.mod.json there. Your install is not changed.",
                    { from, size: size ? formatSize(size) : tr("measuring…") },
                  )
                : tr("Choose a mod to import.")}
              {!mine && exists ? tr(" It is already in the library.") : ""}
              {!mine && dirty ? tr(" Edited.") : ""}
            </p>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={move}
                disabled={locked}
                onChange={(event) => setMove(event.currentTarget.checked)}
              />
              {tr("Move instead of copy — removes {folder} from your Diablo II install to save space", {
                folder: folder || tr("the mod"),
              })}
            </label>
          </div>
          <div className="converter-workspace">
            {shown && (
              <ManifestImportForm
                manifest={shown as ModManifest}
                folder={current?.folder ?? ""}
                disabled={locked || !manifest}
                onChange={replaceManifest}
              />
            )}
            <section className="option-section converter-json">
              <div className="section-head">
                <h2 className="eyebrow">{tr("JSON preview")}</h2>
                <span className="muted small">{tr("Updates live as you edit the form")}</span>
              </div>
              <textarea
                value={text}
                disabled={locked}
                spellCheck={false}
                onChange={(event) => {
                  setText(event.currentTarget.value);
                  setDirty(true);
                }}
              />
            </section>
          </div>
          {!manifest && text.trim() !== "" && (
            <p className="warn-text small">
              {tr("The JSON is not valid yet — fix it to edit the fields or import.")}
            </p>
          )}
          {problem && <p className="bad-text small">{problem}</p>}
        </section>
      </div>
      <footer>
        <div className="converter-copy">
          {copying && (
            <CopyProgress
              job={copying.job}
              label={`${
                copying.move
                  ? tr("Moving {label}", { label: copying.job.label })
                  : tr("Copying {label}", { label: copying.job.label })
              }${waitingCount ? tr(" ({waitingCount} more queued)", { waitingCount }) : ""}`}
            />
          )}
          {!copying && waitingCount > 0 && (
            <p className="muted small">{tr("{waitingCount} queued…", { waitingCount })}</p>
          )}
          {failed.length > 0 && (
            <p className="bad-text small">
              {tr("Not imported:")}{" "}
              {failed.map((entry) => `${entry.job.label} (${entry.job.error ?? tr("failed")})`).join("; ")}
            </p>
          )}
        </div>
        <button type="button" className="ghost" disabled={busy} onClick={close}>
          {running.length ? tr("Close (copies continue)") : tr("Close")}
        </button>
        <button
          type="button"
          className="ghost primary"
          disabled={locked || !manifest || exists}
          onClick={() => void save()}
        >
          {busy ? tr("Working…") : mine ? badge(mine.job) : tr("Import")}
        </button>
      </footer>
    </div>
  );
}
