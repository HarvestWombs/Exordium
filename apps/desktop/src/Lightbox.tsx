import * as React from "react";

export interface LightboxImage {
  src: string;
  thumb?: string;
  caption?: string;
}

/**
 * Screenshots full size, one at a time: arrows or the thumbnail strip to move, Escape or a click
 * anywhere but the picture and the controls to close. Used by the mod browser's cards and the library's Screenshots tab.
 */
export function Lightbox(
  { images, start, onClose }: { images: LightboxImage[]; start: number; onClose: () => void },
) {
  const [index, setIndex] = React.useState(start);
  const count = images.length;
  const move = React.useCallback((step: number) => setIndex((i) => (i + step + count) % count), [count]);
  const strip = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
      else return;
      event.preventDefault();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [move, onClose]);

  React.useEffect(() => {
    strip.current?.querySelector(".lightbox-thumb.on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  const image = images[index];
  if (!image) return null;
  // The stage, bar and strip span the window, so only the picture and the buttons keep a click.
  const keep = (event: React.MouseEvent) => event.stopPropagation();
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Screenshots" onClick={onClose}>
      <div className="lightbox-stage">
        <img className="lightbox-image" src={image.src} alt={image.caption ?? ""} onClick={keep} />
        {count > 1 && (
          <>
            <button
              type="button"
              className="lightbox-nav prev"
              aria-label="Previous"
              onClick={(event) => {
                keep(event);
                move(-1);
              }}
            >
              ‹
            </button>
            <button
              type="button"
              className="lightbox-nav next"
              aria-label="Next"
              onClick={(event) => {
                keep(event);
                move(1);
              }}
            >
              ›
            </button>
          </>
        )}
      </div>
      <div className="lightbox-bar">
        <span className="muted small">
          {index + 1} / {count}
          {image.caption ? ` · ${image.caption}` : ""}
        </span>
        <button type="button" className="lightbox-close" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      {count > 1 && (
        <div className="lightbox-strip" ref={strip}>
          {images.map((img, i) => (
            <button
              type="button"
              key={img.src}
              className={i === index ? "lightbox-thumb on" : "lightbox-thumb"}
              onClick={(event) => {
                keep(event);
                setIndex(i);
              }}
            >
              <img src={img.thumb ?? img.src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
