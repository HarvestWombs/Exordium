import { tr } from "../lib/i18n.ts";
import * as React from "react";
import type { ReactNode } from "react";
import type { Collection, Title, TitleAction } from "../types.ts";

/**
 * A menu at the pointer, kept on screen, closed by a click outside, Escape, blur or resize. The
 * title menu and a collection's header menu both use it.
 */
export function PopupMenu(
  { x, y, onClose, children, menuRef }: {
    x: number;
    y: number;
    onClose: () => void;
    children: ReactNode;
    menuRef?: React.RefObject<HTMLDivElement | null>;
  },
) {
  const own = React.useRef<HTMLDivElement>(null);
  const ref = menuRef ?? own;
  const [place, setPlace] = React.useState({ left: x, top: y });
  React.useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({
      left: Math.max(8, Math.min(x, globalThis.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, globalThis.innerHeight - box.height - 8)),
    });
  }, [x, y, ref]);
  React.useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "mousedown" && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    globalThis.addEventListener("mousedown", close);
    globalThis.addEventListener("keydown", close);
    globalThis.addEventListener("blur", close);
    globalThis.addEventListener("resize", close);
    return () => {
      globalThis.removeEventListener("mousedown", close);
      globalThis.removeEventListener("keydown", close);
      globalThis.removeEventListener("blur", close);
      globalThis.removeEventListener("resize", close);
    };
  }, [onClose, ref]);
  return (
    <div ref={ref} className="menu" role="menu" style={place} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}

/** The mod list's right-click menu, at the pointer; Add to and Manage open submenus on hover. */
export function TitleMenu(
  { x, y, t, favorite, hidden, packaged, collections, from, onAction, onCollection, onNewCollection, onClose }: {
    x: number;
    y: number;
    t: Title;
    favorite: boolean;
    hidden: boolean;
    packaged: boolean;
    collections: Collection[];
    /** The collection whose row was right-clicked: offered as Remove from. */
    from: Collection | null;
    onAction: (action: TitleAction) => void;
    onCollection: (id: string, on: boolean) => void;
    onNewCollection: () => void;
    onClose: () => void;
  },
) {
  // A submenu opens beside its row; near the bottom (or right) of the window it would run off-screen,
  // so once it shows it is measured and shifted up (or flipped left) to fit.
  const [subStyles, setSubStyles] = React.useState<Record<string, React.CSSProperties>>({});
  function placeSubmenu(name: string, holder: HTMLElement) {
    setSubStyles((current) => ({ ...current, [name]: {} }));
    requestAnimationFrame(() => {
      const element = holder.querySelector<HTMLElement>(":scope > .submenu");
      if (!element) return;
      // Measured shown, whether or not :hover has applied yet.
      const display = element.style.display;
      element.style.display = "flex";
      const sub = element.getBoundingClientRect();
      element.style.display = display;
      if (sub.height === 0) return;
      const next: React.CSSProperties = {};
      const overflowBottom = sub.bottom - (globalThis.innerHeight - 8);
      if (overflowBottom > 0) next.top = `${-6 - Math.min(overflowBottom, sub.top - 8)}px`;
      if (sub.right > globalThis.innerWidth - 8) {
        next.left = "auto";
        next.right = "calc(100% + 2px)";
      }
      setSubStyles((current) => ({ ...current, [name]: next }));
    });
  }
  const item = (action: TitleAction, label: string, disabled = false, title?: string) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      data-tooltip={title}
      onClick={() => onAction(action)}
    >
      {label}
    </button>
  );
  const submenu = (name: string, label: string, children: ReactNode) => (
    <div
      className="menu-sub"
      onMouseEnter={(event) => placeSubmenu(name, event.currentTarget)}
      onFocus={(event) => placeSubmenu(name, event.currentTarget)}
    >
      <button type="button" role="menuitem" aria-haspopup="menu">
        {label} <span className="menu-arrow">›</span>
      </button>
      <div className="menu submenu" role="menu" style={subStyles[name]}>
        {children}
      </div>
    </div>
  );
  const errors = t.problems.some((p) => p.level === "error");
  return (
    <PopupMenu x={x} y={y} onClose={onClose}>
      {item("play", tr("Play"), errors, errors ? tr("Its problems have to be fixed first") : undefined)}
      <hr />
      {item("favorite", favorite ? tr("Remove from favorites") : tr("Add to favorites"))}
      {submenu(
        "add",
        tr("Add to"),
        <>
          {collections.map((c) => {
            const on = c.keys.includes(t.key);
            return (
              <button
                type="button"
                key={c.id}
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onCollection(c.id, !on)}
              >
                {c.name}
                {on && <span className="menu-check">✓</span>}
              </button>
            );
          })}
          {collections.length > 0 && <hr />}
          <button type="button" role="menuitem" onClick={onNewCollection}>{tr("New collection…")}</button>
        </>,
      )}
      {from && (
        <button type="button" role="menuitem" onClick={() => onCollection(from.id, false)}>
          {tr("Remove from {name}", { name: from.name })}
        </button>
      )}
      {submenu(
        "manage",
        tr("Manage"),
        <>
          {item(
            "shortcut",
            tr("Add desktop shortcut"),
            !packaged,
            packaged ? undefined : tr("Shortcuts start the packaged Exordium.exe"),
          )}
          {item("files", tr("Browse local files"))}
          {hidden ? item("unhide", tr("Show in the list again")) : item("hide", tr("Hide from the list"))}
          {item(
            "uninstall",
            tr("Uninstall"),
            t.kind === "core",
            t.kind === "core" ? tr("A core is shared by the mods built on it") : undefined,
          )}
        </>,
      )}
      <hr />
      {item("properties", tr("Properties"))}
    </PopupMenu>
  );
}
