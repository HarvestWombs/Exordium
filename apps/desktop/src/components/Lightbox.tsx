import { tr } from "../lib/i18n.ts";
import * as React from "react";
import { createPortal } from "react-dom";

export interface LightboxImage {
  src: string;
  thumb?: string;
  caption?: string;
  /** Plays in place of the picture: YouTube's privacy-enhanced player, or a video file. */
  video?: { kind: "youtube"; id: string } | { kind: "file"; url: string };
}

/**
 * A video, playing as soon as it is shown; leaving it (another entry, or closing) unmounts it, which
 * stops it. YouTube plays from youtube-nocookie.com, which sets no cookies until the video plays.
 */
export function VideoPlayer(
  { video, onClick, className = "lightbox-video" }: {
    video: NonNullable<LightboxImage["video"]>;
    onClick?: (event: React.MouseEvent) => void;
    className?: string;
  },
) {
  if (video.kind === "youtube") {
    return (
      <iframe
        key={video.id}
        className={className}
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?autoplay=1&rel=0`}
        title={tr("Video")}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onClick={onClick}
      />
    );
  }
  return <video key={video.url} className={className} src={video.url} controls autoPlay onClick={onClick} />;
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
      // A playing video keeps its own arrow keys (seeking); Escape still closes.
      if (event.key !== "Escape" && event.target instanceof HTMLVideoElement) return;
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
  // On the page itself, not inside whatever opened it: a card's gallery covers the whole window,
  // the Browse filters beside the catalog included.
  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={images.some((i) => i.video) ? tr("Screenshots and videos") : tr("Screenshots")}
      onClick={onClose}
    >
      <div className="lightbox-stage">
        {image.video
          ? <VideoPlayer video={image.video} onClick={keep} />
          : <img className="lightbox-image" src={image.src} alt={image.caption ?? ""} onClick={keep} />}
        {count > 1 && (
          <>
            <button
              type="button"
              className="lightbox-nav prev"
              aria-label={tr("Previous")}
              data-tooltip={tr("Previous")}
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
              aria-label={tr("Next")}
              data-tooltip={tr("Next")}
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
        <button
          type="button"
          className="lightbox-close"
          aria-label={tr("Close")}
          data-tooltip={tr("Close")}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {count > 1 && (
        <div className="lightbox-strip" ref={strip}>
          {images.map((img, i) => (
            <button
              type="button"
              key={img.src}
              className={i === index ? "lightbox-thumb on" : "lightbox-thumb"}
              aria-label={img.caption}
              data-tooltip={img.caption}
              onClick={(event) => {
                keep(event);
                setIndex(i);
              }}
            >
              <img src={img.thumb ?? img.src} alt="" loading="lazy" />
              {img.video && (
                <span className="shot-play small" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5.5v13l11-6.5z" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
