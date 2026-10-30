import * as React from "react";

/** How long an error stays on screen. */
const TOAST_MS = 8000;

export interface Toast {
  id: number;
  text: string;
}

let nextId = 0;

/** Errors, shown over the page so the layout never moves, each gone after TOAST_MS. */
export function useToasts() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismissToast = React.useCallback((id: number) => {
    setToasts((all) => all.filter((each) => each.id !== id));
  }, []);

  const toast = React.useCallback((text: string) => {
    const id = nextId++;
    // The same message again restarts it rather than stacking a copy.
    setToasts((all) => [...all.filter((each) => each.text !== text), { id, text }]);
    setTimeout(() => dismissToast(id), TOAST_MS);
  }, [dismissToast]);

  return { toasts, toast, dismissToast };
}
