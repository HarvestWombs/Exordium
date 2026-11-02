import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { cleanManifest } from "../../lib/manifest.ts";
import type { ArtKind, ModManifest, Title } from "../../types.ts";

type Section = "art" | "launch" | "loads" | "realm" | "update";

export interface ManifestEditor {
  /** The draft; null until the file is read, or when it cannot be. */
  manifest: ModManifest | null;
  /** Whether the title has an exordium.mod.json yet. A D2SE mod gets one on its first Apply. */
  exists: boolean;
  changed: boolean;
  saving: boolean;
  problem: string | null;
  set: (next: Partial<ModManifest>) => void;
  section: <Name extends Section>(name: Name, next: NonNullable<ModManifest[Name]>) => void;
  /** An image the Art page just saved: already in the file, so it is not an unsaved change. */
  adoptArt: (kind: ArtKind, path: string | null) => void;
  reset: () => void;
  apply: () => Promise<void>;
}

/**
 * One draft of the title's exordium.mod.json, shared by the Properties pages, so Apply saves them all
 * and moving between them loses nothing.
 */
export function useManifest(t: Title, root: string, onChanged: () => Promise<void>): ManifestEditor {
  const [saved, setSaved] = React.useState<ModManifest | null>(null);
  const [manifest, setManifest] = React.useState<ModManifest | null>(null);
  const [exists, setExists] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    let current = true;
    setSaved(null);
    setManifest(null);
    setProblem(null);
    void (async () => {
      const query = new URLSearchParams({ root, key: t.key });
      const response = await fetch(`/api/manifest?${query}`);
      const body = await response.json().catch(() => ({}));
      if (!current) return;
      if (!response.ok) return setProblem(body.error ?? tr("Could not read exordium.mod.json."));
      setSaved(body.manifest);
      setManifest(body.manifest);
      setExists(body.exists);
    })();
    return () => {
      current = false;
    };
  }, [t.key, root]);

  return {
    manifest,
    exists,
    changed: JSON.stringify(manifest) !== JSON.stringify(saved),
    saving,
    problem,
    set: (next) => setManifest((draft) => draft && { ...draft, ...next }),
    section: (name, next) =>
      setManifest((draft) => draft && { ...draft, [name]: { ...(draft[name] as object | null | undefined), ...next } }),
    adoptArt: (kind, path) => {
      const withArt = (draft: ModManifest | null) => draft && { ...draft, art: { ...draft.art, [kind]: path } };
      setSaved(withArt);
      setManifest(withArt);
      setExists(true);
    },
    reset: () => setManifest(saved),
    apply: async () => {
      if (!manifest) return;
      setSaving(true);
      setProblem(null);
      try {
        const response = await fetch("/api/manifest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root, key: t.key, manifest: cleanManifest(manifest) }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? tr("Could not save exordium.mod.json."));
        setSaved(body.manifest);
        setManifest(body.manifest);
        setExists(true);
        await onChanged();
      } catch (error) {
        setProblem((error as Error).message);
      } finally {
        setSaving(false);
      }
    },
  };
}
