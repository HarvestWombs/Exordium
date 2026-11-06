import { assertEquals } from "@std/assert";
import { activityJson, characterLine, DiscordPresence, parseActivityJson, runActivity } from "./discord.ts";

Deno.test("a run shows the mod and its version as what is played, its links as buttons; a core is Diablo II", () => {
  const links = [
    { label: "Homepage", url: "https://www.moddb.com/mods/diablo-09" },
    { label: "Forum", url: "https://d2mods.info/forum/viewforum.php?f=1" },
    { label: "Discord", url: "https://discord.gg/abc" },
  ];
  assertEquals(runActivity({ kind: "mod", name: "Diablo 09", version: "1.2", links }), {
    name: "Diablo 09 - 1.2",
    buttons: links.slice(0, 2),
  });
  // No version, an all-zero one, or one the title already carries adds nothing.
  assertEquals(runActivity({ kind: "mod", name: "MortalBorne", version: null }), { name: "MortalBorne" });
  assertEquals(runActivity({ kind: "mod", name: "MortalBorne", version: "0.0.0" }).name, "MortalBorne");
  assertEquals(
    runActivity({ kind: "mod", name: "Median XL Sigma 2.3.2", version: "2.3.2" }).name,
    "Median XL Sigma 2.3.2",
  );
  assertEquals(runActivity({ kind: "core", name: "1.10f LOD Vanilla", version: null }), { name: "Diablo II" });
});

Deno.test("the wire form carries the name and buttons within Discord's limits, and reads back the same", () => {
  const activity = {
    name: "Diablo 09 - 1.2",
    details: "Lv 63 Sorceress Softcore",
    buttons: [{ label: "Homepage", url: "https://moddb.com/m" }],
  };
  const json = activityJson(activity);
  assertEquals(JSON.parse(json).type, 0);
  assertEquals(JSON.parse(json).buttons, activity.buttons);
  assertEquals(parseActivityJson(json), activity);
  // Not a web address, no label, or a third button: not sent. Labels stop at 32 characters.
  const buttons = JSON.parse(activityJson({
    buttons: [
      { label: "X".repeat(40), url: "https://a.example" },
      { label: "Local", url: "file:///C:/x" },
      { label: " ", url: "https://b.example" },
      { label: "Two", url: "https://c.example" },
      { label: "Three", url: "https://d.example" },
    ],
  })).buttons;
  assertEquals(buttons, [{ label: "X".repeat(32), url: "https://a.example" }, {
    label: "Two",
    url: "https://c.example",
  }]);
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
    type: 0,
    details: "MortalBorne",
    state: "Mod · 1.10f",
    assets: { large_image: "exordiummain", large_text: "Exordium" },
    timestamps: { start: 1_791_000_000 },
  });
  assertEquals(JSON.parse(activityJson({ details: "Choosing a mod" })).timestamps, undefined);
});

Deno.test("a run's second line names the character's class, level and game type, never its name", () => {
  assertEquals(characterLine({ className: "Sorceress", level: 63, hardcore: false }), "Lv 63 Sorceress Softcore");
  assertEquals(characterLine({ className: "Barbarian", level: 7, hardcore: true }), "Lv 7 Barbarian Hardcore");
});
