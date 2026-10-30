import { tr } from "../lib/i18n.ts";
import type * as React from "react";
import { WindowControls } from "./WindowChrome.tsx";

export type AppView = "library" | "browse" | "settings" | "help";

/**
 * The top bar: the wordmark, the four pages, and in the desktop window the window controls. Its empty
 * space, wordmark included, moves the window (a double click maximizes); its controls don't.
 */
export function TopBar(
  { view, libraryReady, desktop, maximized, onView, onMaximized, onToggleMaximize }: {
    view: AppView;
    /** Setup has made the library; Browse installs into it, so it waits until then. */
    libraryReady: boolean;
    desktop: boolean;
    maximized: boolean;
    onView: (view: AppView) => void;
    onMaximized: (maximized: boolean) => void;
    onToggleMaximize: () => void;
  },
) {
  const isDragSpace = (e: React.MouseEvent) =>
    desktop && e.button === 0 && !(e.target as HTMLElement).closest("button, input, form");
  const item = (target: AppView, label: string, extra: React.ButtonHTMLAttributes<HTMLButtonElement> = {}) => (
    <button
      type="button"
      className={view === target ? "topnav-item active" : "topnav-item"}
      onClick={() => onView(target)}
      {...extra}
    >
      {label}
    </button>
  );
  return (
    <header
      className="topbar"
      onMouseDown={(e) => {
        if (isDragSpace(e) && e.detail === 1) {
          void fetch("/api/window/drag", { method: "POST" })
            .then((response) => response.json())
            .then((body) => {
              if (body.ok) onMaximized(body.maximized);
            })
            .catch(() => {});
        }
      }}
      onDoubleClick={(e) => {
        if (isDragSpace(e)) onToggleMaximize();
      }}
    >
      <div className="wordmark">EXORDIUM</div>
      <nav className="topnav">
        {item("library", tr("LIBRARY"))}
        {item("browse", tr("BROWSE"), {
          disabled: !libraryReady,
          title: libraryReady ? undefined : tr("Finish setting up Exordium first"),
        })}
        {item("settings", tr("SETTINGS"))}
        {item("help", tr("HELP"))}
      </nav>
      <div className="grow" />
      {desktop && <WindowControls maximized={maximized} onToggleMaximize={onToggleMaximize} />}
    </header>
  );
}
