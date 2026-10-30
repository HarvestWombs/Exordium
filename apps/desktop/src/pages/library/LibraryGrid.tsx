import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import type { ReactNode } from "react";
import { HeartIcon, PlayIcon, TitleIcon } from "../../components/icons.tsx";
import { artUrl } from "../../lib/art.ts";
import { readStored, writeStored } from "../../lib/util.ts";
import type { Title } from "../../types.ts";

export const CAPSULE_SIZES = { small: 132, medium: 170, large: 220 } as const;

export type CapsuleSize = keyof typeof CAPSULE_SIZES;

export function savedCapsuleSize(): CapsuleSize {
  try {
    const saved = localStorage.getItem("exordium.gridSize");
    if (saved === "small" || saved === "medium" || saved === "large") return saved;
  } catch {
    // Storage unavailable: the default size.
  }
  return "medium";
}

/**
 * The library as Steam shows it in grid view: the whole main area, a shelf per group, a 2:3 capsule
 * per title. The portrait art when a title has one; otherwise its icon and name over its banner,
 * dimmed (a wide banner cropped to 2:3 is usually just sky). Click opens the title's page; Play is on the capsule; right-click is the title's menu.
 */
export function LibraryGrid(
  { shelves, before, onImport, root, art, running, favorites, starting, onOpen, onPlay, onMenu }: {
    /** One per sidebar section, by the section's id; a shelf folds on its own, apart from the sidebar. */
    shelves: { id: string; label: string; titles: Title[] }[];
    /** Shown above the shelves: the Latest uploads row. */
    before: ReactNode;
    onImport: () => void;
    root: string | null;
    art: number;
    running: Set<string>;
    favorites: Set<string>;
    starting: string | null;
    onOpen: (key: string) => void;
    onPlay: (t: Title) => void;
    onMenu: (x: number, y: number, t: Title) => void;
  },
) {
  const [size, setSize] = React.useState<CapsuleSize>(savedCapsuleSize);
  function changeSize(next: CapsuleSize) {
    setSize(next);
    try {
      localStorage.setItem("exordium.gridSize", next);
    } catch {
      // Not remembered; still applied.
    }
  }
  const total = shelves.reduce((n, s) => n + s.titles.length, 0);
  const [folded, setFolded] = React.useState<Set<string>>(() =>
    new Set(readStored<string[]>("exordium.homeCollapsed", []))
  );
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
    <div className="library-grid" style={{ "--capsule": `${CAPSULE_SIZES[size]}px` } as React.CSSProperties}>
      <div className="grid-head">
        <h1>{tr("Library")}</h1>
        <div className="grow" />
        <button type="button" className="ghost compact" onClick={onImport}>
          {tr("Import…")}
        </button>
        <div className="segmented" role="group" aria-label={tr("Card size")}>
          {(Object.keys(CAPSULE_SIZES) as CapsuleSize[]).map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={size === s}
              className={size === s ? "on" : ""}
              onClick={() => changeSize(s)}
            >
              {{ small: tr("Small"), medium: tr("Medium"), large: tr("Large") }[s]}
            </button>
          ))}
        </div>
      </div>
      {before}
      {total === 0 && <p className="muted">{tr("Nothing matches these filters.")}</p>}
      {shelves.filter((shelf) => shelf.titles.length > 0).map((shelf) => (
        <section key={shelf.id} className="shelf">
          <h2 className="eyebrow">
            <button
              type="button"
              className="shelf-head"
              aria-expanded={!folded.has(shelf.id)}
              onClick={() => toggleShelf(shelf.id)}
            >
              <span className={folded.has(shelf.id) ? "chevron" : "chevron open"} aria-hidden="true">›</span>
              {shelf.label} <span className="muted">({shelf.titles.length})</span>
            </button>
          </h2>
          <div className="capsules" hidden={folded.has(shelf.id)}>
            {shelf.titles.map((t) => {
              const live = running.has(t.key);
              const errors = t.problems.some((p) => p.level === "error");
              return (
                <div
                  key={t.key}
                  className={live ? "capsule live" : "capsule"}
                  role="button"
                  tabIndex={0}
                  title={t.title}
                  onClick={() => onOpen(t.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(t.key);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onMenu(event.clientX, event.clientY, t);
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
                          <TitleIcon t={t} root={root} art={art} size={Math.round(CAPSULE_SIZES[size] * 0.38)} />
                          <span>{t.title}</span>
                        </div>
                      )}
                    {favorites.has(t.key) && (
                      <span className="capsule-badge favorite" aria-label={tr("Favorite")}>
                        <HeartIcon filled />
                      </span>
                    )}
                    {live && <span className="capsule-badge live">{tr("PLAYING")}</span>}
                    {!errors && (
                      <button
                        type="button"
                        className="capsule-play"
                        aria-label={tr("Play {title}", { title: t.title })}
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
                  <div className="capsule-sub">
                    {t.kind === "core"
                      ? tr("Core · {core}", { core: t.core ?? "" })
                      : tr("Mod · {core}", { core: t.core ?? "?" })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
