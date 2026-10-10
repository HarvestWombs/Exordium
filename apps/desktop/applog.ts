/**
 * Exordium's own log, for what happens while nobody is watching.
 *
 * The packaged app has no console, so `console.*` went nowhere and a failure after two days left no
 * trace (the white window of 2026-10-02: no crash report, no event log entry). Everything the
 * server prints now also goes to Exordium's own `logs\exordium.log`, with:
 *
 * - uncaught errors and rejections;
 * - a health line every 10 minutes: uptime, memory, open event streams, the page's last heartbeat;
 * - the system sleeping (a timer that fires far later than asked);
 * - the page's heartbeat (`/api/heartbeat`, every 30 s): its JS heap and DOM size each hour, and
 *   any silence longer than three minutes, when it starts and when it ends.
 *
 * It records only; nothing here changes how the app behaves.
 */

import { exordiumRoot } from "./paths.ts";

const root = `${exordiumRoot}/logs`;
const file = `${root}/exordium.log`;
/** At start, a log larger than this is kept as `exordium.1.log` and a new one begun. */
const ROTATE_BYTES = 5 * 1024 * 1024;

const encoder = new TextEncoder();
let handle: Deno.FsFile | null = null;

function open(): void {
  try {
    Deno.mkdirSync(root, { recursive: true });
    const size = Deno.statSync(file).size;
    if (size > ROTATE_BYTES) Deno.renameSync(file, `${root}/exordium.1.log`);
  } catch {
    // No log yet.
  }
  try {
    handle = Deno.openSync(file, { append: true, create: true });
  } catch {
    handle = null;
  }
}

function text(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Writes one line to the log file, timestamped. */
export function appLog(level: "info" | "warn" | "error", ...parts: unknown[]): void {
  if (!handle) return;
  try {
    handle.writeSync(
      encoder.encode(`[${new Date().toISOString()}] ${level.toUpperCase()} ${parts.map(text).join(" ")}\n`),
    );
  } catch {
    // A full disk must not take the app down with it.
  }
}

/** The page's last heartbeat, for the health line and for spotting silence. */
let lastBeat = 0;
let beats = 0;
let silent = false;

export interface Heartbeat {
  /** `performance.memory.usedJSHeapSize`, where the page has it. */
  heap?: number;
  nodes?: number;
  visible?: boolean;
  error?: string;
}

/** Records a heartbeat from the page. Its numbers are logged hourly; an error at once. */
export function heartbeat(beat: Heartbeat): void {
  const now = Date.now();
  if (silent) {
    appLog("warn", `page heartbeat back after ${Math.round((now - lastBeat) / 1000)} s`, beat);
    silent = false;
  }
  if (beat.error) appLog("error", "page:", beat.error);
  if (beats % 120 === 0) appLog("info", "page", beat);
  beats += 1;
  lastBeat = now;
}

/** Starts the log: console output copied to the file, uncaught errors, the health line and sleep. */
export function startAppLog(details: () => Record<string, unknown>): void {
  open();
  appLog("info", `Exordium starting, pid ${Deno.pid}, args ${JSON.stringify(Deno.args)}`);

  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...parts: unknown[]) => {
      original(...parts);
      appLog(level === "log" ? "info" : level, ...parts);
    };
  }
  globalThis.addEventListener("error", (event) => appLog("error", "uncaught:", event.error ?? event.message));
  globalThis.addEventListener("unhandledrejection", (event) => appLog("error", "unhandled rejection:", event.reason));

  const started = Date.now();
  const HEALTH_MS = 10 * 60 * 1000;
  const TICK_MS = 15 * 1000;
  let lastTick = Date.now();
  let lastHealth = Date.now();
  setInterval(() => {
    const now = Date.now();
    // A 15 s timer that fires a minute or more late means the machine was asleep, or this process
    // was frozen; either way, worth having on the record next to whatever follows.
    const late = now - lastTick - TICK_MS;
    if (late > 60_000) appLog("warn", `timers resumed ${Math.round(late / 1000)} s late (sleep or a stall)`);
    lastTick = now;

    if (lastBeat && !silent && now - lastBeat > 3 * 60 * 1000) {
      silent = true;
      appLog("warn", `page heartbeat silent for ${Math.round((now - lastBeat) / 1000)} s`);
    }
    if (now - lastHealth >= HEALTH_MS) {
      lastHealth = now;
      const memory = Deno.memoryUsage();
      appLog("info", "health", {
        uptimeMin: Math.round((now - started) / 60_000),
        rssMB: Math.round(memory.rss / 1048576),
        heapMB: Math.round(memory.heapUsed / 1048576),
        lastBeatSec: lastBeat ? Math.round((now - lastBeat) / 1000) : null,
        ...details(),
      });
    }
  }, TICK_MS);
}
