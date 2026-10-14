/**
 * Discord Rich Presence: "Playing Diablo II".
 *
 * Exordium shows it itself: "Playing" with the running title and its elapsed time while a game it
 * started runs, and an idle one while it is open and nothing runs. Since the release-safe build
 * (no launcher, no hook, no presence helper: Defender quarantined them), every run is followed by
 * the app, so the app is also what knows a game is running. A launcher-owned run (a session file)
 * would still show its own and the app would step aside.
 *
 * The application is HarvestLabs' own (DISCORD_CLIENT_ID): its name and icon are what friends see,
 * and its one art asset (PRESENCE_ART) is the picture every activity shows. Per-mod art would need an
 * asset uploaded per mod, so there is none.
 *
 * The protocol: frames of [int32 opcode][int32 length][JSON] over \\.\pipe\discord-ipc-N; opcode 0
 * handshakes, 1 carries commands. Each command is written and its reply read before the next, never
 * with a read left pending: the pipe is a synchronous handle, on which a pending read would block
 * every write.
 */

// HarvestLabs' own Discord application: used for sign-in (OAuth) and Rich Presence. Name it
// "Diablo II" in the developer portal to keep the presence label. (2026-10-06)
export const DISCORD_CLIENT_ID = "1557139755425071234";

export interface Activity {
  details?: string;
  state?: string;
  /** When the run started (ms since 1970); Discord counts the elapsed time from it. */
  startedAt?: number;
}

/** What a run shows: the title on top, what it is below. */
export function runActivity(title: { kind: "mod" | "core"; name: string; core: string | null }): Activity {
  if (title.kind === "core") return { details: title.name, state: `Vanilla · ${title.core ?? "?"}` };
  return { details: title.name, state: title.core ? `Mod · ${title.core}` : "Mod" };
}

/**
 * The second line once the character being played is known (see playingCharacter in server.ts):
 * class and level, as the save had them last; no name, which is the player's own.
 */
export function characterLine(character: { className: string; level: number; hardcore: boolean }): string {
  return `Lv ${character.level} ${character.className}${character.hardcore ? " · Hardcore" : ""}`;
}

export const IDLE_ACTIVITY: Activity = { details: "Choosing a mod", state: "in Exordium" };

/** Discord's limits: 2 to 128 characters per text field. */
function clean(activity: Activity): Activity {
  const out: Activity = {};
  for (const key of ["details", "state"] as const) {
    const text = activity[key]?.trim();
    if (text) out[key] = text.length < 2 ? `${text} ` : text.slice(0, 128);
  }
  return out;
}

/**
 * The Rich Presence art key, uploaded in the developer portal's Rich Presence → Art Assets as
 * "ExordiumMain" (2026-10-14). The portal keeps asset names in lowercase, and activities name them
 * that way. One picture for every activity: per-mod art would need an asset per mod.
 */
export const PRESENCE_ART = "exordiummain";

export function activityJson(activity: Activity): string {
  const out: Record<string, unknown> = {
    ...clean(activity),
    assets: { large_image: PRESENCE_ART, large_text: "Exordium" },
  };
  if (activity.startedAt && Number.isFinite(activity.startedAt)) {
    out.timestamps = { start: Math.floor(activity.startedAt / 1000) };
  }
  return JSON.stringify(out);
}

const RESYNC_MS = 60_000;
/** After a failed connect. Right after a disconnect Discord refuses for a moment (measured 2026-10-05). */
const RETRY_MS = [2_000, 5_000, 15_000];
const REPLY_MS = 5_000;

/**
 * Exordium's own presence. `set` says what should show (null: nothing); the connection follows,
 * connecting when Discord is there and re-sending every minute, which also restores it after Discord
 * restarts. Failures are quiet: no Discord means no presence, never an error.
 */
export class DiscordPresence {
  #pipe: Deno.FsFile | null = null;
  #want: Activity | null = null;
  #queue: Promise<void> = Promise.resolve();
  #timer: number | undefined;
  #retry: number | undefined;
  #retries = 0;
  #nonce = 0;
  #connected = false;

  constructor(
    readonly clientId = DISCORD_CLIENT_ID,
    readonly pipeName = (i: number) => `\\\\.\\pipe\\discord-ipc-${i}`,
  ) {}

  get connected(): boolean {
    return this.#connected;
  }

  /** What should be showing, connected or not. */
  get activity(): Activity | null {
    return this.#want;
  }

  set(activity: Activity | null): Promise<void> {
    const changed = JSON.stringify(activity) !== JSON.stringify(this.#want);
    this.#want = activity;
    if (!changed) return this.#queue;
    return this.#sync();
  }

  close(): void {
    clearInterval(this.#timer);
    clearTimeout(this.#retry);
    this.#timer = undefined;
    this.#want = null;
    this.#disconnect();
  }

  #sync(): Promise<void> {
    this.#queue = this.#queue.then(() => this.#apply()).catch(() => this.#disconnect());
    return this.#queue;
  }

  async #apply(): Promise<void> {
    clearTimeout(this.#retry);
    this.#retry = undefined;
    if (this.#want === null) {
      clearInterval(this.#timer);
      this.#timer = undefined;
      if (this.#pipe) {
        await this.#command(null).catch(() => {});
        this.#disconnect();
      }
      return;
    }
    this.#timer ??= setInterval(() => void this.#sync(), RESYNC_MS);
    if (!this.#pipe && !(await this.#connect())) {
      this.#retry = setTimeout(() => void this.#sync(), RETRY_MS[Math.min(this.#retries++, RETRY_MS.length - 1)]);
      return;
    }
    this.#retries = 0;
    try {
      await this.#command(this.#want);
    } catch {
      // Discord went away since the last command: try once on a fresh connection.
      this.#disconnect();
      if (await this.#connect()) await this.#command(this.#want);
    }
  }

  async #connect(): Promise<boolean> {
    for (let i = 0; i < 10; i++) {
      let pipe: Deno.FsFile;
      try {
        pipe = await Deno.open(this.pipeName(i), { read: true, write: true });
      } catch {
        continue;
      }
      this.#pipe = pipe;
      try {
        await this.#write(0, { v: 1, client_id: this.clientId });
        const ready = await this.#read();
        if (ready.evt === "READY") {
          this.#connected = true;
          return true;
        }
      } catch {
        // Not Discord, or not answering: try the next pipe.
      }
      this.#disconnect();
    }
    return false;
  }

  #disconnect(): void {
    try {
      this.#pipe?.close();
    } catch {
      // Already closed.
    }
    this.#pipe = null;
    this.#connected = false;
  }

  async #command(activity: Activity | null): Promise<void> {
    const args: Record<string, unknown> = { pid: Deno.pid };
    if (activity) args.activity = JSON.parse(activityJson(activity));
    await this.#write(1, { cmd: "SET_ACTIVITY", nonce: String(++this.#nonce), args });
    const reply = await this.#read();
    if (reply.evt === "ERROR") throw new Error(String((reply.data as { message?: string })?.message ?? "error"));
  }

  async #write(op: number, payload: unknown): Promise<void> {
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const frame = new Uint8Array(8 + body.length);
    const view = new DataView(frame.buffer);
    view.setInt32(0, op, true);
    view.setInt32(4, body.length, true);
    frame.set(body, 8);
    let written = 0;
    while (written < frame.length) written += await this.#pipe!.write(frame.subarray(written));
  }

  async #read(): Promise<Record<string, unknown>> {
    const pipe = this.#pipe!;
    const exact = async (n: number) => {
      const out = new Uint8Array(n);
      let got = 0;
      while (got < n) {
        const read = await pipe.read(out.subarray(got));
        if (read === null) throw new Error("Discord closed the pipe");
        got += read;
      }
      return out;
    };
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Discord did not answer")), REPLY_MS);
    });
    try {
      return await Promise.race([
        (async () => {
          const header = new DataView((await exact(8)).buffer);
          const length = header.getInt32(4, true);
          if (length < 0 || length > 1 << 20) throw new Error("Bad frame from Discord");
          return JSON.parse(new TextDecoder().decode(await exact(length)));
        })(),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
