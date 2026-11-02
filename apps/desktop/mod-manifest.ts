import { launchSettings, type ModSetup } from "@exordium/d2se";

/** Launch settings a manifest may also write at its top level; `launch` wins when it has both. */
const FLAT_LAUNCH = [
  "renderer",
  "windowed",
  "noSound",
  "direct",
  "txt",
  "hardcore",
  "plugY",
  "language",
  "skipToBNet",
  "seed",
  "startAct",
] as const;

function group(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * A manifest in its one spelling, for Properties to edit: `name`, `updates`, `update.manifest` and the
 * flat launch and load fields moved to where the forms read them. Anything else, unknown keys and
 * `$schema` included, is kept as it is.
 */
export function normalizeManifest(raw: Record<string, unknown>): Record<string, unknown> {
  const { name, updates, mpqs, dlls, ...rest } = raw;
  const launch = { ...group(rest.launch) };
  for (const key of FLAT_LAUNCH) {
    launch[key] ??= rest[key];
    if (launch[key] === undefined) delete launch[key];
    delete rest[key];
  }
  const { manifest: endpoint, ...update } = group(rest.update ?? updates);
  update.endpoint ??= endpoint ?? null;
  const loads = group(rest.loads);
  const title = rest.title ?? name;
  return {
    ...rest,
    ...(title === undefined ? {} : { title }),
    update,
    launch,
    loads: { ...loads, mpqs: loads.mpqs ?? mpqs ?? [], dlls: loads.dlls ?? dlls ?? [] },
  };
}

export function exordiumManifestFromD2SE(setup: ModSetup): Record<string, unknown> {
  const launch = launchSettings(setup);
  return {
    title: setup.mod.title ?? setup.mod.name ?? "",
    name: setup.mod.name ?? setup.mod.title ?? "",
    author: "",
    version: setup.mod.version ?? "",
    core: setup.mod.core ?? "",
    description: setup.mod.description ?? "",
    readme: setup.mod.readme ?? "",
    update: {
      endpoint: null,
      manifest: null,
      channel: "stable",
      automatic: true,
      background: true,
    },
    art: {
      banner: null,
      icon: null,
      portrait: null,
    },
    links: [
      ...(setup.mod.homepage ? [{ label: "Homepage", url: setup.mod.homepage }] : []),
      ...(setup.mod.board ? [{ label: "Forum", url: setup.mod.board }] : []),
    ],
    launch: {
      renderer: launch.renderer,
      windowed: launch.windowed,
      noSound: launch.noSound,
      hardcore: launch.hardcore,
      plugY: launch.plugY,
      direct: launch.direct,
      txt: launch.txt,
      language: launch.language ?? "MOD",
      skipToBNet: launch.skipToBNet,
      seed: launch.seed,
      startAct: launch.startAct,
      perspective: launch.perspective,
      lowQuality: launch.lowQuality,
      gamma: launch.gamma,
      vsync: launch.vsync,
      noCompress: launch.noCompress,
      noFixAspect: launch.noFixAspect,
      backgroundSound: launch.backgroundSound,
    },
    loads: {
      nefex: setup.loads.nefex,
      d2mod: setup.loads.d2mod,
      d2extra: setup.loads.d2extra,
      dlls: setup.loads.dlls,
      mpqs: setup.loads.mpqs,
    },
    realm: setup.realm ?? {
      gateway: null,
      timezone: null,
      gatewayName: null,
      selected: null,
      port: null,
    },
  };
}
