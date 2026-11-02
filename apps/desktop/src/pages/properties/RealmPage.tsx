import { formatDateTime, tr } from "../../lib/i18n.ts";
import * as React from "react";
import { ManifestFooter } from "./ManifestFooter.tsx";
import type { ManifestEditor } from "./useManifest.ts";

interface RealmCheck {
  address: string;
  reachable: boolean;
  milliseconds: number | null;
  error: string | null;
  checkedAt: string;
}

/** One of the realm's fields, null when empty. */
function RealmField({ label, tip, value, placeholder, disabled, onChange }: {
  label: string;
  tip: string;
  value: string | null | undefined;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="field" data-tooltip={tip}>
      {label}
      <input
        type="text"
        value={value ?? ""}
        disabled={disabled}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.currentTarget.value || null)}
      />
    </label>
  );
}

/**
 * The mod's own server: its settings on the left, and on the right whether it answers. The check uses
 * what the form says now, so an address can be tried before it is applied. It runs when asked: it
 * opens a connection to an address the mod chose.
 */
export function RealmPage({ editor }: { editor: ManifestEditor }) {
  const realm = editor.manifest!.realm ?? {};
  const [check, setCheck] = React.useState<RealmCheck | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const busy = editor.saving;
  const set = (next: NonNullable<typeof realm>) => {
    editor.section("realm", next);
    setCheck(null);
    setProblem(null);
  };

  async function runCheck() {
    setChecking(true);
    setProblem(null);
    try {
      const query = new URLSearchParams({ gateway: realm.gateway ?? "", port: realm.port ?? "" });
      const response = await fetch(`/api/realm-check?${query}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? tr("Could not check the realm."));
      setCheck(body);
    } catch (error) {
      setCheck(null);
      setProblem((error as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const status = !realm.gateway
    ? tr("No gateway set")
    : checking
    ? tr("Checking…")
    : !check
    ? tr("Not checked")
    : check.reachable
    ? tr("Reachable")
    : tr("Not reachable");

  return (
    <div className="page-with-footer">
      <div className="stack">
        <div className="realm-page">
          <section className="option-section">
            <h2 className="eyebrow">{tr("REALM")}</h2>
            <RealmField
              label={tr("Gateway")}
              tip={tr("The server's address. Setting one keeps Battle.net open for this title.")}
              value={realm.gateway}
              placeholder="realm.example.com"
              disabled={busy}
              onChange={(gateway) => set({ gateway })}
            />
            <RealmField
              label={tr("Port")}
              tip={tr("The server's port. Left empty, 6112.")}
              value={realm.port}
              placeholder="6112"
              disabled={busy}
              onChange={(port) => set({ port })}
            />
            <RealmField
              label={tr("Name")}
              tip={tr("The realm's name.")}
              value={realm.gatewayName}
              disabled={busy}
              onChange={(gatewayName) => set({ gatewayName })}
            />
            <RealmField
              label={tr("Selected")}
              tip={tr("The gateway to select in the game's list.")}
              value={realm.selected}
              disabled={busy}
              onChange={(selected) => set({ selected })}
            />
            <RealmField
              label={tr("Timezone")}
              tip={tr("Hours from UTC.")}
              value={realm.timezone}
              placeholder="-5"
              disabled={busy}
              onChange={(timezone) => set({ timezone })}
            />
          </section>
          <section className="option-section">
            <h2 className="eyebrow">{tr("STATUS")}</h2>
            <p className={check ? (check.reachable ? "realm-status good" : "realm-status bad") : "realm-status"}>
              <span className="realm-dot" aria-hidden="true" />
              {status}
            </p>
            {problem && <p className="bad-text small">{problem}</p>}
            {check && (
              <dl className="kv wide">
                <dt>{tr("Address")}</dt>
                <dd>{check.address}</dd>
                <dt>{tr("Response")}</dt>
                <dd>{check.milliseconds === null ? "—" : tr("{ms} ms", { ms: check.milliseconds })}</dd>
                <dt>{tr("Checked")}</dt>
                <dd>{formatDateTime(check.checkedAt)}</dd>
              </dl>
            )}
            {check?.error && <p className="muted small">{check.error}</p>}
            <p className="muted small">
              {tr("This only shows whether the server answers on that port, not that you can log in.")}
            </p>
            <button
              type="button"
              className="ghost fit"
              disabled={!realm.gateway || checking}
              onClick={() => void runCheck()}
            >
              {checking ? tr("Checking…") : tr("Check now")}
            </button>
          </section>
        </div>
      </div>
      <ManifestFooter editor={editor} />
    </div>
  );
}
