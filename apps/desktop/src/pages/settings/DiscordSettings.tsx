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
      if (!response.ok) throw new Error(json.error ?? "Discord settings did not update.");
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
      <SettingsGroup title="Account">
        <div className="settings-row">
          <span className="settings-label">
            {account ? account.globalName ?? account.username : "Discord account"}
            <small className="settings-hint">
              {account
                ? `Connected. Scopes: ${account.scopes.join(", ") || "none"}.`
                : "Sign in with Discord: your identity for social features as they land. No password is shared."}
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
                Disconnect
              </button>
            )
            : (
              <button type="button" className="ghost compact" disabled={busy} onClick={() => void connect()}>
                Connect Discord
              </button>
            )}
        </div>
      </SettingsGroup>
      <SettingsGroup title="Activity">
        <ToggleRow
          label="Show launched games"
          hint="Show what you're playing in Discord (title, core, time played). Needs Exordium open while you play."
          checked={status.discord.gameActivity}
          disabled={busy}
          onChange={(value) => void post("/api/discord", { gameActivity: value })}
        />
        <ToggleRow
          label="Show Exordium idle status"
          hint="Shows &quot;Choosing a mod · in Exordium&quot; while Exordium is open and nothing runs. Separate from games."
          checked={status.discord.enabled}
          disabled={busy}
          onChange={(value) => void post("/api/discord", { enabled: value })}
        />
      </SettingsGroup>
      {problem && <p className="error">{problem}</p>}
    </>
  );
}
