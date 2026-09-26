/**
 * What changed between two plans — for "see what an update changes before accepting it", and for
 * telling a player how their box differs from another one.
 *
 * Only content counts. A file that moved from the core layer into the mod layer with the same bytes
 * has not changed as far as the game can tell, so it is not reported; the same goes for spelling.
 */

import type { Plan, ResolvedFile, ResolvedValue } from "./types.ts";
import { keyMatch, pathKey } from "./names.ts";

export interface Change<T> {
  before: T;
  after: T;
}

export interface PlanDiff {
  files: { added: ResolvedFile[]; removed: ResolvedFile[]; changed: Change<ResolvedFile>[] };
  registry: { added: ResolvedValue[]; removed: ResolvedValue[]; changed: Change<ResolvedValue>[] };
}

export function diffPlans(before: Plan, after: Plan): PlanDiff {
  return {
    files: diff(before.files, after.files, (f) => pathKey(f.path), (a, b) => a.hash === b.hash && a.size === b.size),
    registry: diff(
      before.registry,
      after.registry,
      (v) => `${keyMatch(v.key)}\x00${v.name.toLowerCase()}`,
      (a, b) => a.value.type === b.value.type && JSON.stringify(a.value.data) === JSON.stringify(b.value.data),
    ),
  };
}

export function isEmptyDiff(diff: PlanDiff): boolean {
  return [diff.files, diff.registry].every((d) => !d.added.length && !d.removed.length && !d.changed.length);
}

function diff<T>(
  before: readonly T[],
  after: readonly T[],
  id: (item: T) => string,
  same: (a: T, b: T) => boolean,
): { added: T[]; removed: T[]; changed: Change<T>[] } {
  const old = new Map(before.map((item) => [id(item), item]));
  const added: T[] = [];
  const changed: Change<T>[] = [];
  for (const item of after) {
    const key = id(item);
    const previous = old.get(key);
    if (previous === undefined) added.push(item);
    else if (!same(previous, item)) changed.push({ before: previous, after: item });
    old.delete(key);
  }
  return { added, removed: [...old.values()], changed };
}
