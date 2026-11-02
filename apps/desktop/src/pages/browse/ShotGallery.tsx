import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { Lightbox } from "../../components/Lightbox.tsx";
import { smallerModDbImage } from "./browse-util.ts";
import type { Shot } from "./types.ts";

function ShotImage({ src, className, lazy = false }: { src: string; className: string; lazy?: boolean }) {
  const [loadedSource, setLoadedSource] = React.useState<string | null>(null);
  const [failedSource, setFailedSource] = React.useState<string | null>(null);
  const ready = loadedSource === src || failedSource === src;

  return (
    <span className="shot-image-frame">
      {!ready && <span className="skeleton" aria-hidden="true" />}
      <img
        className={`${className}${loadedSource === src ? " loaded" : ""}`}
        src={src}
        alt=""
        loading={lazy ? "lazy" : "eager"}
        onLoad={() => setLoadedSource(src)}
        onError={(event) => {
          const before = event.currentTarget.src;
          smallerModDbImage(event);
          if (event.currentTarget.src === before) setFailedSource(src);
        }}
      />
    </span>
  );
}

/** A card's screenshots: the one shown large, a strip of four, and the full gallery on click. */
export function ShotGallery(
  { shots, empty, loading = false }: { shots: Shot[]; empty: string; loading?: boolean },
) {
  const [shot, setShot] = React.useState(0);
  const [gallery, setGallery] = React.useState(false);
  return (
    <div className="mod-shots">
      {loading
        ? (
          <div className="shot-skeleton" aria-hidden="true">
            <span className="skeleton shot-skeleton-main" />
            <div className="shot-strip">
              {Array.from({ length: 4 }, (_, index) => <span key={index} className="skeleton shot-skeleton-thumb" />)}
            </div>
          </div>
        )
        : shots.length > 0
        ? (
          <>
            <button
              type="button"
              className="shot-main-button"
              data-tooltip={tr("Open the gallery")}
              onClick={() => setGallery(true)}
            >
              <ShotImage className="shot-main" src={shots[shot]?.full ?? shots[0]?.full ?? ""} />
            </button>
            <div className="shot-strip">
              {shots.slice(0, 4).map((s, i) => (
                <button
                  type="button"
                  key={s.thumb}
                  className={i === shot ? "shot on" : "shot"}
                  onClick={() => setShot(i)}
                >
                  <ShotImage className="shot-thumb" src={s.thumb} lazy />
                </button>
              ))}
            </div>
          </>
        )
        : <div className="shot-empty muted small">{empty}</div>}
      {gallery && (
        <Lightbox
          images={shots.map((s) => ({ src: s.full, thumb: s.thumb }))}
          start={shot}
          onClose={() => setGallery(false)}
        />
      )}
    </div>
  );
}
