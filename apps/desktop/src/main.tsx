import { createRoot } from "react-dom/client";
import { installAutoscroll } from "./lib/autoscroll.ts";
import { setLanguage } from "./lib/i18n.ts";

// Dragging is startPointerDrag's. Left alone, any image or link starts a Windows drag: its no-entry
// cursor and "Move" label over the page.
document.addEventListener("dragstart", (event) => event.preventDefault());
installAutoscroll();

// The language comes first: some modules keep labels in constants, read as they load.
void (async () => {
  const settings = await fetch("/api/app-settings").then((response) => response.json()).catch(() => null);
  setLanguage(settings?.settings?.appearance?.language ?? "system", navigator.language);
  const { App } = await import("./App.tsx");
  createRoot(document.getElementById("root")!).render(<App />);
})();
