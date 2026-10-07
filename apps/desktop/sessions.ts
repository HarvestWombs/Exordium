/**
 * Runs, as the launcher records them. Vault: `Projects/Exordium/Decisions/Sessions Are Kept by the
 * Launcher.md`.
 *
 * `exordium-launch.exe` lives exactly as long as a run, whoever started it, so it writes the record:
 * `sessions/<box>.<copy>.json` while the run lasts and when it ends, and one line per run into
 * `playtime.jsonl`, which is only ever appended to. Exordium reads and watches these; it keeps no
 * run in memory, so a run started for a desktop shortcut, or one that outlives a closed Exordium,
 * is seen all the same.
 */

export type SessionState = "starting" | "running" | "ended" | "crashed" | "failed";

export interface SessionRecord {
  version: number;
  key: string;
  title: string;
  boxId: string;
  copy: number;
  state: SessionState;
  launcherPid: number;
  /** When the launcher process started, in ms since 1970: with the pid, it tells the process apart. */
  launcherCreated: number;
  gamePid: number;
  gameCreated: number;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  reason: string | null;
  /** The box's registry as the run left it, dumped by the launcher; gone once Exordium has read it. */
  registryDump: string | null;
}

export interface LedgerLine {
  key: string;
  title: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
  state: SessionState;
  exitCode: number;
}

export interface Playtime {
  seconds: number;
  runs: number;
  lastEndedAt: string | null;
}

/** Whether a record still describes a live run: in progress, and its launcher still that process. */
export function isLive(record: SessionRecord, alive: (pid: number, created: number) => boolean): boolean {
  return (record.state === "starting" || record.state === "running") &&
    alive(record.launcherPid, record.launcherCreated);
}

/** Play time per title, from the ledger's lines. A line that does not parse is skipped. */
export function totalPlaytime(text: string): Map<string, Playtime> {
  const totals = new Map<string, Playtime>();
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let line: LedgerLine;
    try {
      line = JSON.parse(raw) as LedgerLine;
    } catch {
      continue;
    }
    if (typeof line.key !== "string" || typeof line.seconds !== "number") continue;
    const total = totals.get(line.key) ?? { seconds: 0, runs: 0, lastEndedAt: null };
    total.seconds += Math.max(0, line.seconds);
    total.runs += 1;
    if (!total.lastEndedAt || line.endedAt > total.lastEndedAt) total.lastEndedAt = line.endedAt;
    totals.set(line.key, total);
  }
  return totals;
}

/** One title's runs from the ledger, newest first, at most `limit`. A line that does not parse is skipped. */
export function recentRuns(text: string, key: string, limit: number): LedgerLine[] {
  const runs: LedgerLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let line: LedgerLine;
    try {
      line = JSON.parse(raw) as LedgerLine;
    } catch {
      continue;
    }
    if (line.key !== key || typeof line.startedAt !== "string" || typeof line.seconds !== "number") continue;
    runs.push(line);
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

// ---- Is that process still running ---------------------------------------------------------------

const KERNEL32 = {
  OpenProcess: { parameters: ["u32", "i32", "u32"], result: "pointer" },
  GetProcessTimes: { parameters: ["pointer", "buffer", "buffer", "buffer", "buffer"], result: "i32" },
  GetExitCodeProcess: { parameters: ["pointer", "buffer"], result: "i32" },
  CloseHandle: { parameters: ["pointer"], result: "i32" },
} as const;

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const STILL_ACTIVE = 259;
/** FILETIME's epoch (1601) to 1970, in 100 ns units. */
const EPOCH_DIFFERENCE = 116444736000000000n;

let kernel32: Deno.DynamicLibrary<typeof KERNEL32> | null = null;

/**
 * Whether process `pid` is running and is the one that started at `created` (ms since 1970, as the
 * launcher recorded it). Windows reuses pids, so the pid alone could name some other process.
 */
export function processAlive(pid: number, created: number): boolean {
  if (!pid) return false;
  kernel32 ??= Deno.dlopen("kernel32.dll", KERNEL32);
  const handle = kernel32.symbols.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!handle) return false;
  try {
    const code = new Uint8Array(4);
    if (!kernel32.symbols.GetExitCodeProcess(handle, code)) return false;
    if (new DataView(code.buffer).getUint32(0, true) !== STILL_ACTIVE) return false;
    const times = [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)] as const;
    if (!kernel32.symbols.GetProcessTimes(handle, times[0], times[1], times[2], times[3])) return false;
    const started = Number((new DataView(times[0].buffer).getBigUint64(0, true) - EPOCH_DIFFERENCE) / 10000n);
    // The launcher took its own creation time the same way; allow a millisecond of rounding.
    return !created || Math.abs(started - created) <= 1;
  } finally {
    kernel32.symbols.CloseHandle(handle);
  }
}

// ---- The files ----------------------------------------------------------------------------------

export class Sessions {
  readonly folder: string;
  readonly ledger: string;

  constructor(exordiumRoot: string) {
    this.folder = `${exordiumRoot}/sessions`;
    this.ledger = `${exordiumRoot}/playtime.jsonl`;
  }

  /** The record file for one copy of a box. */
  file(boxId: string, copy: number): string {
    return `${this.folder}/${boxId}.${copy}.json`;
  }

  /** Every record, with its file. A record being replaced this instant may be missed until the next read. */
  async list(): Promise<{ file: string; record: SessionRecord }[]> {
    const found: { file: string; record: SessionRecord }[] = [];
    try {
      for await (const entry of Deno.readDir(this.folder)) {
        if (!entry.isFile || !entry.name.endsWith(".json")) continue;
        const file = `${this.folder}/${entry.name}`;
        try {
          found.push({ file, record: JSON.parse(await Deno.readTextFile(file)) as SessionRecord });
        } catch {
          // Mid-replace or damaged: the next read sees it whole.
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    return found;
  }

  /** A title's latest runs, newest first (the overview's activity feed). */
  async recent(key: string, limit = 12): Promise<LedgerLine[]> {
    try {
      return recentRuns(await Deno.readTextFile(this.ledger), key, limit);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return [];
      throw error;
    }
  }

  async playtime(): Promise<Map<string, Playtime>> {
    try {
      return totalPlaytime(await Deno.readTextFile(this.ledger));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return new Map();
      throw error;
    }
  }

  /** Calls `changed` (at most every 200 ms) whenever a record is written or removed. */
  async watch(changed: () => void): Promise<void> {
    await Deno.mkdir(this.folder, { recursive: true });
    let timer: number | undefined;
    for await (const _event of Deno.watchFs(this.folder)) {
      clearTimeout(timer);
      timer = setTimeout(changed, 200);
    }
  }
}
