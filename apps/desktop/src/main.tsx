import { createRoot } from "react-dom/client";
import { setLanguage } from "./lib/i18n.ts";

// The language comes first: some modules keep labels in constants, read as they load.
void (async () => {
  const settings = await fetch("/api/app-settings").then((response) => response.json()).catch(() => null);
  setLanguage(settings?.settings?.appearance?.language ?? "system", navigator.language);
  const { App } = await import("./App.tsx");
  createRoot(document.getElementById("root")!).render(<App />);
})();
