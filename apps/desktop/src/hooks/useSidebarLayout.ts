import * as React from "react";
import { readStored, writeStored } from "../lib/util.ts";

/** Sidebar sections folded shut (by id), and the sidebar folded to an icon rail; both remembered. */
export function useSidebarLayout() {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() =>
    new Set(readStored<string[]>("exordium.collapsed", []))
  );
  const [rail, setRail] = React.useState(() => readStored("exordium.sidebarRail", false));

  const fold = React.useCallback((ids: string[], shut: boolean) => {
    setCollapsed((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (shut) next.add(id);
        else next.delete(id);
      }
      writeStored("exordium.collapsed", [...next]);
      return next;
    });
  }, []);

  const toggleSection = React.useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored("exordium.collapsed", [...next]);
      return next;
    });
  }, []);

  const toggleRail = React.useCallback(() => {
    setRail((current) => {
      writeStored("exordium.sidebarRail", !current);
      return !current;
    });
  }, []);

  return { collapsed, rail, fold, toggleSection, toggleRail };
}
