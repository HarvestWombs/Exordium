import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { CloseIcon } from "../../components/icons.tsx";
import type { DialogPage, Title } from "../../types.ts";
import { AboutPage } from "./AboutPage.tsx";
import { ArtworkPage } from "./ArtworkPage.tsx";
import { FilesPage } from "./FilesPage.tsx";
import { GeneralPage } from "./GeneralPage.tsx";
import { UpdatesPage } from "./UpdatesPage.tsx";

export function Properties(
  { t, root, page, art, onPage, onClose, onArtChanged }: {
    t: Title;
    root: string;
    page: DialogPage;
    art: number;
    onPage: (page: DialogPage) => void;
    onClose: () => void;
    onArtChanged: () => Promise<void>;
  },
) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={tr("{title} properties", { title: t.title })}>
        <div className="dialog-head">
          <h1>{t.title}</h1>
          <span className="muted">{tr("Properties")}</span>
          <div className="grow" />
          <button type="button" className="square" aria-label={tr("Close")} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="dialog-body">
          <nav className="dialog-nav">
            <button type="button" className={page === "about" ? "on" : ""} onClick={() => onPage("about")}>
              {tr("About")}
            </button>
            <button type="button" className={page === "general" ? "on" : ""} onClick={() => onPage("general")}>
              {tr("General")}
            </button>
            <button type="button" className={page === "updates" ? "on" : ""} onClick={() => onPage("updates")}>
              {tr("Updates")}
            </button>
            <button type="button" className={page === "files" ? "on" : ""} onClick={() => onPage("files")}>
              {tr("Installed Files")}
            </button>
            <button type="button" className={page === "artwork" ? "on" : ""} onClick={() => onPage("artwork")}>
              {tr("Customization")}
            </button>
          </nav>
          <div className="dialog-page">
            {page === "general" && <GeneralPage t={t} root={root} onChanged={onArtChanged} />}
            {page === "about" && <AboutPage t={t} root={root} onChanged={onArtChanged} />}
            {page === "updates" && <UpdatesPage t={t} root={root} onChanged={onArtChanged} />}
            {page === "files" && <FilesPage t={t} root={root} />}
            {page === "artwork" && <ArtworkPage t={t} root={root} art={art} onChanged={onArtChanged} />}
          </div>
        </div>
      </div>
    </div>
  );
}
