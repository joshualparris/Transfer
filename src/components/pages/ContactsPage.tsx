import { useState } from "react";
import type { DashboardData } from "../../../electron/types";
type Act = (label: string, fn: () => Promise<any>) => Promise<any>;
const n = (v: unknown) => Number(v ?? 0).toLocaleString();
export default function ContactsPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: Act;
}) {
  const [cfg, setCfg] = useState(data.contacts.config),
    source = data.accounts.find((a) => a.role === "source"),
    dest = data.accounts.find((a) => a.role === "destination"),
    granted = dest?.scopes.includes("https://www.googleapis.com/auth/contacts"),
    s = data.contacts.stats,
    p = data.contacts.progress;
  return (
    <>
      <section className="panel">
        <div className="paneltitle">
          <div>
            <p className="eyebrow">PHASE 4 · CONTACTS</p>
            <h2>
              {source?.email ?? "Source"} → {dest?.email ?? "Destination"}
            </h2>
          </div>
          <span>{data.contacts.running ? "Running" : "Resumable"}</span>
        </div>
        <p>
          Source permissions are read-only. Destination access creates contacts and user groups;
          Lifeboat contains no contact deletion or automatic merge operation.
        </p>
        <button
          disabled={busy || granted}
          onClick={() => act("contacts-auth", () => window.lifeboat.authorizeContacts())}
        >
          {granted ? "Destination Contacts authorised" : "Authorise destination Contacts"}
        </button>
      </section>
      <div className="metrics">
        <div className="metric">
          <small>Discovered</small>
          <b>{n(s.discovered)}</b>
        </div>
        <div className="metric">
          <small>Copied</small>
          <b>{n(s.copied)}</b>
        </div>
        <div className="metric">
          <small>Verified</small>
          <b>{n(s.verified)}</b>
        </div>
        <div className="metric">
          <small>Review / failed</small>
          <b>{n((s.ambiguous ?? 0) + (s.failed ?? 0))}</b>
        </div>
      </div>
      <section className="panel form">
        <label>
          Other Contacts policy
          <select value={cfg.otherPolicy} onChange={(e) => setCfg({ otherPolicy: e.target.value })}>
            <option value="archive">Archive only — recommended</option>
            <option value="ignore">Ignore</option>
            <option value="review">Review individually</option>
          </select>
        </label>
        <p>
          Other Contacts are automatically remembered people. They cannot be recreated as
          destination Other Contacts; conversion creates ordinary contacts through a separate
          confirmed action.
        </p>
        <div className="actions">
          <button
            disabled={busy || data.contacts.running}
            onClick={() => act("contacts-discover", () => window.lifeboat.discoverContacts(cfg))}
          >
            Dry-run Contacts inventory
          </button>
          <button
            disabled={busy || data.contacts.running || !granted || !s.discovered}
            onClick={() => act("contacts-start", () => window.lifeboat.startContacts())}
          >
            Start confirmed Contacts migration
          </button>
          <button
            className="secondary"
            disabled={busy || !granted}
            onClick={() =>
              act("contacts-convert-other", () => window.lifeboat.convertOtherContacts())
            }
          >
            Review and convert archived Other Contacts
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => act("contacts-export", () => window.lifeboat.exportContacts())}
          >
            Export CSV + vCard + manifest
          </button>
        </div>
        <p>
          {p.operation ?? "Idle"} {p.processed ? `· ${n(p.processed)} processed` : ""}
        </p>
      </section>
      <section className="panel">
        <h3>Verification and fidelity</h3>
        <p>
          Contacts are verified using privacy-keyed semantic fingerprints across names, email
          addresses, phone numbers, organisations and birthdays. Potential or ambiguous duplicates
          are never merged automatically. Photos and unsupported/read-only profile metadata are
          reported separately.
        </p>
        <button
          disabled={busy || !s.copied}
          onClick={() =>
            act("contacts-destination-verify", () =>
              window.lifeboat.verifyContactsDestinationOnly(),
            )
          }
        >
          Run destination-only verification
        </button>
      </section>
    </>
  );
}
