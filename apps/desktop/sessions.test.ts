import { assertEquals } from "@std/assert";
import { isLive, processAlive, recentRuns, type SessionRecord, totalPlaytime } from "./sessions.ts";

function record(state: SessionRecord["state"]): SessionRecord {
  return {
    version: 1,
    key: "mod:Test",
    title: "Test",
    boxId: "d2se-test-1",
    copy: 1,
    state,
    launcherPid: 42,
    launcherCreated: 1000,
    gamePid: 43,
    gameCreated: 1001,
    startedAt: "2026-09-28T10:00:00.000Z",
    endedAt: null,
    exitCode: null,
    reason: null,
    registryDump: null,
  };
}

Deno.test("a run is live only while in progress and its launcher is the same process", () => {
  const same = (pid: number, created: number) => pid === 42 && created === 1000;
  assertEquals(isLive(record("running"), same), true);
  assertEquals(isLive(record("starting"), same), true);
  assertEquals(isLive(record("ended"), same), false);
  // The launcher died without writing its end: the record says running, the process says otherwise.
  assertEquals(isLive(record("running"), () => false), false);
});

Deno.test("play time adds up each title's runs and skips lines that do not parse", () => {
  const text = [
    `{"key":"mod:A","title":"A","startedAt":"2026-09-01T10:00:00.000Z","endedAt":"2026-09-01T11:00:00.000Z","seconds":3600,"state":"ended","exitCode":0}`,
    `not json`,
    `{"key":"mod:A","title":"A","startedAt":"2026-09-02T10:00:00.000Z","endedAt":"2026-09-02T10:30:00.000Z","seconds":1800,"state":"crashed","exitCode":3221225477}`,
    `{"key":"core:1.14d","title":"D2","startedAt":"2026-09-03T10:00:00.000Z","endedAt":"2026-09-03T10:01:00.000Z","seconds":60,"state":"ended","exitCode":0}`,
    ``,
  ].join("\n");
  const totals = totalPlaytime(text);
  assertEquals(totals.get("mod:A"), { seconds: 5400, runs: 2, lastEndedAt: "2026-09-02T10:30:00.000Z" });
  assertEquals(totals.get("core:1.14d")?.runs, 1);
});

Deno.test("this process is alive, and a wrong start time makes it someone else", () => {
  assertEquals(processAlive(Deno.pid, 0), true);
  assertEquals(processAlive(Deno.pid, 1), false);
  assertEquals(processAlive(0, 0), false);
});

Deno.test("recentRuns: one title's runs, newest first, bad lines skipped, limited", () => {
  const line = (key: string, startedAt: string, seconds: number) =>
    JSON.stringify({ key, title: key, startedAt, endedAt: startedAt, seconds, state: "ended", exitCode: 0 });
  const text = [
    line("mod:A", "2026-10-01T10:00:00.000Z", 60),
    "not json",
    line("mod:B", "2026-10-02T10:00:00.000Z", 30),
    line("mod:A", "2026-10-03T10:00:00.000Z", 120),
    line("mod:A", "2026-10-02T10:00:00.000Z", 90),
  ].join("\n");
  assertEquals(recentRuns(text, "mod:A", 10).map((r) => r.seconds), [120, 90, 60]);
  assertEquals(recentRuns(text, "mod:A", 2).map((r) => r.seconds), [120, 90]);
  assertEquals(recentRuns(text, "mod:C", 10), []);
});
