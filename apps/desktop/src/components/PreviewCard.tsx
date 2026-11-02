import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** The card that pops out beside a hovered title or upload: to its right, else its left, on screen. */
export function PreviewCard(
  { rect, title, media, children }: { rect: DOMRect; title: string; media?: ReactNode; children: ReactNode },
) {
  const width = Math.min(320, globalThis.innerWidth - 24);
  const right = rect.right + 14;
  const side = right + width <= globalThis.innerWidth - 12 ? "right" : "left";
  const left = side === "right" ? right : Math.max(12, rect.left - width - 14);
  const top = Math.max(12, Math.min(rect.top, globalThis.innerHeight - 361));
  return createPortal(
    <aside className="capsule-preview" data-side={side} style={{ left, top, width }} aria-hidden="true">
      <h3>{title}</h3>
      {media && <div className="capsule-preview-media">{media}</div>}
      <div className="capsule-preview-details">{children}</div>
    </aside>,
    document.body,
  );
}
