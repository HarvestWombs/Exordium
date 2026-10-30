import { tr } from "../lib/i18n.ts";
import type { Collection, SidebarSection } from "../types.ts";
import { PopupMenu } from "./menus.tsx";

/**
 * A sidebar section's header menu, as Steam's: view only this section (or all again), fold it, fold
 * every collection at once, and for a collection, rename or delete it.
 */
export function SectionMenu(
  {
    x,
    y,
    section,
    solo,
    collapsed,
    hasCollections,
    onClose,
    onSolo,
    onToggle,
    onFoldCollections,
    onRename,
    onNewCollection,
    onDelete,
  }: {
    x: number;
    y: number;
    section: SidebarSection;
    solo: string | null;
    collapsed: boolean;
    hasCollections: boolean;
    onClose: () => void;
    onSolo: (id: string | null) => void;
    onToggle: () => void;
    onFoldCollections: (fold: boolean) => void;
    onRename: (c: Collection) => void;
    onNewCollection: () => void;
    onDelete: (c: Collection) => void;
  },
) {
  const c = section.collection;
  const done = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <PopupMenu x={x} y={y} onClose={onClose}>
      <button type="button" role="menuitem" onClick={done(() => onSolo(solo === section.id ? null : section.id))}>
        {solo === section.id ? tr("View all") : tr("View only {name}", { name: section.name })}
      </button>
      <button type="button" role="menuitem" onClick={done(onToggle)}>
        {collapsed ? tr("Expand") : tr("Collapse")}
      </button>
      {hasCollections && (
        <>
          <button type="button" role="menuitem" onClick={done(() => onFoldCollections(false))}>
            {tr("Expand all collections")}
          </button>
          <button type="button" role="menuitem" onClick={done(() => onFoldCollections(true))}>
            {tr("Collapse all collections")}
          </button>
        </>
      )}
      <hr />
      {c && <button type="button" role="menuitem" onClick={done(() => onRename(c))}>{tr("Rename…")}</button>}
      <button type="button" role="menuitem" onClick={done(onNewCollection)}>{tr("New collection…")}</button>
      {c && (
        <>
          <hr />
          <button type="button" role="menuitem" onClick={done(() => onDelete(c))}>{tr("Delete collection")}</button>
        </>
      )}
    </PopupMenu>
  );
}
