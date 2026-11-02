/** How far from the origin the pointer moves before anything scrolls, in pixels. */
const DEAD_ZONE = 14;
/** A press held this long scrolls until release; a shorter click stays on until the next click. */
const HOLD_MS = 300;

/** Pixels a second, for the pointer this far from the origin along one axis. */
export function autoscrollSpeed(offset: number): number {
  const distance = Math.abs(offset) - DEAD_ZONE;
  return distance <= 0 ? 0 : Math.sign(offset) * distance ** 1.4 * 1.2;
}

/** The nearest element that can scroll each way: over a sideways strip, the page still goes up and down. */
export function scrollersOf(target: Element | null): { x: Element | null; y: Element | null } {
  let x: Element | null = null;
  let y: Element | null = null;
  for (let element = target; element && !(x && y); element = element.parentElement) {
    const style = getComputedStyle(element);
    if (!x && /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth) x = element;
    if (!y && /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight) y = element;
  }
  return { x, y };
}

const ARROW = "M16 3l5.5 7h-11z";

/** The round mark at the origin: an arrow for each way the area under it can scroll, and a dot. */
function originIcon(x: boolean, y: boolean): string {
  const arrow = (degrees: number) => `<path d="${ARROW}" fill="#000" transform="rotate(${degrees} 16 16)"/>`;
  return `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="15" fill="#fff" stroke="#000"/>
    <circle cx="16" cy="16" r="2.5" fill="#000"/>
    ${y ? arrow(0) + arrow(180) : ""}${x ? arrow(90) + arrow(270) : ""}
  </svg>`;
}

/** The pointer while scrolling: one arrow, turned to the way the page is moving. */
function directionCursor(degrees: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">` +
    `<g transform="rotate(${degrees} 16 16)"><path d="M16 4l7 9h-14z" fill="white" stroke="black"/></g>` +
    `<circle cx="16" cy="16" r="2.5" fill="black"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, default`;
}

function swallow(event: Event) {
  event.stopPropagation();
  event.preventDefault();
}

/**
 * Middle-click scrolling, run by the page. The browser's own draws the cursor its host gives it, which
 * a page cannot restyle, and differs between WebView2 and a browser. preventDefault on mousedown turns
 * it off. A click stays on until the next click or Escape; a held press scrolls until release.
 */
export function installAutoscroll() {
  document.addEventListener("mousedown", (event) => {
    if (event.button !== 1) return;
    const { x, y } = scrollersOf(event.target as Element);
    if (!x && !y) return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const started = performance.now();
    let pointerX = startX;
    let pointerY = startY;
    let last = started;
    let restX = 0;
    let restY = 0;

    const origin = document.createElement("div");
    origin.className = "autoscroll-origin";
    origin.style.left = `${startX}px`;
    origin.style.top = `${startY}px`;
    origin.innerHTML = originIcon(x !== null, y !== null);
    document.body.append(origin);
    document.body.classList.add("autoscrolling");

    let frame = requestAnimationFrame(function step(now) {
      const seconds = (now - last) / 1000;
      last = now;
      restX += x ? autoscrollSpeed(pointerX - startX) * seconds : 0;
      restY += y ? autoscrollSpeed(pointerY - startY) * seconds : 0;
      const left = Math.trunc(restX);
      const top = Math.trunc(restY);
      restX -= left;
      restY -= top;
      if (left) x?.scrollBy({ left, behavior: "instant" });
      if (top) y?.scrollBy({ top, behavior: "instant" });
      frame = requestAnimationFrame(step);
    });

    function stop() {
      cancelAnimationFrame(frame);
      origin.remove();
      document.body.classList.remove("autoscrolling");
      document.body.style.removeProperty("--autoscroll-cursor");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("mouseup", release);
      document.removeEventListener("mousedown", press, true);
      document.removeEventListener("keydown", key, true);
      globalThis.removeEventListener("blur", stop);
    }

    function move(moved: PointerEvent) {
      pointerX = moved.clientX;
      pointerY = moved.clientY;
      const offsetX = x ? pointerX - startX : 0;
      const offsetY = y ? pointerY - startY : 0;
      if (Math.hypot(offsetX, offsetY) <= DEAD_ZONE) return document.body.style.removeProperty("--autoscroll-cursor");
      const degrees = Math.round(Math.atan2(offsetX, -offsetY) * 180 / Math.PI / 45) * 45;
      document.body.style.setProperty("--autoscroll-cursor", directionCursor(degrees));
    }

    function release(released: MouseEvent) {
      if (released.button !== 1) return;
      const moved = Math.hypot(released.clientX - startX, released.clientY - startY) > DEAD_ZONE;
      if (moved || performance.now() - started >= HOLD_MS) stop();
    }

    // The click that ends it does nothing else.
    function press(pressed: MouseEvent) {
      swallow(pressed);
      stop();
      globalThis.addEventListener("click", swallow, { capture: true, once: true });
      globalThis.addEventListener("auxclick", swallow, { capture: true, once: true });
      globalThis.setTimeout(() => {
        globalThis.removeEventListener("click", swallow, true);
        globalThis.removeEventListener("auxclick", swallow, true);
      }, 500);
    }

    function key(pressed: KeyboardEvent) {
      if (pressed.key !== "Escape") return;
      swallow(pressed);
      stop();
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("mouseup", release);
    document.addEventListener("mousedown", press, true);
    document.addEventListener("keydown", key, true);
    globalThis.addEventListener("blur", stop);
  });
}
