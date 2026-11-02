import * as React from "react";

/**
 * More grows a card, not its picture. The cover fills its row, so an open card holds it at the height
 * it has with the description shut, measured by shutting it for a moment before anything is painted.
 * `text` is what the card shows, since a translation can change that height.
 */
export function useCoverHeight(expanded: boolean, text: string) {
  const cover = React.useRef<HTMLButtonElement>(null);
  const description = React.useRef<HTMLParagraphElement>(null);

  React.useLayoutEffect(() => {
    const button = cover.current;
    const paragraph = description.current;
    if (!button || !paragraph) return;
    button.style.height = "";
    if (!expanded) return;
    paragraph.classList.remove("open");
    const height = button.offsetHeight;
    paragraph.classList.add("open");
    button.style.height = `${height}px`;
  }, [expanded, text]);

  return { cover, description };
}
