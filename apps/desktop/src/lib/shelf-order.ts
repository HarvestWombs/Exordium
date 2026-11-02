/**
 * The saved shelf order after one move. `shown` is only what this page lists: a search drops the
 * collections and the Collections page drops Mods and Cores, so saved ids stay put when they are not
 * shown. New shelves follow the saved ones, as they do on screen.
 */
export function moveInOrder(
  saved: string[],
  shown: string[],
  source: string,
  target: string,
  edge: "before" | "after",
): string[] {
  const order = [...saved, ...shown.filter((id) => !saved.includes(id))];
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const rest = order.filter((id) => id !== source);
  rest.splice(rest.indexOf(target) + (edge === "after" ? 1 : 0), 0, source);
  return rest;
}
