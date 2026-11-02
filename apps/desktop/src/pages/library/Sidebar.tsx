import { FilterIcon, SearchIcon } from "../../components/icons.tsx";
import { ImportRow, ListSection } from "../../components/sidebar.tsx";
import { tr } from "../../lib/i18n.ts";
import type { Incoming } from "../../lib/incoming.ts";
import { readStored, writeStored } from "../../lib/util.ts";
import type { Collection, Filter, Scan, SidebarSection, Title } from "../../types.ts";
import * as React from "react";
import type { ReactNode } from "react";

const FILTERS: Filter[] = ["mods", "cores", "favorites", "recent", "updates", "issues", "hidden"];
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;

export interface SidebarAppearance {
  iconSize: number;
  showStatus: boolean;
  rail: boolean;
}

function filterLabel(filter: Filter): string {
  return {
    mods: tr("Mods"),
    cores: tr("Cores"),
    favorites: tr("Favorites"),
    recent: tr("Recently played"),
    updates: tr("Updates"),
    issues: tr("Issues"),
    hidden: tr("Hidden"),
  }[filter];
}

/** The searchable, filterable and resizable library sidebar. */
export function Sidebar({
  rail,
  onToggleRail,
  search,
  onSearch,
  scan,
  scanning,
  filters,
  onFilters,
  filterCounts,
  onRead,
  soloSection,
  onClearSolo,
  sections,
  collapsed,
  onToggleSection,
  onSectionMenu,
  collectionHead,
  row,
  incoming,
  importPage,
  onOpenImport,
}: {
  rail: boolean;
  onToggleRail: () => void;
  search: string;
  onSearch: (search: string) => void;
  scan: Scan | null;
  scanning: boolean;
  filters: Set<Filter>;
  onFilters: (filters: Set<Filter>) => void;
  filterCounts: Record<Filter, number> & { all: number };
  onRead: (() => void) | null;
  soloSection: SidebarSection | null;
  onClearSolo: () => void;
  sections: SidebarSection[];
  collapsed: Set<string>;
  onToggleSection: (id: string) => void;
  onSectionMenu: (x: number, y: number, section: SidebarSection) => void;
  collectionHead: (c: Collection, rail: boolean) => React.ButtonHTMLAttributes<HTMLButtonElement>;
  row: (t: Title, prefix: string, collection: Collection | null, appearance: SidebarAppearance) => ReactNode;
  incoming: Incoming[];
  importPage: string | null;
  onOpenImport: (key: string) => void;
}) {
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [width, setWidth] = React.useState(() => readStored("exordium.sidebarWidth", 300));
  const [resizing, setResizing] = React.useState(false);
  const [rowHeight, setRowHeight] = React.useState(() => readStored("exordium.sidebarRowHeight", 38));
  const [iconSize, setIconSize] = React.useState(() => readStored("exordium.sidebarIconSize", 24));
  const [textSize, setTextSize] = React.useState(() => readStored("exordium.sidebarTextSize", 13));
  const [showCounts, setShowCounts] = React.useState(() => readStored("exordium.sidebarCounts", true));
  const [showStatus, setShowStatus] = React.useState(() => readStored("exordium.sidebarStatus", true));
  const filterMenu = React.useRef<HTMLDivElement>(null);
  const resize = React.useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const widthRef = React.useRef(width);

  React.useEffect(() => {
    widthRef.current = width;
  }, [width]);

  React.useEffect(() => {
    if (!filterOpen) return;
    const close = (event: PointerEvent) => {
      if (!filterMenu.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [filterOpen]);

  React.useEffect(() => () => {
    document.body.style.userSelect = "";
  }, []);

  function toggleFilter(filter: Filter) {
    const next = new Set(filters);
    if (next.has(filter)) next.delete(filter);
    else next.add(filter);
    onFilters(next);
  }

  function remember<T>(key: string, value: T, setValue: (value: T) => void) {
    setValue(value);
    writeStored(key, value);
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    resize.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = "none";
    setResizing(true);
  }

  function moveResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!resize.current || resize.current.pointerId !== event.pointerId) return;
    const next = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, resize.current.startWidth + event.clientX - resize.current.startX),
    );
    widthRef.current = next;
    setWidth(next);
  }

  function stopResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!resize.current || resize.current.pointerId !== event.pointerId) return;
    resize.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.style.userSelect = "";
    setResizing(false);
    writeStored("exordium.sidebarWidth", Math.round(widthRef.current));
  }

  function resetWidth() {
    setWidth(300);
    writeStored("exordium.sidebarWidth", 300);
  }

  return (
    <aside
      className={(rail ? "sidebar rail" : "sidebar") + (resizing ? " resizing" : "")}
      style={{
        "--sidebar-width": width + "px",
        "--sidebar-row-height": rowHeight + "px",
        "--sidebar-icon-size": iconSize + "px",
        "--sidebar-text-size": textSize + "px",
      } as React.CSSProperties}
    >
      {!rail && (
        <div className="sidebar-head">
          <div className="sidebar-search-row">
            <label className="search sidebar-search">
              <SearchIcon />
              <input
                value={search}
                onChange={(event) => onSearch(event.currentTarget.value)}
                placeholder={tr("Search the library")}
                aria-label={tr("Search the library")}
              />
            </label>
            <div className="sidebar-filter-holder" ref={filterMenu}>
              <button
                type="button"
                className={filterOpen || filters.size > 0 ? "sidebar-filter-button on" : "sidebar-filter-button"}
                aria-label={tr("Filters")}
                data-tooltip={tr("Filters")}
                aria-expanded={filterOpen}
                aria-controls="sidebar-filter-menu"
                onClick={() => setFilterOpen((open) => !open)}
              >
                <FilterIcon />
              </button>
              {filterOpen && (
                <div id="sidebar-filter-menu" className="sidebar-filter-menu">
                  <strong>{tr("Filters")}</strong>
                  <div className="grid-category-list">
                    <label>
                      <input type="checkbox" checked={filters.size === 0} onChange={() => onFilters(new Set())} />
                      <span>{tr("All titles")}</span>
                      <small>{filterCounts.all}</small>
                    </label>
                    {FILTERS.map((option) => (
                      <label key={option}>
                        <input
                          type="checkbox"
                          checked={filters.has(option)}
                          disabled={option === "hidden" && filterCounts.hidden === 0}
                          onChange={() => toggleFilter(option)}
                        />
                        <span>{filterLabel(option)}</span>
                        <small>{filterCounts[option]}</small>
                      </label>
                    ))}
                  </div>
                  <div className="sidebar-appearance">
                    <strong>{tr("Appearance")}</strong>
                    <label className="grid-slider">
                      <span>
                        {tr("Row height")}
                        <output>{rowHeight}px</output>
                      </span>
                      <input
                        type="range"
                        min="32"
                        max="52"
                        step="2"
                        value={rowHeight}
                        onChange={(event) =>
                          remember("exordium.sidebarRowHeight", Number(event.currentTarget.value), setRowHeight)}
                      />
                    </label>
                    <label className="grid-slider">
                      <span>
                        {tr("Icon size")}
                        <output>{iconSize}px</output>
                      </span>
                      <input
                        type="range"
                        min="18"
                        max="34"
                        step="2"
                        value={iconSize}
                        onChange={(event) =>
                          remember("exordium.sidebarIconSize", Number(event.currentTarget.value), setIconSize)}
                      />
                    </label>
                    <label className="grid-slider">
                      <span>
                        {tr("Text size")}
                        <output>{textSize}px</output>
                      </span>
                      <input
                        type="range"
                        min="11"
                        max="16"
                        step="1"
                        value={textSize}
                        onChange={(event) =>
                          remember("exordium.sidebarTextSize", Number(event.currentTarget.value), setTextSize)}
                      />
                    </label>
                    <div className="grid-option-list">
                      <label>
                        <input
                          type="checkbox"
                          checked={showCounts}
                          onChange={(event) =>
                            remember("exordium.sidebarCounts", event.currentTarget.checked, setShowCounts)}
                        />
                        <span>{tr("Show section counts")}</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={showStatus}
                          onChange={(event) =>
                            remember("exordium.sidebarStatus", event.currentTarget.checked, setShowStatus)}
                        />
                        <span>{tr("Show status indicators")}</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="list">
        {scanning && !scan && <p className="muted pad">{tr("Reading the install…")}</p>}
        {!scanning && !scan && onRead && (
          <div className="pad">
            <p className="muted small">{tr("The library has not been read yet.")}</p>
            <button type="button" className="ghost primary compact" onClick={onRead}>{tr("Read library")}</button>
          </div>
        )}
        {soloSection && (
          <div className="solo-bar">
            <span>{tr("Only {name}", { name: soloSection.name })}</span>
            <button type="button" className="small-button" onClick={onClearSolo}>{tr("View all")}</button>
          </div>
        )}
        {incoming.length > 0 && (
          <ListSection
            label={tr("IN PROGRESS ({count})", { count: incoming.length })}
            collapsed={collapsed.has("incoming")}
            onToggle={() => onToggleSection("incoming")}
          >
            {incoming.map((item) => (
              <ImportRow
                key={item.key}
                item={item}
                rail={rail}
                selected={item.key === importPage}
                onOpen={() => onOpenImport(item.key)}
              />
            ))}
          </ListSection>
        )}
        {sections.map((section) => {
          const collection = section.collection;
          const onContextMenu = (event: React.MouseEvent) => {
            event.preventDefault();
            onSectionMenu(event.clientX, event.clientY, section);
          };
          return (
            <ListSection
              key={section.id}
              label={section.label + (showCounts ? " · " + section.titles.length : "")}
              collapsed={collapsed.has(section.id)}
              onToggle={() => onToggleSection(section.id)}
              head={collection ? { ...collectionHead(collection, rail), onContextMenu } : { onContextMenu }}
            >
              {collection
                ? section.titles.length > 0
                  ? section.titles.map((title) =>
                    row(title, "collection-" + collection.id + "-", collection, { iconSize, showStatus, rail })
                  )
                  : <p className="muted small pad">{tr("Drag titles here, or right-click one → Add to.")}</p>
                : section.titles.map((title) => row(title, section.id + "-", null, { iconSize, showStatus, rail }))}
            </ListSection>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <button
          type="button"
          className="square sidebar-fold-button"
          aria-label={rail ? tr("Expand the sidebar") : tr("Fold the sidebar to icons")}
          data-tooltip={rail ? tr("Expand the sidebar") : tr("Fold the sidebar to icons")}
          data-tooltip-placement="top"
          onClick={onToggleRail}
        >
          {rail ? "»" : "«"}
        </button>
      </div>
      {!rail && (
        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={tr("Resize sidebar")}
          onDoubleClick={resetWidth}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
        />
      )}
    </aside>
  );
}
