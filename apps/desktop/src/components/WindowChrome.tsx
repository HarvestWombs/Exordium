import { tr } from "../lib/i18n.ts";
import type * as React from "react";

export function WindowControls({ maximized, onToggleMaximize }: { maximized: boolean; onToggleMaximize: () => void }) {
  const post = (path: string) => void fetch(path, { method: "POST" }).catch(() => {});
  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control"
        title={tr("Minimize")}
        onClick={() => post("/api/window/minimize")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control"
        title={maximized ? tr("Restore") : tr("Maximize")}
        onClick={onToggleMaximize}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /> : <path d="M.5.5h9v9h-9z" />}
        </svg>
      </button>
      <button
        type="button"
        className="window-control close"
        title={tr("Close")}
        onClick={() => post("/api/window/close")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}

/** The window has no OS border to grab, so thin bands along the edges start the resize instead. */
export function ResizeHandles() {
  const start = (edge: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    document.body.classList.add("resizing-window");
    const stop = () => {
      document.body.classList.remove("resizing-window");
      globalThis.removeEventListener("pointerup", stop);
      globalThis.removeEventListener("mouseup", stop);
      globalThis.removeEventListener("blur", stop);
    };
    globalThis.addEventListener("pointerup", stop);
    globalThis.addEventListener("mouseup", stop);
    globalThis.addEventListener("blur", stop);
    void fetch(`/api/window/resize?edge=${edge}`, { method: "POST" }).catch(stop);
  };
  return (
    <div className="resize-handles">
      {["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((edge) => (
        <div key={edge} className={`resize resize-${edge}`} onPointerDown={start(edge)} />
      ))}
    </div>
  );
}
