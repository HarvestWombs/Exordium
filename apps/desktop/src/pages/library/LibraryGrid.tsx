import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import type { ReactNode } from "react";
import {
  CloseIcon,
  FilterIcon,
  GripIcon,
  HeartIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  TitleIcon,
} from "../../components/icons.tsx";
import { PopupMenu } from "../../components/menus.tsx";
import { PreviewCard } from "../../components/PreviewCard.tsx";
import type { Incoming } from "../../lib/incoming.ts";
import { artUrl, screenshotUrl } from "../../lib/art.ts";
import { randomShots } from "../../lib/docs.ts";
import { startPointerDrag } from "../../lib/pointer-drag.ts";
import { moveInOrder } from "../../lib/shelf-order.ts";
import { playTime, readStored, relative, writeStored } from "../../lib/util.ts";
import type { Collection, Playtime, Screenshot, Title } from "../../types.ts";

const LEGACY_CAPSULE_SIZES = { small: 132, medium: 170, large: 220 } as const;
type GridSort = "library" | "name" | "recent" | "playtime";
type CategoryDrop = { id: string; edge: "before" | "after" };

function savedNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && saved >= min && saved <= max) return saved;
  } catch {
    // Storage unavailable: the default size.
  }
  return fallback;
}

function savedPortraitSize(): number {
  const saved = savedNumber("exordium.portraitSize", 0, 112, 260);
  if (saved) return saved;
  try {
    const legacy = localStorage.getItem("exordium.gridSize") as keyof typeof LEGACY_CAPSULE_SIZES | null;
    if (legacy && legacy in LEGACY_CAPSULE_SIZES) return LEGACY_CAPSULE_SIZES[legacy];
  } catch {
    // Storage unavailable: use the former medium size.
  }
  return LEGACY_CAPSULE_SIZES.medium;
}

function savedSort(): GridSort {
  const saved = readStored<string>("exordium.gridSort", "library");
  return saved === "name" || saved === "recent" || saved === "playtime" ? saved : "library";
}

/** A mod on its way into the library: live progress, with cancellation in the footer on hover. */
function ImportCapsule(
  { item, onOpen, onCancel }: { item: Incoming; onOpen: () => void; onCancel: () => void },
) {
  return (
    <div
      className="capsule importing"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="capsule-art">
        <div className="capsule-fallback mod">
          <span className="spinner" aria-hidden="true" />
          <span>{item.title}</span>
        </div>
        <div className="capsule-import-progress">
          <strong>{item.status}</strong>
          {item.percent !== null && (
            <div className="update-progress">
              <span style={{ width: `${item.percent}%` }} />
            </div>
          )}
          <button
            type="button"
            className="small-button capsule-cancel"
            disabled={!item.cancellable}
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
          >
            {item.kind === "download" ? tr("Cancel download") : tr("Cancel import")}
          </button>
        </div>
      </div>
      <div className="capsule-name">{item.title}</div>
      <div className="capsule-sub">{item.subtitle}</div>
    </div>
  );
}

interface PreviewState {
  title: Title;
  rect: DOMRect;
  image: string | null;
}

function CapsulePreview(
  { preview, playedAt, playtime, live, root, art }: {
    preview: PreviewState;
    playedAt: string | null;
    playtime: Playtime | null;
    live: boolean;
    root: string;
    art: number;
  },
) {
  const t = preview.title;
  return (
    <PreviewCard
      rect={preview.rect}
      title={t.title}
      media={preview.image ? <img src={preview.image} alt="" /> : (
        <div className={`capsule-preview-fallback ${t.kind}`}>
          <TitleIcon t={t} root={root} art={art} size={64} />
        </div>
      )}
    >
      <p className={live ? "capsule-preview-state live" : "capsule-preview-state"}>
        <span className="dot" />
        {live ? tr("PLAYING") : `${tr("LAST PLAYED")} ${playedAt ? relative(playedAt) : "—"}`}
      </p>
      <dl>
        <dt>{tr("PLAY TIME")}</dt>
        <dd>{playtime ? playTime(playtime.seconds) : "—"}</dd>
        <dt>{t.kind === "core" ? tr("CORE") : tr("VERSION")}</dt>
        <dd>{(t.kind === "core" ? t.core : t.version) ?? "—"}</dd>
      </dl>
    </PreviewCard>
  );
}

/**
 * The library as Steam shows it in grid view: the whole main area, a shelf per group, a 2:3 capsule
 * per title. The portrait art when a title has one; otherwise its icon and name over its banner,
 * dimmed (a wide banner cropped to 2:3 is usually just sky). Click opens the title's page; Play is on the capsule; right-click is the title's menu.
 */
export function LibraryGrid(
  {
    shelves,
    before,
    search,
    onSearch,
    onImport,
    incoming,
    onOpenImport,
    onCancelImport,
    collectionsPage,
    onNewCollection,
    onRenameCollection,
    onDeleteCollection,
    showLatestUploads,
    onShowLatestUploads,
    root,
    art,
    running,
    favorites,
    playedAt,
    playtime,
    starting,
    onOpen,
    onPlay,
    onMenu,
  }: {
    /** One per sidebar section, by the section's id; a shelf folds on its own, apart from the sidebar. */
    shelves: { id: string; label: string; titles: Title[]; collection?: Collection }[];
    /** Shown above the shelves: the Latest uploads row. */
    before: ReactNode;
    search: string;
    onSearch: (search: string) => void;
    onImport: () => void;
    /** Mods on their way in, on their own shelf until they land. */
    incoming: Incoming[];
    onOpenImport: (key: string) => void;
    onCancelImport: (item: Incoming) => void;
    /** The Collections page: the same shelves, the player's collections only. */
    collectionsPage: boolean;
    onNewCollection: () => void;
    onRenameCollection: (collection: Collection) => void;
    onDeleteCollection: (collection: Collection) => void;
    showLatestUploads: boolean;
    onShowLatestUploads: (show: boolean) => Promise<void>;
    root: string | null;
    art: number;
    running: Set<string>;
    favorites: Set<string>;
    playedAt: Record<string, string>;
    playtime: Record<string, Playtime>;
    starting: string | null;
    onOpen: (key: string) => void;
    onPlay: (t: Title) => void;
    onMenu: (x: number, y: number, t: Title, from: Collection | null) => void;
  },
) {
  const [portraitSize, setPortraitSize] = React.useState(savedPortraitSize);
  const [textSize, setTextSize] = React.useState(() => savedNumber("exordium.cardTextSize", 13, 11, 17));
  const [cardSpacing, setCardSpacing] = React.useState(() => savedNumber("exordium.cardSpacing", 16, 6, 32));
  const [showMetadata, setShowMetadata] = React.useState(() => readStored<boolean>("exordium.showCardMetadata", true));
  const [hoverPreviews, setHoverPreviews] = React.useState(() => readStored<boolean>("exordium.hoverPreviews", true));
  const [previewDelay, setPreviewDelay] = React.useState(() => savedNumber("exordium.previewDelay", 420, 150, 1200));
  const [sort, setSort] = React.useState<GridSort>(savedSort);
  const [customizerOpen, setCustomizerOpen] = React.useState(false);
  const [latestUploadsBusy, setLatestUploadsBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  const [collectionMenu, setCollectionMenu] = React.useState<
    {
      x: number;
      y: number;
      collection: Collection;
    } | null
  >(null);
  const previewTimer = React.useRef<number | null>(null);
  const previewImages = React.useRef(new Map<string, string | null>());
  const customizer = React.useRef<HTMLDivElement>(null);
  const categoryList = React.useRef<HTMLDivElement>(null);

  const hidePreview = React.useCallback(() => {
    if (previewTimer.current !== null) globalThis.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreview(null);
  }, []);

  const showPreview = React.useCallback((t: Title, element: HTMLElement) => {
    if (!root || !hoverPreviews) return;
    if (previewTimer.current !== null) globalThis.clearTimeout(previewTimer.current);
    const rect = element.getBoundingClientRect();
    previewTimer.current = globalThis.setTimeout(() => {
      previewTimer.current = null;
      const fallback = t.art.banner
        ? artUrl(root, t.key, "banner", art)
        : t.art.portrait
        ? artUrl(root, t.key, "portrait", art)
        : null;
      const cacheKey = `${root}|${t.key}|${art}`;
      const cached = previewImages.current.get(cacheKey);
      setPreview({ title: t, rect, image: cached === undefined ? fallback : cached });
      if (cached !== undefined || t.screenshots === 0) return;
      void fetch(`/api/screenshots?root=${encodeURIComponent(root)}&key=${encodeURIComponent(t.key)}`)
        .then(async (response) => response.ok ? (await response.json()).screenshots as Screenshot[] : [])
        .then((shots) => {
          const shot = randomShots(shots, t.key)[0];
          const image = shot ? screenshotUrl(root, t.key, shot.name) : fallback;
          previewImages.current.set(cacheKey, image);
          setPreview((current) => current?.title.key === t.key ? { ...current, image } : current);
        })
        .catch(() => previewImages.current.set(cacheKey, fallback));
    }, previewDelay);
  }, [art, hoverPreviews, previewDelay, root]);

  React.useEffect(() => hidePreview, [hidePreview]);
  React.useEffect(() => hidePreview(), [hidePreview, hoverPreviews, previewDelay]);
  React.useEffect(() => {
    if (!customizerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!customizer.current?.contains(event.target as Node)) setCustomizerOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCustomizerOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [customizerOpen]);

  function remember<T>(key: string, value: T, setValue: (value: T) => void) {
    setValue(value);
    writeStored(key, value);
  }
  const [hiddenCategories, setHiddenCategories] = React.useState<Set<string>>(() =>
    new Set(readStored<string[]>("exordium.gridHiddenCategories", []))
  );
  const [categoryOrder, setCategoryOrder] = React.useState<string[]>(() =>
    readStored<string[]>("exordium.gridCategoryOrder", [])
  );
  const [draggedCategory, setDraggedCategory] = React.useState<string | null>(null);
  const [categoryDrop, setCategoryDrop] = React.useState<CategoryDrop | null>(null);
  const [folded, setFolded] = React.useState<Set<string>>(() =>
    new Set(readStored<string[]>("exordium.homeCollapsed", []))
  );
  const order = new Map(categoryOrder.map((id, index) => [id, index]));
  const orderedShelves = shelves
    .map((shelf, index) => ({ shelf, index }))
    .sort((a, b) => {
      const aOrder = order.get(a.shelf.id);
      const bOrder = order.get(b.shelf.id);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ shelf }) => shelf);
  const visibleShelves = orderedShelves.filter((shelf) => !hiddenCategories.has(shelf.id));
  const total = visibleShelves.reduce((count, shelf) => count + shelf.titles.length, 0);
  function sortedTitles(titles: Title[]): Title[] {
    if (sort === "library") return titles;
    return [...titles].sort((a, b) => {
      const difference = sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "recent"
        ? (playedAt[b.key] ?? "").localeCompare(playedAt[a.key] ?? "")
        : (playtime[b.key]?.seconds ?? 0) - (playtime[a.key]?.seconds ?? 0);
      return difference || a.title.localeCompare(b.title);
    });
  }
  function toggleCategory(id: string) {
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored("exordium.gridHiddenCategories", [...next]);
      return next;
    });
  }
  function moveCategory(source: string, target: string, edge: "before" | "after") {
    const next = moveInOrder(categoryOrder, orderedShelves.map((shelf) => shelf.id), source, target, edge);
    setCategoryOrder(next);
    writeStored("exordium.gridCategoryOrder", next);
  }
  function nudgeCategory(id: string, direction: -1 | 1) {
    const index = orderedShelves.findIndex((shelf) => shelf.id === id);
    const target = orderedShelves[index + direction];
    if (target) moveCategory(id, target.id, direction < 0 ? "before" : "after");
  }
  /** Where a category dragged to height y lands: anywhere on the page counts, and its own place is null. */
  function categoryDropAt(source: string, y: number): CategoryDrop | null {
    const rows = [...(categoryList.current?.querySelectorAll<HTMLElement>("[data-category]") ?? [])];
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
  function dragCategory(event: React.PointerEvent<HTMLElement>, id: string, label: string) {
    let drop: CategoryDrop | null = null;
    startPointerDrag(event, {
      label,
      onStart: () => setDraggedCategory(id),
      onMove: (_x, y) => {
        // The menu scrolls in a short window, and a long list needs reaching.
        const menu = categoryList.current?.closest(".grid-customizer-menu");
        const rect = menu?.getBoundingClientRect();
        if (menu && rect) menu.scrollTop += y > rect.bottom - 28 ? 12 : y < rect.top + 28 ? -12 : 0;
        drop = categoryDropAt(id, y);
        setCategoryDrop(drop);
      },
      onDrop: () => {
        if (drop) moveCategory(id, drop.id, drop.edge);
      },
      onEnd: () => {
        setDraggedCategory(null);
        setCategoryDrop(null);
      },
    });
  }
  async function toggleLatestUploads(show: boolean) {
    setLatestUploadsBusy(true);
    try {
      await onShowLatestUploads(show);
    } finally {
      setLatestUploadsBusy(false);
    }
  }
  function toggleShelf(id: string) {
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored("exordium.homeCollapsed", [...next]);
      return next;
    });
  }

  return (
    <div
      className={showMetadata ? "library-grid" : "library-grid hide-card-metadata"}
      style={{
        "--capsule": `${portraitSize}px`,
        "--capsule-text": `${textSize}px`,
        "--capsule-column-gap": `${cardSpacing}px`,
        "--capsule-row-gap": `${cardSpacing + 2}px`,
      } as React.CSSProperties}
    >
      <div className="grid-head">
        <h1>{collectionsPage ? tr("Collections") : tr("Library")}</h1>
        <div className="grid-search-row">
          <div className="search grid-search">
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
          <div className="grid-customizer" ref={customizer}>
            <button
              type="button"
              className={customizerOpen ? "grid-customizer-button on" : "grid-customizer-button"}
              aria-label={tr("Sorting/Appearance")}
              data-tooltip={tr("Sorting/Appearance")}
              aria-expanded={customizerOpen}
              aria-controls="grid-customizer-menu"
              onClick={() => setCustomizerOpen((open) => !open)}
            >
              <FilterIcon />
            </button>
            {customizerOpen && (
              <div id="grid-customizer-menu" className="grid-customizer-menu">
                <div className="grid-customizer-section">
                  <strong>{tr("Filters")}</strong>
                  <div className="grid-category-list" ref={categoryList}>
                    {!collectionsPage && (
                      <div className="grid-category-fixed">
                        <label>
                          <input
                            type="checkbox"
                            checked={showLatestUploads}
                            disabled={latestUploadsBusy}
                            onChange={(event) => void toggleLatestUploads(event.currentTarget.checked)}
                          />
                          <span>{tr("Show latest uploads")}</span>
                        </label>
                      </div>
                    )}
                    {orderedShelves.map((shelf) => (
                      <div
                        key={shelf.id}
                        data-category={shelf.id}
                        className={[
                          "grid-category-row",
                          draggedCategory === shelf.id ? "dragging" : "",
                          categoryDrop?.id === shelf.id ? `drop-${categoryDrop.edge}` : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <button
                          type="button"
                          className="grid-category-grip"
                          aria-label={tr("Reorder")}
                          data-tooltip={tr("Reorder")}
                          onPointerDown={(event) => dragCategory(event, shelf.id, shelf.label)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                              event.preventDefault();
                              nudgeCategory(shelf.id, event.key === "ArrowUp" ? -1 : 1);
                            }
                          }}
                        >
                          <GripIcon />
                        </button>
                        <label>
                          <input
                            type="checkbox"
                            checked={!hiddenCategories.has(shelf.id)}
                            onChange={() => toggleCategory(shelf.id)}
                          />
                          <span>{shelf.label}</span>
                          <small>{shelf.titles.length}</small>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid-customizer-section">
                  <strong>{tr("Display")}</strong>
                  <label className="grid-slider">
                    <span>
                      {tr("Portrait size")}
                      <output>{portraitSize}px</output>
                    </span>
                    <input
                      type="range"
                      min="112"
                      max="260"
                      step="4"
                      value={portraitSize}
                      onChange={(event) =>
                        remember("exordium.portraitSize", Number(event.currentTarget.value), setPortraitSize)}
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
                      max="17"
                      step="1"
                      value={textSize}
                      onChange={(event) =>
                        remember("exordium.cardTextSize", Number(event.currentTarget.value), setTextSize)}
                    />
                  </label>
                  <label className="grid-slider">
                    <span>
                      {tr("Card spacing")}
                      <output>{cardSpacing}px</output>
                    </span>
                    <input
                      type="range"
                      min="6"
                      max="32"
                      step="2"
                      value={cardSpacing}
                      onChange={(event) =>
                        remember("exordium.cardSpacing", Number(event.currentTarget.value), setCardSpacing)}
                    />
                  </label>
                </div>
                <div className="grid-customizer-section">
                  <strong>{tr("Cards")}</strong>
                  <div className="grid-option-list">
                    <label>
                      <input
                        type="checkbox"
                        checked={showMetadata}
                        onChange={(event) =>
                          remember("exordium.showCardMetadata", event.currentTarget.checked, setShowMetadata)}
                      />
                      <span>{tr("Show metadata")}</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={hoverPreviews}
                        onChange={(event) =>
                          remember("exordium.hoverPreviews", event.currentTarget.checked, setHoverPreviews)}
                      />
                      <span>{tr("Hover previews")}</span>
                    </label>
                  </div>
                  <label className="grid-select-row">
                    <span>{tr("Preview delay")}</span>
                    <select
                      value={previewDelay}
                      disabled={!hoverPreviews}
                      onChange={(event) =>
                        remember("exordium.previewDelay", Number(event.currentTarget.value), setPreviewDelay)}
                    >
                      <option value="200">{tr("Fast")}</option>
                      <option value="420">{tr("Normal")}</option>
                      <option value="750">{tr("Slow")}</option>
                      <option value="1000">1 s</option>
                    </select>
                  </label>
                  <label className="grid-select-row">
                    <span>{tr("Sort titles")}</span>
                    <select
                      value={sort}
                      onChange={(event) =>
                        remember("exordium.gridSort", event.currentTarget.value as GridSort, setSort)}
                    >
                      <option value="library">{tr("Library order")}</option>
                      <option value="name">{tr("Name")}</option>
                      <option value="recent">{tr("Recently played")}</option>
                      <option value="playtime">{tr("Total playtime")}</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
        {!collectionsPage && (
          <button
            type="button"
            className="ghost compact grid-import-button"
            aria-label={tr("Import…")}
            data-tooltip={tr("Import…")}
            onClick={onImport}
          >
            <PlusIcon />
            {tr("Import…")}
          </button>
        )}
        <div className="grow" />
        {collectionsPage && (
          <button type="button" className="ghost compact" onClick={onNewCollection}>
            {tr("New collection…")}
          </button>
        )}
      </div>
      {collectionMenu && (
        <PopupMenu x={collectionMenu.x} y={collectionMenu.y} onClose={() => setCollectionMenu(null)}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const collection = collectionMenu.collection;
              setCollectionMenu(null);
              onRenameCollection(collection);
            }}
          >
            {tr("Rename…")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const collection = collectionMenu.collection;
              setCollectionMenu(null);
              onDeleteCollection(collection);
            }}
          >
            {tr("Delete collection")}
          </button>
        </PopupMenu>
      )}
      {before}
      {incoming.length > 0 && (
        <section className="shelf">
          <h2 className="eyebrow">{tr("IN PROGRESS ({count})", { count: incoming.length })}</h2>
          <div className="capsules">
            {incoming.map((item) => (
              <ImportCapsule
                key={item.key}
                item={item}
                onOpen={() => onOpenImport(item.key)}
                onCancel={() => onCancelImport(item)}
              />
            ))}
          </div>
        </section>
      )}
      {total === 0 && incoming.length === 0 && (
        <p className="muted">
          {collectionsPage
            ? tr("No titles in a collection yet. Right-click a title and choose Add to.")
            : tr("Nothing matches these filters.")}
        </p>
      )}
      {visibleShelves.filter((shelf) => collectionsPage || shelf.titles.length > 0).map((shelf) => (
        <section key={shelf.id} className="shelf">
          <div className="shelf-title-row">
            <h2 className="eyebrow">
              <button
                type="button"
                className="shelf-head"
                aria-expanded={!folded.has(shelf.id)}
                onClick={() =>
                  toggleShelf(shelf.id)}
              >
                <span className={folded.has(shelf.id) ? "chevron" : "chevron open"} aria-hidden="true">›</span>
                {shelf.label} <span className="muted">({shelf.titles.length})</span>
              </button>
            </h2>
            {collectionsPage && shelf.collection && (
              <button
                type="button"
                className="shelf-menu-button"
                aria-label={tr("Edit {name}", { name: shelf.collection.name })}
                data-tooltip={tr("Edit collection")}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setCollectionMenu({
                    x: rect.right,
                    y: rect.bottom + 4,
                    collection: shelf.collection!,
                  });
                }}
              >
                <span aria-hidden="true">•••</span>
              </button>
            )}
          </div>
          <div className="capsules" hidden={folded.has(shelf.id)}>
            {shelf.titles.length === 0 && (
              <p className="muted small collection-empty">
                {tr("No titles in this collection. Right-click a title and choose Add to.")}
              </p>
            )}
            {sortedTitles(shelf.titles).map((t) => {
              const live = running.has(t.key);
              const errors = t.problems.some((p) =>
                p.level === "error"
              );
              return (
                <div
                  key={t.key}
                  className={live ? "capsule live" : "capsule"}
                  role="button"
                  tabIndex={0}
                  onPointerEnter={(event) => showPreview(t, event.currentTarget)}
                  onPointerLeave={hidePreview}
                  onFocus={(event) => showPreview(t, event.currentTarget)}
                  onBlur={hidePreview}
                  onClick={() => {
                    hidePreview();
                    onOpen(t.key);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(t.key);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onMenu(event.clientX, event.clientY, t, shelf.collection ?? null);
                  }}
                >
                  <div className="capsule-art">
                    {t.art.portrait
                      ? <img src={artUrl(root, t.key, "portrait", art)} alt="" loading="lazy" />
                      : (
                        <div className={`capsule-fallback ${t.kind}`}>
                          {t.art.banner && (
                            <img
                              className="capsule-backdrop"
                              src={artUrl(root, t.key, "banner", art)}
                              alt=""
                              loading="lazy"
                            />
                          )}
                          <TitleIcon t={t} root={root} art={art} size={Math.round(portraitSize * 0.38)} />
                          <span>{t.title}</span>
                        </div>
                      )}
                    {favorites.has(t.key) && (
                      <span
                        className="capsule-badge favorite"
                        aria-label={tr("Favorite")}
                        data-tooltip={tr("Favorite")}
                      >
                        <HeartIcon filled />
                      </span>
                    )}
                    {live && <span className="capsule-badge live">{tr("PLAYING")}</span>}
                    {!errors && (
                      <button
                        type="button"
                        className="capsule-play"
                        aria-label={tr("Play {title}", { title: t.title })}
                        data-tooltip={tr("Play {title}", { title: t.title })}
                        disabled={starting === t.key}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPlay(t);
                        }}
                      >
                        <PlayIcon />
                      </button>
                    )}
                  </div>
                  <div className="capsule-name">{t.title}</div>
                  {showMetadata && (
                    <div className="capsule-sub">
                      {t.kind === "core"
                        ? tr("Core · {core}", { core: t.core ?? "" })
                        : tr("Mod · {version}", { version: t.version ?? "—" })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {preview && root && (
        <CapsulePreview
          preview={preview}
          playedAt={playedAt[preview.title.key] ?? null}
          playtime={playtime[preview.title.key] ?? null}
          live={running.has(preview.title.key)}
          root={root}
          art={art}
        />
      )}
    </div>
  );
}
