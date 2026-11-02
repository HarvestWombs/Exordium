import * as React from "react";

type Placement = "top" | "bottom" | "left" | "right";

interface Tip {
  target: HTMLElement;
  text: string;
  placement: Placement;
  rect: DOMRect;
}

function tooltipTarget(value: EventTarget | null): HTMLElement | null {
  return value instanceof Element ? value.closest<HTMLElement>("[data-tooltip]") : null;
}

function contains(target: HTMLElement, value: EventTarget | null): boolean {
  return value instanceof Node && target.contains(value);
}

function readTip(target: HTMLElement): Tip | null {
  const text = target.dataset.tooltip?.trim();
  if (!text) return null;
  const requested = target.dataset.tooltipPlacement;
  const placement: Placement = requested === "top" || requested === "left" || requested === "right"
    ? requested
    : "bottom";
  return { target, text, placement, rect: target.getBoundingClientRect() };
}

/** One themed tooltip surface for every page. Callers only provide data-tooltip on an element. */
export function TooltipLayer() {
  const [tip, setTip] = React.useState<Tip | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(() => {
    const cancel = () => {
      if (timer.current !== null) globalThis.clearTimeout(timer.current);
      timer.current = null;
      setTip(null);
    };
    const schedule = (target: HTMLElement, immediate = false) => {
      if (target.getAttribute("aria-expanded") === "true") return;
      const next = readTip(target);
      if (!next) return;
      if (timer.current !== null) globalThis.clearTimeout(timer.current);
      timer.current = globalThis.setTimeout(() => {
        timer.current = null;
        if (!target.isConnected || target.getAttribute("aria-expanded") === "true") return;
        setTip(next);
      }, immediate ? 100 : 450);
    };
    const over = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      if (!target || contains(target, event.relatedTarget)) return;
      schedule(target);
    };
    const out = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      if (target && contains(target, event.relatedTarget)) return;
      cancel();
    };
    const focus = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      // Keyboard focus only: a click focuses too, and would raise the tip of what was just pressed.
      if (target && (event.target as Element).matches(":focus-visible")) schedule(target, true);
    };
    const blur = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      if (target && contains(target, event.relatedTarget)) return;
      cancel();
    };
    const refresh = () => {
      setTip((current) => {
        if (!current || !current.target.isConnected) return null;
        return { ...current, rect: current.target.getBoundingClientRect() };
      });
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", cancel);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    globalThis.addEventListener("resize", refresh);
    document.addEventListener("scroll", refresh, true);
    return () => {
      cancel();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", cancel);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      globalThis.removeEventListener("resize", refresh);
      document.removeEventListener("scroll", refresh, true);
    };
  }, []);

  if (!tip) return null;
  const spaceRight = globalThis.innerWidth - tip.rect.right;
  const spaceLeft = tip.rect.left;
  const placement = tip.placement === "right" && spaceRight < 250 && spaceLeft > spaceRight
    ? "left"
    : tip.placement === "left" && spaceLeft < 250 && spaceRight > spaceLeft
    ? "right"
    : tip.placement;
  const horizontal = placement === "left" || placement === "right";
  const horizontalSpace = placement === "right" ? spaceRight : placement === "left" ? spaceLeft : 240;
  const left = placement === "right"
    ? tip.rect.right + 8
    : placement === "left"
    ? tip.rect.left - 8
    : Math.min(globalThis.innerWidth - 132, Math.max(132, tip.rect.left + tip.rect.width / 2));
  const top = placement === "bottom"
    ? tip.rect.bottom + 8
    : placement === "top"
    ? tip.rect.top - 8
    : Math.min(globalThis.innerHeight - 24, Math.max(24, tip.rect.top + tip.rect.height / 2));

  return (
    <div
      className="app-tooltip"
      data-placement={placement}
      role="tooltip"
      style={{
        left,
        top,
        maxWidth: horizontal ? Math.max(120, Math.min(240, horizontalSpace - 20)) : 240,
      }}
    >
      {tip.text}
    </div>
  );
}
