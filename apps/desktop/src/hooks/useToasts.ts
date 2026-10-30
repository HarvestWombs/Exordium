import * as React from "react";

/** How long a toast stays on screen. */
export const TOAST_MS = 8000;

export interface Toast {
  id: number;
  text: string;
  tone: "bad" | "good";
}

let nextId = 0;

/** Errors and notices, shown over the page so the layout never moves, each gone after TOAST_MS. */
export function useToasts() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismissToast = React.useCallback((id: number) => {
    setToasts((all) => all.filter((each) => each.id !== id));
  }, []);

  const toast = React.useCallback((text: string, tone: Toast["tone"] = "bad") => {
    const id = nextId++;
    // The same message again restarts it rather than stacking a copy.
    setToasts((all) => [...all.filter((each) => each.text !== text), { id, text, tone }]);
    setTimeout(() => dismissToast(id), TOAST_MS);
  }, [dismissToast]);

  return { toasts, toast, dismissToast };
}
