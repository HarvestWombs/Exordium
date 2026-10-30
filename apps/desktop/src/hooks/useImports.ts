import { tr } from "../lib/i18n.ts";
import * as React from "react";
import type { Scan } from "../types.ts";

/**
 * Bringing things into the library from the library itself: a mod from an archive or a folder
 * (Library → Import), and a missing core from a mod's page (Install core).
 */
export function useImports(
  { root, load, openTitle, say, reportError, onCoreStarted }: {
    root: string | null;
    load: (root: string) => Promise<boolean>;
    openTitle: (key: string) => void;
    say: (message: string) => void;
    reportError: (err: unknown) => void;
    /** A core's install has started, for the library to follow. */
    onCoreStarted: () => void;
  },
) {
  // Import folder: one folder chosen anywhere on disk, reviewed in the converter.
  const [folderImport, setFolderImport] = React.useState<Scan["importableMods"] | null>(null);

  /** An archive (.zip, .7z, .rar…) unpacked into the library; its page opens once it is in. */
  async function importArchive(): Promise<boolean> {
    if (!root) return false;
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
    if (!archive) return false;
    const response = await fetch("/api/install-local-archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archive, root, importMetadata: true }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? tr("Could not install the archive."));
    const name = body.result?.installed?.[0]?.name as string | undefined;
    await load(root);
    if (name) {
      openTitle(`mod:${name}`);
      say(tr("Imported {name} into Exordium's library.", { name }));
    }
    return true;
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
