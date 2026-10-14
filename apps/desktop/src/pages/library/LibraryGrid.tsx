import * as React from "react";
import type { ReactNode } from "react";
import { HeartIcon, PlayIcon, TitleIcon } from "../../components/icons.tsx";
import { artUrl } from "../../lib/art.ts";
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
    shelves: { label: string; titles: Title[] }[];
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

  return (
    <div className="library-grid" style={{ "--capsule": `${CAPSULE_SIZES[size]}px` } as React.CSSProperties}>
      <div className="grid-head">
        <h1>Library</h1>
        <div className="grow" />
        <button type="button" className="ghost compact" onClick={onImport}>
          Import…
        </button>
        <div className="segmented" role="group" aria-label="Card size">
          {(Object.keys(CAPSULE_SIZES) as CapsuleSize[]).map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={size === s}
              className={size === s ? "on" : ""}
              onClick={() => changeSize(s)}
            >
              {s[0]!.toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {before}
      {total === 0 && <p className="muted">Nothing matches these filters.</p>}
      {shelves.filter((shelf) => shelf.titles.length > 0).map((shelf) => (
        <section key={shelf.label} className="shelf">
          <h2 className="eyebrow">
            {shelf.label} <span className="muted">({shelf.titles.length})</span>
          </h2>
          <div className="capsules">
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
                      <span className="capsule-badge favorite" aria-label="Favorite">
                        <HeartIcon filled />
                      </span>
                    )}
                    {live && <span className="capsule-badge live">PLAYING</span>}
                    {!errors && (
                      <button
                        type="button"
                        className="capsule-play"
                        aria-label={`Play ${t.title}`}
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
                    {t.kind === "core" ? `Core · ${t.core ?? ""}` : `Mod · ${t.core ?? "?"}`}
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
