import { launchSettings, type ModSetup } from "@exordium/d2se";

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
      automatic: false,
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
