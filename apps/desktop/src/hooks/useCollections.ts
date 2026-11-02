import { tr } from "../lib/i18n.ts";
import { startPointerDrag } from "../lib/pointer-drag.ts";
import * as React from "react";
import type { Collection, NameRequest, Status, Title } from "../types.ts";

type Drag = { type: "collection"; id: string } | { type: "title"; key: string };
/** What a drag is over: a collection's header, or the row of `key` inside the collection. */
type Over = { id: string; key: string | null };
type DropAttributes = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  "data-drop-collection"?: string;
  "data-drop-key"?: string;
  "data-tooltip"?: string;
  "data-tooltip-placement"?: string;
};

/** `item` moved to just before `before` (to the end when null or absent). */
function moveBefore<T>(list: T[], item: T, before: T | null): T[] {
  const rest = list.filter((x) => x !== item);
  const at = before === null ? -1 : rest.indexOf(before);
  rest.splice(at < 0 ? rest.length : at, 0, item);
  return rest;
}

function overAt(x: number, y: number): Over | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-collection]");
  if (!element) return null;
  return { id: element.dataset.dropCollection!, key: element.dataset.dropKey ?? null };
}

const overId = ({ id, key }: Over) => key === null ? id : `${id}/${key}`;

/**
 * The player's collections (server.ts collectionsRoute): every change is shown at once, the server is
 * told after, and a failure reads the real state back. Also the dragging: a title dragged onto a
 * collection's header joins it, a collection's header dragged onto another moves before it, and a title
 * dropped on one inside a collection takes its place.
 */
export function useCollections(
  { collections, setStatus, refreshStatus, reportError, setNameDialog }: {
    collections: Collection[];
    setStatus: React.Dispatch<React.SetStateAction<Status | null>>;
    refreshStatus: () => Promise<Status>;
    reportError: (err: unknown) => void;
    setNameDialog: (request: NameRequest) => void;
  },
) {
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

  function setCollections(next: Collection[]) {
    setStatus((current) => current && { ...current, collections: next });
  }

  async function collectionAction(body: Record<string, unknown>) {
    const response = await fetch("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      void refreshStatus();
      throw new Error(result.error ?? tr("That did not work."));
    }
    setCollections(result.collections);
  }

  /** A title in or out of a collection, from the title menu's Add to and Remove from. */
  function setMember(id: string, key: string, on: boolean) {
    setCollections(
      collections.map((c) => c.id === id ? { ...c, keys: on ? [...c.keys, key] : c.keys.filter((k) => k !== key) } : c),
    );
    void collectionAction({ action: on ? "add" : "remove", id, key }).catch(reportError);
  }

  function dropOnCollection(dragged: Drag, target: Collection) {
    if (dragged.type === "collection") {
      const ids = moveBefore(collections.map((c) => c.id), dragged.id, target.id);
      setCollections(ids.map((id) => collections.find((c) => c.id === id)!));
      void collectionAction({ action: "order", ids }).catch(reportError);
    } else {
      setCollections(collections.map((c) => c.id === target.id ? { ...c, keys: [...c.keys, dragged.key] } : c));
      void collectionAction({ action: "add", id: target.id, key: dragged.key }).catch(reportError);
    }
  }

  async function dropOnRow(dragged: string, target: Collection, key: string) {
    const keys = moveBefore(target.keys, dragged, key);
    setCollections(collections.map((c) => c.id === target.id ? { ...c, keys } : c));
    try {
      if (!target.keys.includes(dragged)) {
        await collectionAction({ action: "add", id: target.id, key: dragged });
      }
      await collectionAction({ action: "items", id: target.id, keys });
    } catch (err) {
      reportError(err);
    }
  }

  /** Whether dropping there changes anything: only those get lit. */
  function accepts(dragged: Drag, over: Over): boolean {
    if (dragged.type === "collection") return over.key === null && over.id !== dragged.id;
    if (over.key !== null) return over.key !== dragged.key;
    return !collections.find((c) => c.id === over.id)?.keys.includes(dragged.key);
  }

  function startDrag(event: React.PointerEvent<HTMLElement>, dragged: Drag, label: string) {
    let over: Over | null = null;
    startPointerDrag(event, {
      label,
      onMove: (x, y) => {
        const found = overAt(x, y);
        over = found && accepts(dragged, found) ? found : null;
        setDropTarget(over && overId(over));
      },
      onDrop: () => {
        const target = over && collections.find((c) => c.id === over!.id);
        if (!target) return;
        if (dragged.type === "title" && over!.key !== null) void dropOnRow(dragged.key, target, over!.key);
        else dropOnCollection(dragged, target);
      },
      onEnd: () => setDropTarget(null),
    });
  }

  /** A collection's header: draggable, and a drop target for titles and other collections. */
  function headDnd(c: Collection, rail: boolean): DropAttributes {
    return {
      className: dropTarget === c.id ? "drop" : "",
      "data-drop-collection": c.id,
      ...(rail
        ? {
          "data-tooltip": tr("Drag to reorder; drop a title here to add it; right-click for more"),
          "data-tooltip-placement": "right",
        }
        : {}),
      onPointerDown: (event) => startDrag(event, { type: "collection", id: c.id }, c.name),
    };
  }

  /** A title's row: every row drags onto a collection; rows inside one also reorder it. */
  function rowDnd(t: Title, collection: Collection | null): DropAttributes {
    return {
      onPointerDown: (event) => startDrag(event, { type: "title", key: t.key }, t.title),
      ...(collection
        ? {
          className: dropTarget === overId({ id: collection.id, key: t.key }) ? "drop" : "",
          "data-drop-collection": collection.id,
          "data-drop-key": t.key,
        }
        : {}),
    };
  }

  function newCollection(key?: string) {
    setNameDialog({
      title: tr("New collection"),
      action: tr("Create"),
      initial: "",
      run: (name) => collectionAction({ action: "create", name, ...(key ? { key } : {}) }),
    });
  }

  function renameCollection(c: Collection) {
    setNameDialog({
      title: tr("Rename collection"),
      action: tr("Rename"),
      initial: c.name,
      run: (name) => collectionAction({ action: "rename", id: c.id, name }),
    });
  }

  return { collectionAction, setMember, headDnd, rowDnd, newCollection, renameCollection };
}
