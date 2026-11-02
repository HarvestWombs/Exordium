import { CloseIcon, FilterIcon, GripIcon, SearchIcon } from "../../components/icons.tsx";
import { ImportRow, ListSection } from "../../components/sidebar.tsx";
import { tr } from "../../lib/i18n.ts";
import type { Incoming } from "../../lib/incoming.ts";
import { startPointerDrag } from "../../lib/pointer-drag.ts";
import { moveInOrder } from "../../lib/shelf-order.ts";
import { readStored, writeStored } from "../../lib/util.ts";
import type { Collection, Scan, SidebarSection, Title } from "../../types.ts";
import * as React from "react";
import type { ReactNode } from "react";

const MIN_WIDTH = 220;
const MAX_WIDTH = 520;
type SectionDrop = { id: string; edge: "before" | "after" };

export interface SidebarAppearance {
  iconSize: number;
  showStatus: boolean;
  rail: boolean;
}

/** The searchable, filterable and resizable library sidebar. */
export function Sidebar({
  rail,
  onToggleRail,
  search,
  onSearch,
  scan,
  scanning,
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
  const [hiddenSections, setHiddenSections] = React.useState<Set<string>>(() =>
    new Set(readStored<string[]>("exordium.sidebarHiddenSections", []))
  );
  const [sectionOrder, setSectionOrder] = React.useState<string[]>(() =>
    readStored<string[]>("exordium.sidebarSectionOrder", [])
  );
  const [draggedSection, setDraggedSection] = React.useState<string | null>(null);
  const [sectionDrop, setSectionDrop] = React.useState<SectionDrop | null>(null);
  const filterMenu = React.useRef<HTMLDivElement>(null);
  const sectionList = React.useRef<HTMLDivElement>(null);
  const resize = React.useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const widthRef = React.useRef(width);
  const order = new Map(sectionOrder.map((id, index) => [id, index]));
  const orderedSections = sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const aOrder = order.get(a.section.id);
      const bOrder = order.get(b.section.id);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ section }) => section);
  const visibleSections = orderedSections.filter((section) => !hiddenSections.has(section.id));

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

  function remember<T>(key: string, value: T, setValue: (value: T) => void) {
    setValue(value);
    writeStored(key, value);
  }

  function toggleSectionVisible(id: string) {
    setHiddenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored("exordium.sidebarHiddenSections", [...next]);
      return next;
    });
  }

  function moveSection(source: string, target: string, edge: "before" | "after") {
    const next = moveInOrder(sectionOrder, orderedSections.map((section) => section.id), source, target, edge);
    setSectionOrder(next);
    writeStored("exordium.sidebarSectionOrder", next);
  }

  function nudgeSection(id: string, direction: -1 | 1) {
    const index = orderedSections.findIndex((section) => section.id === id);
    const target = orderedSections[index + direction];
    if (target) moveSection(id, target.id, direction < 0 ? "before" : "after");
  }

  function sectionDropAt(source: string, y: number): SectionDrop | null {
    const rows = [...(sectionList.current?.querySelectorAll<HTMLElement>("[data-category]") ?? [])];
    const from = rows.findIndex((row) => row.dataset.category === source);
    const below = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    const at = below < 0 ? rows.length : below;
    if (at === from || at === from + 1) return null;
    return at < rows.length
      ? { id: rows[at]!.dataset.category!, edge: "before" }
      : { id: rows[at - 1]!.dataset.category!, edge: "after" };
  }

  function dragSection(event: React.PointerEvent<HTMLElement>, id: string, label: string) {
    let drop: SectionDrop | null = null;
    startPointerDrag(event, {
      label,
      onStart: () => setDraggedSection(id),
      onMove: (_x, y) => {
        const menu = sectionList.current?.closest(".sidebar-filter-menu");
        const rect = menu?.getBoundingClientRect();
        if (menu && rect) menu.scrollTop += y > rect.bottom - 28 ? 12 : y < rect.top + 28 ? -12 : 0;
        drop = sectionDropAt(id, y);
        setSectionDrop(drop);
      },
      onDrop: () => {
        if (drop) moveSection(id, drop.id, drop.edge);
      },
      onEnd: () => {
        setDraggedSection(null);
        setSectionDrop(null);
      },
    });
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
            <div className="search sidebar-search">
              <SearchIcon />
              <input
                value={search}
                onChange={(event) => onSearch(event.currentTarget.value)}
                placeholder={tr("Search the library")}
                aria-label={tr("Search the library")}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-button"
                  aria-label={tr("Clear")}
                  data-tooltip={tr("Clear")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSearch("")}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <div className="sidebar-filter-holder" ref={filterMenu}>
              <button
                type="button"
                className={filterOpen || hiddenSections.size > 0 ? "sidebar-filter-button on" : "sidebar-filter-button"}
                aria-label={tr("Sorting/Appearance")}
                data-tooltip={tr("Sorting/Appearance")}
                aria-expanded={filterOpen}
                aria-controls="sidebar-filter-menu"
                onClick={() => setFilterOpen((open) => !open)}
              >
                <FilterIcon />
              </button>
              {filterOpen && (
                <div id="sidebar-filter-menu" className="sidebar-filter-menu">
                  <div className="grid-customizer-section">
                    <strong>{tr("Sections")}</strong>
                    <div className="grid-category-list" ref={sectionList}>
                      {orderedSections.map((section) => (
                        <div
                          key={section.id}
                          data-category={section.id}
                          className={[
                            "grid-category-row",
                            draggedSection === section.id ? "dragging" : "",
                            sectionDrop?.id === section.id ? `drop-${sectionDrop.edge}` : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <button
                            type="button"
                            className="grid-category-grip"
                            aria-label={tr("Reorder")}
                            data-tooltip={tr("Reorder")}
                            onPointerDown={(event) => dragSection(event, section.id, section.name)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                event.preventDefault();
                                nudgeSection(section.id, event.key === "ArrowUp" ? -1 : 1);
                              }
                            }}
                          >
                            <GripIcon />
                          </button>
                          <label>
                            <input
                              type="checkbox"
                              checked={!hiddenSections.has(section.id)}
                              onChange={() => toggleSectionVisible(section.id)}
                            />
                            <span>{section.name}</span>
                            <small>{section.titles.length}</small>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid-customizer-section">
                    <strong>{tr("Display")}</strong>
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
                  </div>
                  <div className="grid-customizer-section">
                    <strong>{tr("Rows")}</strong>
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
        {visibleSections.map((section) => {
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
