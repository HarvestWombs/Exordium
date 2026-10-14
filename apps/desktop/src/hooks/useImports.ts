import * as React from "react";
import type { CatalogCore, Scan } from "../types.ts";

/**
 * Bringing things into the library from the library itself: a mod from an archive or a folder
 * (Library → Import), and a missing core from a mod's page (Install core), with its download progress.
 */
export function useImports(
  { root, load, openTitle, say, reportError }: {
    root: string | null;
    load: (root: string) => Promise<boolean>;
    openTitle: (key: string) => void;
    say: (message: string) => void;
    reportError: (err: unknown) => void;
  },
) {
  // Import folder: one folder chosen anywhere on disk, reviewed in the converter.
  const [folderImport, setFolderImport] = React.useState<Scan["importableMods"] | null>(null);
  const [coreJob, setCoreJob] = React.useState<{ core: string; received: number; total: number } | null>(null);

  /** An archive (.zip, .7z, .rar…) unpacked into the library; its page opens once it is in. */
  async function importArchive(): Promise<boolean> {
    if (!root) return false;
    const params = new URLSearchParams({
      title: "Choose a mod archive to import",
      multiple: "false",
      extensions: JSON.stringify([{ label: "Mod archives", extensions: ["zip", "7z", "rar", "tar", "tgz"] }]),
    });
    const pick = await (await fetch(`/api/pick-open-files?${params}`)).json() as {
      available?: boolean;
      paths?: string[];
    };
    if (pick.available === false) throw new Error("No file picker is available here.");
    const archive = pick.paths?.[0];
    if (!archive) return false;
    const response = await fetch("/api/install-local-archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archive, root, importMetadata: true }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Could not install the archive.");
    const name = body.result?.installed?.[0]?.name as string | undefined;
    await load(root);
    if (name) {
      openTitle(`mod:${name}`);
      say(`Imported ${name} into Exordium's library.`);
    }
    return true;
  }

  async function importFolder() {
    try {
      const params = new URLSearchParams({ title: "Choose a mod's folder to import" });
      const pick = await (await fetch(`/api/pick-folder?${params}`)).json() as {
        available: boolean;
        path: string | null;
      };
      if (!pick.available) throw new Error("No folder picker is available here.");
      if (!pick.path) return;
      const name = pick.path.split(/[/]|[\\]/).filter(Boolean).pop() ?? pick.path;
      setFolderImport([{ folder: name, title: name, core: null, path: pick.path }]);
    } catch (err) {
      reportError(err);
    }
  }

  async function installCore(core: string) {
    if (!root) return;
    setCoreJob({ core, received: 0, total: 0 });
    try {
      const response = await fetch("/api/cores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root, core }),
      });
      const started = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(started.error ?? `Core ${core} could not be installed.`);
      // Follow the download until the core is in the library, then read the library again.
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const list = await (await fetch(`/api/cores?root=${encodeURIComponent(root)}`)).json();
        const entry = ((list.cores ?? []) as CatalogCore[]).find((c) => c.core.toLowerCase() === core.toLowerCase());
        const job = entry?.job;
        if (job) setCoreJob({ core, received: job.received, total: job.total });
        if (entry?.status === "installed" || !job || job.state === "installed") break;
        if (job.state === "failed") throw new Error(job.error ?? "The download failed.");
      }
      await load(root);
      say(`Core ${core} is installed.`);
    } catch (err) {
      reportError(err);
    } finally {
      setCoreJob(null);
    }
  }

  return { folderImport, setFolderImport, coreJob, importArchive, importFolder, installCore };
}
