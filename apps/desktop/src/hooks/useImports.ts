import { tr } from "../lib/i18n.ts";
import * as React from "react";
import type { Scan } from "../types.ts";
import type { Conversion } from "./useConversions.ts";

/**
 * Bringing things into the library from the library itself: a mod from an archive or a folder
 * (Library → Import), and a missing core from a mod's page (Install core).
 */
export function useImports(
  { root, reportError, onCoreStarted }: {
    root: string | null;
    reportError: (err: unknown) => void;
    /** A core's install has started, for the library to follow. */
    onCoreStarted: () => void;
  },
) {
  // Import folder: one folder chosen anywhere on disk, reviewed in the converter.
  const [folderImport, setFolderImport] = React.useState<Scan["importableMods"] | null>(null);

  /**
   * An archive (.zip, .7z, .rar…), unpacked in the background: the import to follow while it unpacks,
   * after which its mods open in the converter (useConversions' `onUnpacked`). Null when none was chosen.
   */
  async function importArchive(): Promise<Conversion | null> {
    if (!root) return null;
    const params = new URLSearchParams({
      title: tr("Choose a mod archive to import"),
      multiple: "false",
      extensions: JSON.stringify([{ label: tr("Mod archives"), extensions: ["zip", "7z", "rar", "tar", "tgz"] }]),
    });
    const pick = await (await fetch(`/api/pick-open-files?${params}`)).json() as {
      available?: boolean;
      paths?: string[];
    };
    if (pick.available === false) throw new Error(tr("No file picker is available here."));
    const archive = pick.paths?.[0];
    if (!archive) return null;
    const response = await fetch("/api/install-local-archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archive }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.job) throw new Error(body.error ?? tr("Could not unpack the archive."));
    return {
      key: `archive:${body.job.id}`,
      title: body.job.label,
      core: null,
      mode: "unpack",
      job: body.job,
      settled: false,
    };
  }

  async function importFolder() {
    try {
      const params = new URLSearchParams({ title: tr("Choose a mod's folder to import") });
      const pick = await (await fetch(`/api/pick-folder?${params}`)).json() as {
        available: boolean;
        path: string | null;
      };
      if (!pick.available) throw new Error(tr("No folder picker is available here."));
      if (!pick.path) return;
      const name = pick.path.split(/[/]|[\\]/).filter(Boolean).pop() ?? pick.path;
      setFolderImport([{ folder: name, title: name, core: null, path: pick.path }]);
    } catch (err) {
      reportError(err);
    }
  }

  async function installCore(core: string) {
    if (!root) return;
    try {
      const response = await fetch("/api/cores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root, core }),
      });
      const started = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(started.error ?? tr("Core {core} could not be installed.", { core }));
      onCoreStarted();
    } catch (err) {
      reportError(err);
    }
  }

  return { folderImport, setFolderImport, importArchive, importFolder, installCore };
}
