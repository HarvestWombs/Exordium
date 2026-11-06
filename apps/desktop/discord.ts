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

export interface ActivityButton {
  label: string;
  url: string;
}

export interface Activity {
  /**
   * What "Playing …" names, in place of the application's own name. Discord honours it over IPC
   * (measured 2026-11-06: "Playing Diablo 09" on the profile and in member lists). Unset, the
   * application's name shows.
   */
  name?: string;
  details?: string;
  state?: string;
  /**
   * Up to two link buttons (measured over IPC, 2026-11-06). Discord shows them only to other people,
   * never on the player's own profile. `state_url` (clickable state text) also works, and markdown in
   * the text does not.
   */
  buttons?: ActivityButton[];
  /** When the run started (ms since 1970); Discord counts the elapsed time from it. */
  startedAt?: number;
}

/**
 * What a run shows (the owner's layout, 2026-11-06): "Playing <mod> - <version>", the character once
 * known (characterLine, set as `details` by the server), the elapsed time, and the mod's first two
 * links as buttons (Homepage, Forum, Discord…). The core is not shown: players do not care which
 * patch a mod runs on. A core alone is "Diablo II".
 */
export function runActivity(title: {
  kind: "mod" | "core";
  name: string;
  version?: string | null;
  links?: ActivityButton[];
}): Activity {
  const out: Activity = { name: title.kind === "core" ? "Diablo II" : modName(title.name, title.version ?? null) };
  const buttons = cleanButtons(title.links);
  if (buttons.length) out.buttons = buttons;
  return out;
}

/** Discord's button limits: two at most, a label of 1 to 32 characters, an http(s) address up to 512. */
function cleanButtons(buttons: ActivityButton[] | undefined): ActivityButton[] {
  return (buttons ?? [])
    .map((button) => ({ label: button.label.trim().slice(0, 32), url: button.url.trim() }))
    .filter((button) => button.label && /^https?:\/\//i.test(button.url) && button.url.length <= 512)
    .slice(0, 2);
}

/** `MortalBorne - 1.0.0`; no version when there is none, it is all zeros, or the title already ends with it. */
function modName(name: string, version: string | null): string {
  const v = version?.trim().replace(/^v/i, "");
  if (!v || /^[0.]+$/.test(v) || name.toLowerCase().includes(v.toLowerCase())) return name;
  return `${name} - ${v}`;
}

/**
 * The second line once the character being played is known (see playingCharacter in server.ts):
 * class, level and softcore or hardcore, as the save had them last; no name, which is the player's own.
 */
export function characterLine(character: { className: string; level: number; hardcore: boolean }): string {
  return `Lv ${character.level} ${character.className} ${character.hardcore ? "Hardcore" : "Softcore"}`;
}

export const IDLE_ACTIVITY: Activity = { details: "Choosing a mod", state: "in Exordium" };

/** Discord's limits: 2 to 128 characters per text field. */
function clean(activity: Activity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["name", "details", "state"] as const) {
    const text = activity[key]?.trim();
    if (text) out[key] = text.length < 2 ? `${text} ` : text.slice(0, 128);
  }
  const buttons = cleanButtons(activity.buttons);
  if (buttons.length) out.buttons = buttons;
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
    type: 0,
    ...clean(activity),
    assets: { large_image: PRESENCE_ART, large_text: "Exordium" },
  };
  if (activity.startedAt && Number.isFinite(activity.startedAt)) {
    out.timestamps = { start: Math.floor(activity.startedAt / 1000) };
  }
  return JSON.stringify(out);
}

/** An activity back from activityJson's wire form (a box's stored presence); unknown fields dropped. */
export function parseActivityJson(json: string): Activity {
  const wire = JSON.parse(json) as Record<string, unknown>;
  const text = (key: string) => typeof wire[key] === "string" ? wire[key] as string : undefined;
  const out: Activity = {};
  for (const key of ["name", "details", "state"] as const) {
    const value = text(key);
    if (value) out[key] = value;
  }
  const buttons = cleanButtons(
    Array.isArray(wire.buttons)
      ? wire.buttons.filter((b): b is ActivityButton => typeof b?.label === "string" && typeof b?.url === "string")
      : [],
  );
  if (buttons.length) out.buttons = buttons;
  return out;
}

const RESYNC_MS = 60_000;
/** After a failed connect. Right after a disconnect Discord refuses for a moment (measured 2026-10-05). */
const RETRY_MS = [2_000, 5_000, 15_000];
const REPLY_MS = 5_000;

/** A connection to Discord's IPC: a named pipe on Windows, a Unix socket elsewhere. */
type IpcStream = Pick<Deno.FsFile, "read" | "write" | "close">;

/**
 * Where Discord listens for client `i`. On Windows a named pipe. Elsewhere a Unix socket in the
 * runtime folder (`XDG_RUNTIME_DIR`, else `TMPDIR`, else `/tmp`), or in the folder a Flatpak or Snap
 * Discord exposes it from.
 */
export function discordIpcPaths(i: number): string[] {
  if (Deno.build.os === "windows") return [`\\\\.\\pipe\\discord-ipc-${i}`];
  const bases = new Set(
    [Deno.env.get("XDG_RUNTIME_DIR"), Deno.env.get("TMPDIR"), Deno.env.get("TMP"), Deno.env.get("TEMP"), "/tmp"]
      .filter((base): base is string => !!base)
      .map((base) => base.replace(/\/+$/, "")),
  );
  const subfolders = ["", "app/com.discordapp.Discord/", "snap.discord/", ".flatpak/dev.vencord.Vesktop/xdg-run/"];
  return [...bases].flatMap((base) => subfolders.map((sub) => `${base}/${sub}discord-ipc-${i}`));
}

async function openIpc(path: string): Promise<IpcStream> {
  if (path.startsWith("\\\\.\\pipe\\")) return await Deno.open(path, { read: true, write: true });
  return await Deno.connect({ transport: "unix", path });
}

/**
 * Exordium's own presence. `set` says what should show (null: nothing); the connection follows,
 * connecting when Discord is there and re-sending every minute, which also restores it after Discord
 * restarts. Failures are quiet: no Discord means no presence, never an error.
 */
export class DiscordPresence {
  #pipe: IpcStream | null = null;
  #want: Activity | null = null;
  #queue: Promise<void> = Promise.resolve();
  #timer: number | undefined;
  #retry: number | undefined;
  #retries = 0;
  #nonce = 0;
  #connected = false;

  constructor(
    readonly clientId = DISCORD_CLIENT_ID,
    readonly pipeNames: (i: number) => string[] = discordIpcPaths,
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
    for (const path of Array.from({ length: 10 }, (_, i) => this.pipeNames(i)).flat()) {
      let pipe: IpcStream;
      try {
        pipe = await openIpc(path);
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
