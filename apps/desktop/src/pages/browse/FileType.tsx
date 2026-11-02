import { tr } from "../../lib/i18n.ts";
import { fileExtension, INSTALLER_FILE } from "./browse-util.ts";

/** What a card's download is, beside its size, so an installer can be seen and left alone. */
export function FileType({ name }: { name: string | null }) {
  const extension = fileExtension(name ?? "");
  if (!extension) return null;
  const installer = INSTALLER_FILE.test(name ?? "");
  return (
    <span
      className={installer ? "mod-filetype installer" : "mod-filetype"}
      data-tooltip={installer
        ? tr("An installer: Exordium never runs one for you. Open its page and install it yourself.")
        : undefined}
    >
      {extension}
    </span>
  );
}
