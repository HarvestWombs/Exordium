import type { Filter, Scan, SidebarSection, Status, Title } from "../types.ts";

/**
 * What the library shows for the current filter and search: the sidebar's sections (Favorites, the
 * collections, Recent, Mods, Cores) and, with View only, the one shown alone. Favorites, Recent and the
 * collections show only on the unfiltered list. There a favorite is in Favorites instead of Mods or
 * Cores; unfavoriting puts it back. Collections do not take a title out.
 */
export function libraryView(
  { titles, status, scan, filter, search, solo }: {
    titles: Title[];
    status: Status | null;
    scan: Scan | null;
    filter: Filter;
    search: string;
    solo: string | null;
  },
) {
  const favorites = new Set(status?.favorites ?? []);
  const hidden = new Set(status?.hidden ?? []);
  const visible = titles.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    // Hidden titles leave every list but the Hidden one; their files are untouched.
    if (filter === "hidden") return hidden.has(t.key);
    if (hidden.has(t.key)) return false;
    if (
      status?.appSettings.settings.library.hideUnsupported &&
      filter !== "issues" &&
      t.problems.some((problem) => problem.level === "error")
    ) return false;
    if (filter === "mods") return t.kind === "mod";
    if (filter === "cores") return t.kind === "core";
    if (filter === "issues") return t.problems.length > 0;
    return true;
  });
  const pinned = titles.filter((t) => favorites.has(t.key) && !hidden.has(t.key));
  const recent = titles
    .filter((t) => status?.playedAt[t.key] && !hidden.has(t.key))
    .sort((a, b) => status!.playedAt[b.key]!.localeCompare(status!.playedAt[a.key]!))
    .slice(0, 3);
  const sectionsOn = filter === "all" && !search;
  const inCategory = (t: Title) => !(sectionsOn && favorites.has(t.key));
  const modList = visible.filter((t) => t.kind === "mod" && inCategory(t));
  const coreList = visible.filter((t) => t.kind === "core" && inCategory(t));
  const collections = status?.collections ?? [];
  const byKey = new Map(titles.map((t) => [t.key, t]));
  const sections: SidebarSection[] = [
    ...(sectionsOn && pinned.length > 0
      ? [{ id: "favorites", label: "FAVORITES", name: "Favorites", titles: pinned }]
      : []),
    ...(sectionsOn
      ? collections.map((c) => ({
        id: `collection:${c.id}`,
        label: c.name.toUpperCase(),
        name: c.name,
        titles: c.keys.map((key) => byKey.get(key)).filter((t): t is Title => t !== undefined && !hidden.has(t.key)),
        collection: c,
      }))
      : []),
    ...(sectionsOn && recent.length > 0 ? [{ id: "recent", label: "RECENT", name: "Recent", titles: recent }] : []),
    ...(scan && filter !== "cores" ? [{ id: "mods", label: "MODS", name: "Mods", titles: modList }] : []),
    ...(scan && filter !== "mods" ? [{ id: "cores", label: "CORES", name: "Cores", titles: coreList }] : []),
  ];
  const soloSection = solo ? sections.find((section) => section.id === solo) ?? null : null;
  const coreNames = new Set((scan?.cores ?? []).map((c) => (c.core ?? c.folder).toLowerCase()));
  return {
    favorites,
    hidden,
    collections,
    sectionsOn,
    soloSection,
    shownSections: soloSection ? [soloSection] : sections,
    /** A mod whose core is not in the library (1.14 runs from the install itself, so never missing). */
    missingCore: (t: Title): string | null =>
      t.kind === "mod" && t.core && !t.core.startsWith("1.14") && !coreNames.has(t.core.toLowerCase()) ? t.core : null,
  };
}
