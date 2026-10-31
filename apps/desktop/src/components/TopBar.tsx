import { tr } from "../lib/i18n.ts";
import * as React from "react";
import type { HelpPageId } from "../pages/help/Help.tsx";
import { SETTINGS_SECTIONS } from "../pages/settings/Settings.tsx";
import type { BrowseView } from "../pages/browse/types.ts";
import type { SettingsSection } from "../types.ts";
import { WindowControls } from "./WindowChrome.tsx";

export type AppView = "library" | "browse" | "settings" | "help";
export type LibraryPage = "home" | "collections";

/**
 * The top bar: the wordmark, the four pages, and in the desktop window the window controls. Library and
 * Browse open a menu of their pages on hover, as Steam's do. Its empty space, wordmark included, moves
 * the window (a double click maximizes); its controls don't.
 */
export function TopBar(
  {
    view,
    libraryPage,
    browsePage,
    settingsSection,
    helpPage,
    libraryReady,
    desktop,
    maximized,
    onLibrary,
    onBrowse,
    onSettings,
    onHelp,
    onMaximized,
    onToggleMaximize,
  }: {
    view: AppView;
    libraryPage: LibraryPage;
    browsePage: BrowseView;
    settingsSection: SettingsSection;
    helpPage: HelpPageId;
    /** Setup has made the library; Browse installs into it, so it waits until then. */
    libraryReady: boolean;
    desktop: boolean;
    maximized: boolean;
    onLibrary: (page: LibraryPage) => void;
    /** Downloads is listed under Library, as Steam's is, and is a page of Browse. */
    onBrowse: (page: BrowseView) => void;
    onSettings: (section: SettingsSection) => void;
    onHelp: (page: HelpPageId) => void;
    onMaximized: (maximized: boolean) => void;
    onToggleMaximize: () => void;
  },
) {
  const [open, setOpen] = React.useState<AppView | null>(null);
  const isDragSpace = (e: React.MouseEvent) =>
    desktop && e.button === 0 && !(e.target as HTMLElement).closest("button, input, form, .topnav-menu");
  const section = view === "browse" && browsePage === "downloads" ? "library" : view;
  const item = (
    target: AppView,
    label: string,
    onClick: () => void,
    extra: React.ButtonHTMLAttributes<HTMLButtonElement> = {},
  ) => (
    <button
      type="button"
      className={section === target ? "topnav-item active" : "topnav-item"}
      onClick={() => {
        setOpen(null);
        onClick();
      }}
      {...extra}
    >
      {label}
    </button>
  );
  const menu = (target: AppView, top: React.ReactNode, pages: [string, boolean, () => void][]) => (
    <div
      className={open === target ? "topnav-group open" : "topnav-group"}
      onMouseEnter={() => setOpen(target)}
      onMouseLeave={() => setOpen(null)}
    >
      {top}
      <div className="topnav-menu" role="menu">
        {pages.map(([label, on, onClick]) => (
          <button
            type="button"
            role="menuitem"
            key={label}
            className={on ? "on" : ""}
            onClick={() => {
              setOpen(null);
              onClick();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
  const libraryTop = item("library", tr("LIBRARY"), () => onLibrary("home"));
  const browseTop = item("browse", tr("BROWSE"), () => onBrowse("archive"), {
    disabled: !libraryReady,
    title: libraryReady ? undefined : tr("Finish setting up Exordium first"),
  });
  const settingsTop = item("settings", tr("SETTINGS"), () => onSettings("library"));
  const helpTop = item("help", tr("HELP"), () => onHelp("start"));
  const helpSection = helpPage === "faq" || helpPage === "about"
    ? helpPage
    : helpPage.startsWith("authors")
    ? "authors"
    : "general";
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
        {libraryReady
          ? menu("library", libraryTop, [
            [tr("Home"), view === "library" && libraryPage === "home", () => onLibrary("home")],
            [tr("Collections"), view === "library" && libraryPage === "collections", () => onLibrary("collections")],
            [tr("Downloads"), view === "browse" && browsePage === "downloads", () => onBrowse("downloads")],
          ])
          : libraryTop}
        {libraryReady
          ? menu("browse", browseTop, [
            [tr("Archive"), view === "browse" && browsePage === "archive", () => onBrowse("archive")],
            ["ModDB", view === "browse" && browsePage === "moddb", () => onBrowse("moddb")],
            [tr("Cores"), view === "browse" && browsePage === "cores", () => onBrowse("cores")],
          ])
          : browseTop}
        {menu(
          "settings",
          settingsTop,
          SETTINGS_SECTIONS.map((entry) => [
            entry.label,
            view === "settings" && settingsSection === entry.id,
            () => onSettings(entry.id),
          ]),
        )}
        {menu("help", helpTop, [
          [tr("General"), view === "help" && helpSection === "general", () => onHelp("start")],
          [tr("For Authors"), view === "help" && helpSection === "authors", () => onHelp("authors")],
          ["FAQ", view === "help" && helpSection === "faq", () => onHelp("faq")],
          [tr("About"), view === "help" && helpSection === "about", () => onHelp("about")],
        ])}
      </nav>
      <div className="grow" />
      {desktop && <WindowControls maximized={maximized} onToggleMaximize={onToggleMaximize} />}
    </header>
  );
}
