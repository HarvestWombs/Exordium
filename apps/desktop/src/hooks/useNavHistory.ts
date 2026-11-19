import * as React from "react";

/** How many steps back are kept. */
const LIMIT = 100;

/**
 * Back and forward through the app's own pages, as a browser does: the mouse's back and forward
 * buttons, Alt+Left and Alt+Right, and keyboards' Back and Forward keys. `location` is where the app
 * is, in a form that compares as JSON (only what makes a page: not tabs, dialogs or scroll); each
 * change is a step. `apply` puts the app back at a location it was at. The page has no history of its
 * own (one document), so WebView2's own back does nothing, and the steps are kept here.
 */
export function useNavHistory<T>(location: T, apply: (to: T) => void): void {
  const key = JSON.stringify(location);
  const back = React.useRef<string[]>([]);
  const forward = React.useRef<string[]>([]);
  const current = React.useRef<string | null>(null);
  // Set while a step back or forward lands: whatever location it settles on is not a new step.
  const restoring = React.useRef(false);
  const applyRef = React.useRef(apply);
  applyRef.current = apply;

  React.useEffect(() => {
    if (current.current === null || restoring.current) {
      restoring.current = false;
      current.current = key;
      return;
    }
    if (key === current.current) return;
    back.current.push(current.current);
    if (back.current.length > LIMIT) back.current.shift();
    forward.current = [];
    current.current = key;
  }, [key]);

  React.useEffect(() => {
    const go = (step: -1 | 1) => {
      const from = step < 0 ? back.current : forward.current;
      const to = step < 0 ? forward.current : back.current;
      const target = from.pop();
      if (target === undefined || current.current === null) return;
      to.push(current.current);
      restoring.current = true;
      applyRef.current(JSON.parse(target) as T);
    };
    // Mouse buttons 3 and 4 are back and forward. Their default (the document's own history) is
    // stopped on press and release alike, or WebView2 could still act on one of them.
    const stop = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      go(event.button === 3 ? -1 : 1);
    };
    const onKey = (event: KeyboardEvent) => {
      const step = event.key === "BrowserBack" || (event.altKey && event.key === "ArrowLeft")
        ? -1
        : event.key === "BrowserForward" || (event.altKey && event.key === "ArrowRight")
        ? 1
        : 0;
      if (!step) return;
      event.preventDefault();
      go(step);
    };
    globalThis.addEventListener("mousedown", stop);
    globalThis.addEventListener("auxclick", stop);
    globalThis.addEventListener("mouseup", onMouseUp);
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("mousedown", stop);
      globalThis.removeEventListener("auxclick", stop);
      globalThis.removeEventListener("mouseup", onMouseUp);
      globalThis.removeEventListener("keydown", onKey);
    };
  }, []);
}
