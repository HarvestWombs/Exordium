import * as React from "react";

/**
 * The desktop window: whether the page runs in Exordium's own window (it strips the OS frame, leaving
 * the top bar as the title bar; in a browser there is no window to drive), whether it is maximized,
 * and whether Windows is in light mode, for the "Use system" theme. See window.ts.
 */
export function useAppWindow() {
  const [desktop, setDesktop] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);
  const [systemLight, setSystemLight] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      try {
        const body = await (await fetch("/api/window/ready", { method: "POST" })).json();
        setDesktop(body.desktop === true);
      } catch {
        // No window control; nothing to show.
      }
    })();
  }, []);

  React.useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;
    const sync = () => setSystemLight(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Windows can maximize or restore the window on its own (Snap to the top, Win+Up, dragging a
  // maximized window out), so the buttons and edge bands follow its real state on every resize.
  React.useEffect(() => {
    if (!desktop) return;
    let pending = 0;
    const onResize = () => {
      clearTimeout(pending);
      pending = setTimeout(async () => {
        try {
          const body = await (await fetch("/api/window/state")).json();
          setMaximized(body.maximized === true);
        } catch {
          // Keep the last known state.
        }
      }, 100);
    };
    globalThis.addEventListener("resize", onResize);
    return () => {
      clearTimeout(pending);
      globalThis.removeEventListener("resize", onResize);
    };
  }, [desktop]);

  const toggleMaximize = React.useCallback(async () => {
    const body = await (await fetch("/api/window/maximize", { method: "POST" })).json();
    if (body.ok) setMaximized(body.maximized);
  }, []);

  return { desktop, maximized, setMaximized, systemLight, toggleMaximize };
}

/**
 * Page-wide housekeeping. The browser's own right-click menu (Back, Reload, Inspect…) is not part of
 * the app: text fields keep it, for cut, copy and paste, and the app's own menus call preventDefault
 * themselves. Nor is the browser's zoom. And a heartbeat to the server's log every 30 s, with the page's memory and size, and any
 * uncaught error: what is needed to tell a dead or bloated page from a stuck server (applog.ts).
 */
export function usePageHousekeeping() {
  React.useEffect(() => {
    const onMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);

  // The browser's zoom is not the app's either: Ctrl+wheel (a touchpad pinch arrives as one too) and
  // Ctrl with plus, minus or 0 would scale the whole window, layout and all. A touchscreen pinch is
  // stopped in CSS (touch-action on html).
  React.useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    const ZOOM_KEYS = new Set(["Equal", "Minus", "Digit0", "NumpadAdd", "NumpadSubtract", "Numpad0"]);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && ZOOM_KEYS.has(event.code)) event.preventDefault();
    };
    globalThis.addEventListener("wheel", onWheel, { passive: false });
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("wheel", onWheel);
      globalThis.removeEventListener("keydown", onKey);
    };
  }, []);

  React.useEffect(() => {
    const send = (extra: Record<string, unknown> = {}) => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      void fetch("/api/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          heap: memory?.usedJSHeapSize,
          nodes: document.getElementsByTagName("*").length,
          visible: document.visibilityState === "visible",
          ...extra,
        }),
      }).catch(() => {});
    };
    const onError = (event: ErrorEvent) => send({ error: `${event.message} at ${event.filename}:${event.lineno}` });
    const onRejection = (event: PromiseRejectionEvent) =>
      send({ error: `unhandled rejection: ${String(event.reason)}` });
    send();
    const timer = setInterval(() => send(), 30_000);
    globalThis.addEventListener("error", onError);
    globalThis.addEventListener("unhandledrejection", onRejection);
    return () => {
      clearInterval(timer);
      globalThis.removeEventListener("error", onError);
      globalThis.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}
