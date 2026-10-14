import * as React from "react";
import type { Collection, NameRequest, Status, Title } from "../types.ts";

type Drag = { type: "collection"; id: string } | { type: "title"; key: string; from: string | null };

/** `item` moved to just before `before` (to the end when null or absent). */
function moveBefore<T>(list: T[], item: T, before: T | null): T[] {
  const rest = list.filter((x) => x !== item);
  const at = before === null ? -1 : rest.indexOf(before);
  rest.splice(at < 0 ? rest.length : at, 0, item);
  return rest;
}

/**
 * The player's collections (server.ts collectionsRoute): every change is shown at once, the server is
 * told after, and a failure reads the real state back. Also the drag and drop: a title dragged onto a
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
  const drag = React.useRef<Drag | null>(null);
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
      throw new Error(result.error ?? "That did not work.");
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

  function dropOnCollection(target: Collection) {
    const dragged = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!dragged) return;
    if (dragged.type === "collection") {
      if (dragged.id === target.id) return;
      const ids = moveBefore(collections.map((c) => c.id), dragged.id, target.id);
      setCollections(ids.map((id) => collections.find((c) => c.id === id)!));
      void collectionAction({ action: "order", ids }).catch(reportError);
    } else if (!target.keys.includes(dragged.key)) {
      setCollections(collections.map((c) => c.id === target.id ? { ...c, keys: [...c.keys, dragged.key] } : c));
      void collectionAction({ action: "add", id: target.id, key: dragged.key }).catch(reportError);
    }
  }

  async function dropOnRow(target: Collection, key: string) {
    const dragged = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!dragged || dragged.type !== "title" || dragged.key === key) return;
    const keys = moveBefore(target.keys, dragged.key, key);
    setCollections(collections.map((c) => c.id === target.id ? { ...c, keys } : c));
    try {
      if (!target.keys.includes(dragged.key)) {
        await collectionAction({ action: "add", id: target.id, key: dragged.key });
      }
      await collectionAction({ action: "items", id: target.id, keys });
    } catch (err) {
      reportError(err);
    }
  }

  const endDrag = () => {
    drag.current = null;
    setDropTarget(null);
  };

  /** A collection's header: draggable, and a drop target for titles and other collections. */
  function headDnd(c: Collection): React.ButtonHTMLAttributes<HTMLButtonElement> {
    return {
      className: dropTarget === c.id ? "drop" : "",
      draggable: true,
      title: "Drag to reorder; drop a title here to add it; right-click for more",
      onDragStart: (event) => {
        drag.current = { type: "collection", id: c.id };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", c.name);
      },
      onDragEnd: endDrag,
      onDragOver: (event) => {
        if (!drag.current) return;
        event.preventDefault();
        setDropTarget(c.id);
      },
      onDragLeave: () => setDropTarget((current) => (current === c.id ? null : current)),
      onDrop: (event) => {
        event.preventDefault();
        dropOnCollection(c);
      },
    };
  }

  /** A title's row: every row drags onto a collection; rows inside one also reorder it. */
  function rowDnd(t: Title, collection: Collection | null): React.ButtonHTMLAttributes<HTMLButtonElement> {
    return {
      draggable: true,
      onDragStart: (event) => {
        drag.current = { type: "title", key: t.key, from: collection?.id ?? null };
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", t.title);
      },
      onDragEnd: endDrag,
      ...(collection
        ? {
          onDragOver: (event: React.DragEvent) => {
            if (drag.current?.type === "title") event.preventDefault();
          },
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            void dropOnRow(collection, t.key);
          },
        }
        : {}),
    };
  }

  function newCollection(key?: string) {
    setNameDialog({
      title: "New collection",
      action: "Create",
      initial: "",
      run: (name) => collectionAction({ action: "create", name, ...(key ? { key } : {}) }),
    });
  }

  function renameCollection(c: Collection) {
    setNameDialog({
      title: "Rename collection",
      action: "Rename",
      initial: c.name,
      run: (name) => collectionAction({ action: "rename", id: c.id, name }),
    });
  }

  return { collectionAction, setMember, headDnd, rowDnd, newCollection, renameCollection };
}
