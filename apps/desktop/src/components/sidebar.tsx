import { plural, tr } from "../lib/i18n.ts";
import type * as React from "react";
import type { ReactNode } from "react";
import type { Title } from "../types.ts";
import { TitleIcon } from "./icons.tsx";

/** A sidebar group: its header folds it shut (remembered), and can carry drag and menu handlers. */
export function ListSection(
  { label, collapsed, onToggle, head, children }: {
    label: string;
    collapsed: boolean;
    onToggle: () => void;
    head?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    children: ReactNode;
  },
) {
  const { className, ...rest } = head ?? {};
  return (
    <section className="list-section">
      <button
        type="button"
        {...rest}
        className={className ? `list-label ${className}` : "list-label"}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <span className={collapsed ? "chevron" : "chevron open"} aria-hidden="true">›</span>
        {label}
      </button>
      {!collapsed && <div className="list-items">{children}</div>}
    </section>
  );
}

export function TitleRow(
  { t, root, art, selected, running, favorite, onSelect, onMenu, dnd }: {
    t: Title;
    root: string | null;
    art: number;
    selected: boolean;
    running: boolean;
    favorite: boolean;
    onSelect: (key: string) => void;
    onMenu: (x: number, y: number) => void;
    /** Drag handlers: every row drags onto a collection, and rows in one reorder it. */
    dnd?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  },
) {
  const health = t.problems.some((p) => p.level === "error") ? "bad" : t.problems.length ? "warn" : "good";
  return (
    <button
      type="button"
      {...dnd}
      title={t.title}
      className={[selected ? "row on" : "row", running ? "live" : ""].filter(Boolean).join(" ")}
      onClick={() => onSelect(t.key)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <TitleIcon t={t} root={root} art={art} size={24} />
      <span className="row-title">{t.title}</span>
      {favorite && <span className="row-star" title={tr("Favorite")}>★</span>}
      {running ? <span className="row-live">{tr("RUNNING")}</span> : (
        <span
          className={`dot ${health}`}
          title={health === "good" ? tr("Ready") : plural(t.problems.length, "{count} problem", "{count} problems")}
        />
      )}
    </button>
  );
}
