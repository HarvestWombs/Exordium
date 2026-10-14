import * as React from "react";
import { Lightbox } from "../../components/Lightbox.tsx";
import { smallerModDbImage } from "./browse-util.ts";
import type { Shot } from "./types.ts";

/** A card's screenshots: the one shown large, a strip of four, and the full gallery on click. */
export function ShotGallery({ shots, empty }: { shots: Shot[]; empty: string }) {
  const [shot, setShot] = React.useState(0);
  const [gallery, setGallery] = React.useState(false);
  return (
    <div className="mod-shots">
      {shots.length > 0
        ? (
          <>
            <button
              type="button"
              className="shot-main-button"
              title="Open the gallery"
              onClick={() => setGallery(true)}
            >
              <img className="shot-main" src={shots[shot]?.full} alt="" onError={smallerModDbImage} />
            </button>
            <div className="shot-strip">
              {shots.slice(0, 4).map((s, i) => (
                <button
                  type="button"
                  key={s.thumb}
                  className={i === shot ? "shot on" : "shot"}
                  onClick={() => setShot(i)}
                >
                  <img src={s.thumb} alt="" loading="lazy" />
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
