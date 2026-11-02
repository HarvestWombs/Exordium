import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { CloseIcon } from "../../components/icons.tsx";
import type { ConfirmRequest, DialogPage, Title } from "../../types.ts";
import { AboutPage } from "./AboutPage.tsx";
import { ArtPage } from "./ArtPage.tsx";
import { FilesPage } from "./FilesPage.tsx";
import { LaunchPage } from "./LaunchPage.tsx";
import { RealmPage } from "./RealmPage.tsx";
import { UpdatesPage } from "./UpdatesPage.tsx";
import { useManifest } from "./useManifest.ts";

export function Properties(
  { t, root, page, art, blocked, onPage, onConfirm, onClose, onArtChanged }: {
    t: Title;
    root: string;
    page: DialogPage;
    art: number;
    blocked: boolean;
    onPage: (page: DialogPage) => void;
    onConfirm: (request: ConfirmRequest) => void;
    onClose: () => void;
    onArtChanged: () => Promise<void>;
  },
) {
  const editor = useManifest(t, root, onArtChanged);
  // The pages that edit exordium.mod.json wait for it; one that cannot be read says why.
  const manifestPage = (page: React.ReactNode) =>
    editor.manifest ? page : <p className="muted pad">{editor.problem ?? tr("Reading exordium.mod.json…")}</p>;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !blocked && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [blocked, onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={tr("{title} properties", { title: t.title })}>
        <div className="dialog-head">
          <h1>{t.title}</h1>
          <span className="muted">{tr("Properties")}</span>
          <div className="grow" />
          <button
            type="button"
            className="square"
            aria-label={tr("Close")}
            data-tooltip={tr("Close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="dialog-body">
          <nav className="dialog-nav">
            <button type="button" className={page === "about" ? "on" : ""} onClick={() => onPage("about")}>
              {tr("About")}
            </button>
            <button type="button" className={page === "launch" ? "on" : ""} onClick={() => onPage("launch")}>
              {tr("Launch")}
            </button>
            <button type="button" className={page === "realm" ? "on" : ""} onClick={() => onPage("realm")}>
              {tr("Realm")}
            </button>
            <button type="button" className={page === "updates" ? "on" : ""} onClick={() => onPage("updates")}>
              {tr("Updates")}
            </button>
            <button type="button" className={page === "files" ? "on" : ""} onClick={() => onPage("files")}>
              {tr("Installed Files")}
            </button>
            <button type="button" className={page === "art" ? "on" : ""} onClick={() => onPage("art")}>
              {tr("Art")}
            </button>
          </nav>
          <div className="dialog-page">
            {page === "launch" && manifestPage(<LaunchPage t={t} editor={editor} />)}
            {page === "realm" && manifestPage(<RealmPage editor={editor} />)}
            {page === "about" && manifestPage(<AboutPage t={t} editor={editor} />)}
            {page === "updates" &&
              manifestPage(<UpdatesPage t={t} root={root} editor={editor} onChanged={onArtChanged} />)}
            {page === "files" && <FilesPage t={t} root={root} onConfirm={onConfirm} />}
            {page === "art" &&
              manifestPage(<ArtPage t={t} root={root} art={art} editor={editor} onChanged={onArtChanged} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
