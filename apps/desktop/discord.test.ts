import { assertEquals } from "@std/assert";
import { activityJson, characterLine, DiscordPresence, runActivity } from "./discord.ts";

Deno.test("a mod shows its name and core; a core shows itself as vanilla", () => {
  assertEquals(runActivity({ kind: "mod", name: "MortalBorne", core: "1.10f" }), {
    details: "MortalBorne",
    state: "Mod · 1.10f",
  });
  assertEquals(runActivity({ kind: "core", name: "1.10f LOD Vanilla", core: "1.10f" }), {
    details: "1.10f LOD Vanilla",
    state: "Vanilla · 1.10f",
  });
});

Deno.test("activity text fits Discord's 2 to 128 characters", () => {
  const json = JSON.parse(activityJson({ details: "X".repeat(200), state: "A" }));
  assertEquals(json.details.length, 128);
  assertEquals(json.state.length, 2);
  assertEquals(JSON.parse(activityJson({ details: "  ", state: "Mod" })).details, undefined);
});

Deno.test("without Discord, setting a presence is quiet and stays disconnected", async () => {
  const presence = new DiscordPresence("1", (i) => [`\\\\.\\pipe\\exordium-test-no-discord-${i}`]);
  await presence.set({ details: "Testing" });
  assertEquals(presence.connected, false);
  presence.close();
});

Deno.test("a run's activity carries its start time, in seconds, for Discord's elapsed time", () => {
  const json = JSON.parse(activityJson({ details: "MortalBorne", state: "Mod · 1.10f", startedAt: 1_791_000_000_500 }));
  assertEquals(json, {
    details: "MortalBorne",
    state: "Mod · 1.10f",
    assets: { large_image: "exordiummain", large_text: "Exordium" },
    timestamps: { start: 1_791_000_000 },
  });
  assertEquals(JSON.parse(activityJson({ details: "Choosing a mod" })).timestamps, undefined);
});

Deno.test("a run's second line names the character's class and level, never its name", () => {
  assertEquals(characterLine({ className: "Sorceress", level: 42, hardcore: false }), "Lv 42 Sorceress");
  assertEquals(characterLine({ className: "Barbarian", level: 7, hardcore: true }), "Lv 7 Barbarian · Hardcore");
});
