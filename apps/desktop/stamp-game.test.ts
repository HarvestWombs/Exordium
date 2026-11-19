import { assertEquals } from "@std/assert";
import { stageGame } from "./stamp-game.ts";

Deno.test("the game loader stage contains one unchanged executable", async () => {
  const root = await Deno.makeTempDir();
  try {
    const loader = `${root}/exordium-game.exe`;
    const out = `${root}/game`;
    await Deno.writeTextFile(loader, "one immutable loader");
    await Deno.mkdir(`${out}/old-core`, { recursive: true });
    await Deno.writeTextFile(`${out}/old-core/Game.exe`, "old stamped variant");

    assertEquals(await stageGame(loader, out), `${out}/Game.exe`);
    assertEquals(await Deno.readTextFile(`${out}/Game.exe`), "one immutable loader");
    assertEquals([...Deno.readDirSync(out)].map((entry) => entry.name), ["Game.exe"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
