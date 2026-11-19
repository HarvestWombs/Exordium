/**
 * Stages the one immutable pre-1.14 loader for packaging.
 *
 * Boxes retain Blizzard's original `Game.exe` as version metadata. Exordium runs this shared loader
 * by absolute path with the box as its working directory, so no loader copy is stamped per core.
 */

/** Recreates `out` with exactly one shared `Game.exe`. */
export async function stageGame(loader: string, out: string): Promise<string> {
  await Deno.remove(out, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(out, { recursive: true });
  const target = `${out}/Game.exe`;
  await Deno.copyFile(loader, target);
  return target;
}

if (import.meta.main) {
  const build = new URL("../../native/loader/build/", import.meta.url);
  const path = (name: string) => decodeURIComponent(new URL(name, build).pathname).replace(/^\/([a-z]:)/i, "$1");
  const target = await stageGame(path("exordium-game.exe"), path("game"));
  console.log(`Staged the shared game loader at ${target}.`);
}
