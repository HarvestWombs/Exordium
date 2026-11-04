/**
 * A box's registry stack, and what a run changed in it. Vault: `Architecture/Registry.md`.
 *
 * - **base**: the machine's own Diablo II keys, read once (never written), so a profile starts with
 *   the player's usual video, sound and gateway settings.
 * - **profile**: what the box itself decides. For now that is where the game lives and where its
 *   characters are: `InstallPath` and `Save Path`, both inside the box. The game takes its save folder
 *   from `Save Path`, so this is what makes the mod's own characters appear.
 * - **writable**: whatever the last runs changed, kept per profile outside the box, because a box is
 *   rebuilt whenever its files change.
 */

import {
  normalizeKey,
  type RegistryEntry,
  type RegistryLayer,
  type RegistryTombstone,
  type RegistryValue,
  type ResolvedValue,
} from "@exordium/layers";
import type { RegFile } from "./reg-file.ts";
import { readMachineKeys } from "./machine-registry.ts";

export const DIABLO_KEY = "HKCU\\Software\\Blizzard Entertainment\\Diablo II";

/** Sven's Glide wrapper (`glide3x.dll` 1.4.x, the install-level one here) keeps its settings here. */
export const GLIDE_KEY = "HKCU\\Software\\GLIDE3toOpenGL";

/** The keys a base snapshot copies: the game's own, the Battle.net gateway list, the Glide wrapper's. */
export const GAME_KEYS = [DIABLO_KEY, "HKCU\\Software\\Battle.net\\Configuration", GLIDE_KEY] as const;

/** What D2SE writes to the registry for a mod before starting it, as far as it is known. */
export interface D2SERegistrySettings {
  renderer: "ddraw" | "d3d" | "opengl" | "glide";
  windowed: boolean;
  hardcore: boolean;
}

/**
 * The mod layer: the values D2SE sets from `D2SE_SETUP.ini` (vault, `Architecture/Launcher.md`,
 * `FUN_0040d390`). `AllowHardcore` follows the player's choice where the mod allows it; with Glide,
 * the window is the wrapper's, so `WindowMode` becomes its `windowed` value. D2SE's realm settings
 * are not here yet: how it builds the gateway list from them is not known.
 */
export function settingsLayer(settings: D2SERegistrySettings): RegistryLayer {
  const entries: RegistryEntry[] = [
    { key: DIABLO_KEY, name: "AllowHardcore", value: { type: "dword", data: settings.hardcore ? 1 : 0 } },
  ];
  if (settings.renderer === "glide") {
    entries.push({ key: GLIDE_KEY, name: "windowed", value: { type: "dword", data: settings.windowed ? 1 : 0 } });
  }
  return { id: "d2se-settings", role: "mod", entries };
}

/** Where the game keeps its gateway list. */
export const BATTLENET_KEY = "HKCU\\Software\\Battle.net\\Configuration";
export const GATEWAYS_VALUE = "Diablo II Battle.net gateways";

/** A mod's own realm: what Properties > Realm and D2SE's `Realm*` settings hold. */
export interface RealmSettings {
  gateway: string | null;
  timezone: string | null;
  gatewayName: string | null;
  selected: string | null;
}

/**
 * The mod's realm as registry values: a gateway list holding only that realm, and `BNETIP`, which
 * older Bnclients (1.09d) read as well. The list is the game's own format: `1002`, the selected
 * entry as two digits, then host, timezone and name per gateway. Null without a gateway.
 */
export function realmLayer(realm: RealmSettings | null): RegistryLayer | null {
  const host = realm?.gateway?.trim();
  if (!host) return null;
  const selected = Number.parseInt(realm?.selected?.trim() ?? "", 10);
  const timezone = realm?.timezone?.trim() || "0";
  return {
    id: "realm",
    role: "mod",
    entries: [
      {
        key: BATTLENET_KEY,
        name: GATEWAYS_VALUE,
        value: {
          type: "multi_sz",
          data: [
            "1002",
            String(Number.isFinite(selected) && selected >= 0 ? selected : 0).padStart(2, "0"),
            host,
            timezone,
            realm?.gatewayName?.trim() || host,
          ],
        },
      },
      { key: DIABLO_KEY, name: "BNETIP", value: { type: "sz", data: host } },
    ],
  };
}

/**
 * The writable layer without the values a mod layer owns outright, the realm's: a run that rewrote
 * the gateway list (the game puts Blizzard's back when it dislikes the one it finds) must not take
 * the mod off its own realm on the next start.
 */
export function withoutOwned(writable: RegistryLayer, owner: RegistryLayer | null): RegistryLayer {
  if (!owner) return writable;
  const id = (key: string, name: string) => `${normalizeKey(key).toLowerCase()}|${name.toLowerCase()}`;
  const owned = new Set(owner.entries.map((entry) => id(entry.key, entry.name ?? "")));
  const ownedKeys = new Set(owner.entries.map((entry) => normalizeKey(entry.key).toLowerCase()));
  return {
    ...writable,
    // A tombstone with no name deletes its whole key, the realm's values with it.
    entries: writable.entries.filter((entry) =>
      entry.name === undefined
        ? !ownedKeys.has(normalizeKey(entry.key).toLowerCase())
        : !owned.has(id(entry.key, entry.name))
    ),
  };
}

/** The layer id of the values a box owns; a run's changes to these are not kept. */
export const BOX_LAYER = "box";

const winPath = (path: string) => path.replace(/\//g, "\\").replace(/\\+$/, "");

/**
 * The values that tie the game to its box: where it is installed and where its saves are.
 * `gameFolder` is the path as the game sees it: `C:/...` on Windows, `Z:\...` under Wine.
 */
export function boxLayer(gameFolder: string): RegistryLayer {
  const folder = winPath(gameFolder);
  return {
    id: BOX_LAYER,
    role: "profile",
    entries: [
      { key: DIABLO_KEY, name: "InstallPath", value: { type: "sz", data: `${folder}\\` } },
      { key: DIABLO_KEY, name: "Save Path", value: { type: "sz", data: `${folder}\\save\\` } },
    ],
  };
}

/**
 * The machine's current values under `keys`, subkeys included, read straight from the registry (see
 * machine-registry.ts). A key that does not exist is skipped. Nothing is written to the registry.
 */
export function machineSnapshot(keys: readonly string[] = GAME_KEYS): Promise<RegFile> {
  // Off Windows the game runs in Exordium's own Wine prefix: there is no machine registry to start from.
  if (Deno.build.os !== "windows") return Promise.resolve({ entries: [], skipped: [] });
  return Promise.resolve(readMachineKeys(keys));
}

const id = (key: string, name: string) => `${normalizeKey(key).toLowerCase()}\0${name.toLowerCase()}`;

function sameValue(a: RegistryValue, b: RegistryValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What a run left in the hive that the lower layers did not put there, as a writable layer: every
 * value that is new or different, and a tombstone for every value that is gone. `lower` is the
 * resolved plan of every layer below writable. Values the box owns are never captured.
 */
export function capturedChanges(lower: readonly ResolvedValue[], after: readonly RegistryEntry[]): RegistryLayer {
  const planned = new Map(lower.map((v) => [id(v.key, v.name), v]));
  const seen = new Set<string>();
  const entries: (RegistryEntry | RegistryTombstone)[] = [];
  for (const value of after) {
    const key = id(value.key, value.name);
    seen.add(key);
    const was = planned.get(key);
    if (was?.layer === BOX_LAYER) continue;
    if (!was || !sameValue(was.value, value.value)) {
      entries.push({ key: normalizeKey(value.key), name: value.name, value: value.value });
    }
  }
  for (const [key, was] of planned) {
    if (!seen.has(key) && was.layer !== BOX_LAYER) entries.push({ key: was.key, name: was.name, deleted: true });
  }
  return { id: "writable", role: "writable", entries };
}

function profileFile(exordiumRoot: string, profile: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(profile)) throw new Error(`"${profile}" is not a valid profile id`);
  return `${exordiumRoot.replace(/\\/g, "/").replace(/\/+$/, "")}/profiles/${profile}/registry.json`;
}

/** The profile's writable registry layer, or an empty one before its first run. */
export async function readWritableLayer(exordiumRoot: string, profile: string): Promise<RegistryLayer> {
  try {
    return JSON.parse(await Deno.readTextFile(profileFile(exordiumRoot, profile))) as RegistryLayer;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return { id: "writable", role: "writable", entries: [] };
    throw error;
  }
}

export async function writeWritableLayer(exordiumRoot: string, profile: string, layer: RegistryLayer): Promise<void> {
  const file = profileFile(exordiumRoot, profile);
  await Deno.mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await Deno.writeTextFile(temp, JSON.stringify(layer, null, 2) + "\n");
  await Deno.rename(temp, file);
}
