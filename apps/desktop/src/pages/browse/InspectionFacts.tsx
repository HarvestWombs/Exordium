import { tr } from "../../lib/i18n.ts";
import type { Inspection, InspectionBasis } from "./types.ts";

/** Plugins and loaders by the names their authors give them. */
const LOADER_NAMES: Record<string, string> = {
  plugy: "PlugY",
  d2mod: "D2Mod",
  d2gl: "D2GL",
  glide: "Glide",
  d2multires: "D2MultiRes",
  d2hd: "D2HD",
  sgd2freeres: "SGD2FreeRes",
  bh: "BH",
  d2expres: "D2ExpRes",
};

function basisLabel(basis: InspectionBasis): { short: string; long: string } {
  switch (basis) {
    case "manifest":
      return { short: tr("manifest"), long: tr("Stated in its exordium.mod.json") };
    case "setup":
      return { short: "D2SE", long: tr("Stated in its D2SE_SETUP.ini") };
    case "readme":
      return { short: tr("readme"), long: tr("Stated in its readme") };
    case "description":
      return { short: tr("uploader"), long: tr("Stated in the uploader's description") };
    case "files":
      return { short: tr("inferred"), long: tr("Inferred from the files in the archive") };
  }
}

function Fact({ label, value, basis }: { label: string; value: string; basis?: InspectionBasis }) {
  const source = basis ? basisLabel(basis) : null;
  return (
    <>
      <dt>{label}</dt>
      <dd data-tooltip={source?.long}>
        {value}
        {source && <span className="fact-basis">{source.short}</span>}
      </dd>
    </>
  );
}

/**
 * What the archive says about the mod, in the card's facts: its core, language, what it loads, its
 * author, and what it holds when that is not a mod. Each says where it came from: the mod's own files,
 * its readme, the uploader, or what its files imply.
 */
export function InspectionFacts({ inspection }: { inspection: Inspection }) {
  // Nearly everything is a mod, so only what is not one says what it is.
  const contents = {
    mod: "",
    data: tr("Loose data files"),
    game: tr("A whole game folder"),
    saves: tr("Character saves"),
    tool: tr("A tool"),
    docs: tr("Documentation only"),
    unknown: "",
  }[inspection.contents];
  // D2SE starts the mod; it is not something the mod loads.
  const loads = inspection.loaders.filter((id) => id !== "d2se");
  return (
    <>
      {inspection.core && <Fact label={tr("CORE")} value={inspection.core.label} basis={inspection.core.basis} />}
      {inspection.language && (
        <Fact label={tr("LANGUAGE")} value={inspection.language.name} basis={inspection.language.basis} />
      )}
      {contents && <Fact label={tr("CONTAINS")} value={contents} basis="files" />}
      {loads.length > 0 && <Fact label={tr("LOADS")} value={loads.map((id) => LOADER_NAMES[id] ?? id).join(", ")} />}
      {inspection.author && <Fact label={tr("AUTHOR")} value={inspection.author} basis="readme" />}
    </>
  );
}
