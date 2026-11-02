import type * as React from "react";

/** How far a press travels before it is a drag, so a plain click stays a click. */
const DRAG_DISTANCE = 5;

function swallowClick(event: MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

/**
 * A drag the page runs itself. HTML drag and drop hands the pointer to the operating system, which
 * draws its own no-entry cursor and "Move" label over the window, and a page can turn neither off.
 * Call from onPointerDown; `onEnd` always runs once a drag began, after `onDrop` when it landed.
 * Escape cancels.
 */
export function startPointerDrag(
  event: React.PointerEvent<HTMLElement>,
  { label, onStart, onMove, onDrop, onEnd }: {
    /** Shown beside the pointer. */
    label: string;
    onStart?: () => void;
    onMove: (x: number, y: number) => void;
    onDrop: () => void;
    onEnd?: () => void;
  },
) {
  if (event.button !== 0) return;
  const element = event.currentTarget;
  const { pointerId, clientX: startX, clientY: startY } = event;
  let ghost: HTMLElement | null = null;

  function begin() {
    ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = label;
    document.body.append(ghost);
    document.body.classList.add("pointer-dragging");
    // Keeps the drag when the pointer leaves the window, and keeps other elements' hover quiet.
    element.setPointerCapture(pointerId);
    onStart?.();
  }

  function finish(dropped: boolean) {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
    document.removeEventListener("lostpointercapture", cancel);
    document.removeEventListener("keydown", key, true);
    if (!ghost) return;
    ghost.remove();
    document.body.classList.remove("pointer-dragging");
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    // The release clicks what the drag began on: a row would open, a header would fold.
    globalThis.addEventListener("click", swallowClick, true);
    globalThis.setTimeout(() => globalThis.removeEventListener("click", swallowClick, true));
    if (dropped) onDrop();
    onEnd?.();
  }

  function move(moved: PointerEvent) {
    if (moved.pointerId !== pointerId) return;
    if (!ghost) {
      if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < DRAG_DISTANCE) return;
      begin();
    }
    ghost!.style.transform = `translate(${moved.clientX + 14}px, ${moved.clientY + 10}px)`;
    onMove(moved.clientX, moved.clientY);
  }

  function up(released: PointerEvent) {
    if (released.pointerId === pointerId) finish(true);
  }

  function cancel(cancelled: PointerEvent) {
    if (cancelled.pointerId === pointerId) finish(false);
  }

  function key(pressed: KeyboardEvent) {
    if (pressed.key !== "Escape" || !ghost) return;
    // A drag inside a menu ends without closing the menu.
    pressed.stopPropagation();
    finish(false);
  }

  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("lostpointercapture", cancel);
  document.addEventListener("keydown", key, true);
}
