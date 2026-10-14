import type * as React from "react";
import type { ReactNode } from "react";
import { SearchIcon } from "../../components/icons.tsx";
import { ListSection } from "../../components/sidebar.tsx";
import type { Collection, Filter, Scan, SidebarSection, Title } from "../../types.ts";

/**
 * The library's sidebar: search, the filter chips and the icon-rail toggle on top, then each section
 * (Favorites, the collections, Recent, Mods, Cores), foldable, with a menu on its header.
 */
export function Sidebar(
  {
    rail,
    onToggleRail,
    search,
    onSearch,
    scan,
    scanning,
    filter,
    onFilter,
    hiddenCount,
    onRead,
    soloSection,
    onClearSolo,
    sections,
    collapsed,
    onToggleSection,
    onSectionMenu,
    collectionHead,
    row,
  }: {
    rail: boolean;
    onToggleRail: () => void;
    search: string;
    onSearch: (search: string) => void;
    scan: Scan | null;
    scanning: boolean;
    filter: Filter;
    onFilter: (filter: Filter) => void;
    hiddenCount: number;
    /** Reads the library; null before setup has made one. */
    onRead: (() => void) | null;
    soloSection: SidebarSection | null;
    onClearSolo: () => void;
    sections: SidebarSection[];
    collapsed: Set<string>;
    onToggleSection: (id: string) => void;
    onSectionMenu: (x: number, y: number, section: SidebarSection) => void;
    /** A collection's header: its drag and drop. */
    collectionHead: (c: Collection) => React.ButtonHTMLAttributes<HTMLButtonElement>;
    row: (t: Title, prefix: string, collection: Collection | null) => ReactNode;
  },
) {
  return (
    <aside className={rail ? "sidebar rail" : "sidebar"}>
      <div className="sidebar-head">
        <div className="sidebar-top">
          {!rail && (
            <label className="search">
              <SearchIcon />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearch(e.currentTarget.value)}
                placeholder={scan ? `Search ${scan.mods.length} mods and ${scan.cores.length} cores` : "Search"}
                aria-label="Search the library"
              />
            </label>
          )}
          <button
            type="button"
            className="square rail-toggle"
            aria-label={rail ? "Expand the sidebar" : "Fold the sidebar to icons"}
            title={rail ? "Expand the sidebar" : "Fold the sidebar to icons"}
            onClick={onToggleRail}
          >
            {rail ? "»" : "«"}
          </button>
        </div>
        {!rail && (
          <div className="chips">
            {(["all", "mods", "cores", "issues", ...(hiddenCount ? ["hidden" as const] : [])] as const).map((f) => (
              <button
                type="button"
                key={f}
                className={filter === f ? "chip on" : "chip"}
                onClick={() => onFilter(f)}
              >
                {f[0]!.toUpperCase() + f.slice(1)}
                {f === "hidden" ? ` · ${hiddenCount}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="list">
        {scanning && !scan && <p className="muted pad">Reading the install…</p>}
        {!scanning && !scan && onRead && (
          <div className="pad">
            <p className="muted small">The library has not been read yet.</p>
            <button type="button" className="ghost primary compact" onClick={onRead}>Read library</button>
          </div>
        )}
        {soloSection && (
          <div className="solo-bar">
            <span>Only {soloSection.name}</span>
            <button type="button" className="link-button" onClick={onClearSolo}>View all</button>
          </div>
        )}
        {sections.map((section) => {
          const c = section.collection;
          const onContextMenu = (event: React.MouseEvent) => {
            event.preventDefault();
            onSectionMenu(event.clientX, event.clientY, section);
          };
          return (
            <ListSection
              key={section.id}
              label={`${section.label} · ${section.titles.length}`}
              collapsed={collapsed.has(section.id)}
              onToggle={() => onToggleSection(section.id)}
              head={c ? { ...collectionHead(c), onContextMenu } : { onContextMenu }}
            >
              {c
                ? section.titles.length > 0
                  ? section.titles.map((t) => row(t, `collection-${c.id}-`, c))
                  : <p className="muted small pad">Drag titles here, or right-click one → Add to.</p>
                : section.titles.map((t) => row(t, `${section.id}-`, null))}
            </ListSection>
          );
        })}
      </div>
    </aside>
  );
}
