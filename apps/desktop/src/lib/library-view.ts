import { tr } from "../lib/i18n.ts";
import type { Filter, Scan, SidebarSection, Status, Title } from "../types.ts";

/**
 * What the library shows for the current filter and search: the sidebar's sections (Favorites, the
 * collections, Recent, Mods, Cores) and, with View only, the one shown alone. Favorites is a built-in
 * collection: unlike user collections, membership moves a title out of Mods or Cores. Favorites,
 * Recent and the collections show only on the unfiltered list.
 */
export function libraryView(
  { titles, status, scan, filters, search, solo }: {
    titles: Title[];
    status: Status | null;
    scan: Scan | null;
    filters: ReadonlySet<Filter>;
    search: string;
    solo: string | null;
  },
) {
  const favorites = new Set(status?.favorites ?? []);
  const hidden = new Set(status?.hidden ?? []);
  const visible = titles.filter((t) => {
    const needle = search.trim().toLowerCase();
    if (
      needle &&
      ![t.title, t.author, t.folder, t.version, t.core].some((value) => value?.toLowerCase().includes(needle))
    ) return false;
    const isHidden = hidden.has(t.key);
    if (filters.size === 0) {
      if (isHidden) return false;
      return !(
        status?.appSettings.settings.library.hideUnsupported &&
        t.problems.some((problem) => problem.level === "error")
      );
    }
    // Active checkboxes are inclusive: Mods + Favorites shows titles matching either. Hidden is
    // deliberately its own predicate, so choosing Mods does not leak hidden mods into the list.
    if (isHidden) return filters.has("hidden");
    if (
      status?.appSettings.settings.library.hideUnsupported &&
      !filters.has("issues") &&
      t.problems.some((problem) => problem.level === "error")
    ) return false;
    return (filters.has("mods") && t.kind === "mod") ||
      (filters.has("cores") && t.kind === "core") ||
      (filters.has("favorites") && favorites.has(t.key)) ||
      (filters.has("recent") && Boolean(status?.playedAt[t.key])) ||
      (filters.has("updates") && t.updateCheck?.available === true) ||
      (filters.has("issues") && t.problems.length > 0);
  });
  const pinned = titles.filter((t) => favorites.has(t.key) && !hidden.has(t.key));
  // Off in Settings, Library: no Recent section at all.
  const showRecent = status?.appSettings.settings.library.showRecent !== false;
  const recent = titles
    .filter((t) => showRecent && status?.playedAt[t.key] && !hidden.has(t.key))
    .sort((a, b) => status!.playedAt[b.key]!.localeCompare(status!.playedAt[a.key]!))
    .slice(0, 3);
  const sectionsOn = filters.size === 0 && !search;
  const inCategory = (t: Title) => !(sectionsOn && favorites.has(t.key));
  const modList = visible.filter((t) => t.kind === "mod" && inCategory(t));
  const coreList = visible.filter((t) => t.kind === "core" && inCategory(t));
  const collections = status?.collections ?? [];
  const byKey = new Map(titles.map((t) => [t.key, t]));
  const sections: SidebarSection[] = [
    ...(sectionsOn && pinned.length > 0
      ? [{ id: "favorites", label: tr("FAVORITES"), name: tr("Favorites"), titles: pinned, isCollection: true }]
      : []),
    ...(sectionsOn
      ? collections.map((c) => ({
        id: `collection:${c.id}`,
        label: c.name.toUpperCase(),
        name: c.name,
        titles: c.keys.map((key) => byKey.get(key)).filter((t): t is Title => t !== undefined && !hidden.has(t.key)),
        isCollection: true,
        collection: c,
      }))
      : []),
    ...(sectionsOn && recent.length > 0
      ? [{ id: "recent", label: tr("RECENT"), name: tr("Recent"), titles: recent }]
      : []),
    ...(scan && (sectionsOn || modList.length > 0)
      ? [{ id: "mods", label: tr("MODS"), name: tr("Mods"), titles: modList }]
      : []),
    ...(scan && (sectionsOn || coreList.length > 0)
      ? [{ id: "cores", label: tr("CORES"), name: tr("Cores"), titles: coreList }]
      : []),
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
    /** A mod whose core is not in the library. */
    missingCore: (t: Title): string | null =>
      t.kind === "mod" && t.core && !coreNames.has(t.core.toLowerCase()) ? t.core : null,
  };
}
