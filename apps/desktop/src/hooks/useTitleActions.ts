import type * as React from "react";
import type { ConfirmRequest, Status, Title, TitleAction } from "../types.ts";

async function library(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/library/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "That did not work.");
  return result;
}

/**
 * What the title menu (and the title page's buttons) do: favorite, desktop shortcut, open its folder,
 * hide or show, uninstall (asking first), properties and play.
 */
export function useTitleActions(
  {
    root,
    favorites,
    selectedKey,
    setSelectedKey,
    setStatus,
    refreshStatus,
    load,
    say,
    setError,
    confirm,
    onProperties,
    onPlay,
  }: {
    root: string | null;
    favorites: Set<string>;
    selectedKey: string | null;
    setSelectedKey: (key: string | null) => void;
    setStatus: React.Dispatch<React.SetStateAction<Status | null>>;
    refreshStatus: () => Promise<Status>;
    load: (root: string) => Promise<boolean>;
    say: (message: string) => void;
    setError: (message: string | null) => void;
    confirm: (request: ConfirmRequest) => void;
    onProperties: (t: Title) => void;
    onPlay: (t: Title) => void;
  },
) {
  return async function titleAction(action: TitleAction, t: Title) {
    try {
      switch (action) {
        case "favorite": {
          // Shown at once; the server is told in the background, and a failure puts it back.
          const on = !favorites.has(t.key);
          setStatus((current) =>
            current &&
            {
              ...current,
              favorites: on ? [...current.favorites, t.key] : current.favorites.filter((key) => key !== t.key),
            }
          );
          library("favorite", { key: t.key, on }).catch((err) => {
            setError((err as Error).message);
            void refreshStatus();
          });
          break;
        }
        case "shortcut": {
          const result = await library("shortcut", { key: t.key });
          say(`Added ${result.name} to your desktop.`);
          break;
        }
        case "files":
          await fetch("/api/open-folder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ root, key: t.key }),
          });
          break;
        case "unhide":
          await library("hide", { key: t.key, on: false });
          await refreshStatus();
          say(`${t.title} is back in the list.`);
          break;
        case "hide":
          confirm({
            title: `Hide ${t.title}?`,
            body:
              "It leaves the mod list; its files are not touched. Hidden titles are under the Hidden filter, where you can bring them back.",
            action: "Hide",
            run: async () => {
              await library("hide", { key: t.key, on: true });
              await refreshStatus();
              if (selectedKey === t.key) setSelectedKey(null);
            },
          });
          break;
        case "uninstall": {
          const response = await fetch(
            `/api/characters?root=${encodeURIComponent(root ?? "")}&key=${encodeURIComponent(t.key)}`,
          );
          const characters = response.ok ? ((await response.json()).characters as unknown[]).length : 0;
          confirm({
            title: `Uninstall ${t.title}?`,
            body: `This deletes ${root}\\mods\\${t.folder} from Exordium's library.${
              characters ? ` Its save folder holds ${characters} character${characters === 1 ? "" : "s"}.` : ""
            }`,
            action: "Uninstall",
            danger: true,
            checkbox: characters ? "Keep a copy of the characters in Exordium's folder first" : undefined,
            run: async (keepSaves) => {
              const result = await library("uninstall", { key: t.key, root, keepSaves });
              if (selectedKey === t.key) setSelectedKey(null);
              await refreshStatus();
              if (root) await load(root);
              say(
                result.savesBackup
                  ? `${t.title} was uninstalled. Its characters were copied to ${result.savesBackup}.`
                  : `${t.title} was uninstalled.`,
              );
            },
          });
          break;
        }
        case "properties":
          onProperties(t);
          break;
        case "play":
          onPlay(t);
          break;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };
}
