import { tr } from "../../lib/i18n.ts";
import * as React from "react";
import { SettingsGroup, ToggleRow } from "../../components/settings-rows.tsx";
import { openLink } from "../../lib/util.ts";
import type { Status } from "../../types.ts";

export function DiscordSettings(
  { status, onChanged }: {
    status: Status;
    onChanged: () => Promise<unknown>;
  },
) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const account = status.discord.account;

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setProblem(null);
    try {
      const init: RequestInit = { method: "POST" };
      if (body) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const response = await fetch(path, init);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? tr("Discord settings did not update."));
      await onChanged();
      return json;
    } catch (error) {
      setProblem((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const body = await post("/api/discord/connect");
    if (body?.url) await openLink(body.url);
  }

  return (
    <>
      <SettingsGroup title={tr("Account")}>
        <div className="settings-row">
          <span className="settings-label">
            {account ? account.globalName ?? account.username : tr("Discord account")}
            <small className="settings-hint">
              {account
                ? tr("Connected. Scopes: {scopes}.", { scopes: account.scopes.join(", ") || tr("none") })
                : tr("Sign in with Discord: your identity for social features as they land. No password is shared.")}
            </small>
          </span>
          {account
            ? (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void post("/api/discord/disconnect")}
              >
                {tr("Disconnect")}
              </button>
            )
            : (
              <button type="button" className="ghost compact" disabled={busy} onClick={() => void connect()}>
                {tr("Connect Discord")}
              </button>
            )}
        </div>
      </SettingsGroup>
      <SettingsGroup title={tr("Activity")}>
        <ToggleRow
          label={tr("Show launched games")}
          hint={tr(
            "Show what you're playing in Discord (title, core, time played). Needs Exordium open while you play.",
          )}
          checked={status.discord.gameActivity}
          disabled={busy}
          onChange={(value) => void post("/api/discord", { gameActivity: value })}
        />
        <ToggleRow
          label={tr("Show Exordium idle status")}
          hint={tr(
            "Shows “Choosing a mod · in Exordium” while Exordium is open and nothing runs. Separate from games.",
          )}
          checked={status.discord.enabled}
          disabled={busy}
          onChange={(value) => void post("/api/discord", { enabled: value })}
        />
      </SettingsGroup>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}
