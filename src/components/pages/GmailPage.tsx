import { useState } from "react";
import type { DashboardData } from "../../../electron/types";
import JobHistory from "../JobHistory";
import type { GmailConfig } from "../../ipc";

export default function GmailPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
}) {
  const [config, setConfig] = useState<GmailConfig>(data.gmail.config);
  const [audit, setAudit] = useState<any>(null);
  const [vacSubject, setVacSubject] = useState("My email address has changed");
  const [vacBody, setVacBody] = useState(
    "Thanks for your message. Please update your records and contact me at {destination}.",
  );

  const source = data.accounts.find((a) => a.role === "source");
  const destination = data.accounts.find((a) => a.role === "destination");

  const copyGranted =
    destination?.scopes.includes("https://www.googleapis.com/auth/gmail.insert") &&
    destination?.scopes.includes("https://www.googleapis.com/auth/gmail.labels");
  const settingsGranted = source?.scopes.includes(
    "https://www.googleapis.com/auth/gmail.settings.basic",
  );

  return (
    <>
      <section className="panel">
        <div className="paneltitle">
          <div>
            <p className="eyebrow">GMAIL IDENTITIES</p>
            <h2>
              {source?.email ?? "Source not connected"} →{" "}
              {destination?.email ?? "Destination not connected"}
            </h2>
          </div>
          <span>{data.gmail.running ? "Running" : "Resumable"}</span>
        </div>
        <p>
          Source access is read-only. Destination insertion never sends messages. Stable Google
          account IDs must differ.
        </p>
        <div className="actions">
          <button
            disabled={busy}
            onClick={() => act("gmail-auth", () => window.lifeboat.authorizeGmail("copy"))}
          >
            {copyGranted
              ? "Re-authorise destination copy + drafts"
              : "Authorise destination copy + drafts"}
          </button>
          <button
            className="secondary"
            disabled={busy || settingsGranted}
            onClick={() => act("settings-auth", () => window.lifeboat.authorizeGmail("settings"))}
          >
            {settingsGranted ? "Settings access authorised" : "Authorise source vacation settings"}
          </button>
        </div>
      </section>
      <div className="metrics">
        <div className="metric">
          <small>Discovered</small>
          <b>{new Intl.NumberFormat().format(data.gmail.stats.discovered)}</b>
        </div>
        <div className="metric">
          <small>Copied</small>
          <b>{new Intl.NumberFormat().format(data.gmail.stats.copied)}</b>
        </div>
        <div className="metric">
          <small>Verified</small>
          <b>{new Intl.NumberFormat().format(data.gmail.stats.verified)}</b>
        </div>
        <div className="metric">
          <small>Failed</small>
          <b>{new Intl.NumberFormat().format(data.gmail.stats.failed)}</b>
        </div>
      </div>
      <section className="panel form">
        <label>
          Mailbox query
          <input
            value={config.query}
            onChange={(event) => setConfig({ ...config, query: event.target.value })}
          />
        </label>
        <label>
          Migration method
          <select
            value={config.method}
            onChange={(event) =>
              setConfig({
                ...config,
                method: event.target.value as GmailConfig["method"],
              })
            }
          >
            <option value="insert">Insert — recommended</option>
            <option value="import">Import — delivery scanning</option>
          </select>
        </label>
        <label className="checkline">
          <input
            type="checkbox"
            checked={config.includeDrafts}
            onChange={(event) => setConfig({ ...config, includeDrafts: event.target.checked })}
          />
          Include drafts
        </label>
        <p className="warning">Cornerstone Lifeboat never sends migrated drafts.</p>
        <label>
          Optional protected raw archive
          <input readOnly value={config.archivePath ?? ""} placeholder="Not enabled" />
        </label>
        <div className="actions">
          <button
            className="secondary"
            onClick={() => act("archive", () => window.lifeboat.pickGmailArchive())}
          >
            Choose archive folder
          </button>
          <button
            disabled={busy || data.gmail.running}
            onClick={() => act("discover-mail", () => window.lifeboat.discoverGmail(config))}
          >
            Dry-run discovery
          </button>
          {data.gmail.running ? (
            <button
              className="danger"
              onClick={() => act("pause-mail", () => window.lifeboat.pauseGmail())}
            >
              Pause after current message
            </button>
          ) : (
            <button
              disabled={busy || !copyGranted}
              onClick={() => act("start-mail", () => window.lifeboat.startGmail(config))}
            >
              Start confirmed migration
            </button>
          )}
        </div>
        <p>
          {data.gmail.progress.operation ?? "Idle"}{" "}
          {data.gmail.progress.processed
            ? `· ${new Intl.NumberFormat().format(data.gmail.progress.processed)} processed`
            : ""}
        </p>
      </section>
      <section className="panel">
        <h2>Forwarding and vacation responder</h2>
        <p>
          Forwarding creation is administrator-dependent and cannot be performed by desktop OAuth.
          Lifeboat audits the current setting. Vacation response is a separate, confirmed
          source-account write enabled only after message verification.
        </p>
        <div className="actions">
          <button
            className="secondary"
            disabled={!settingsGranted || busy}
            onClick={async () => setAudit(await window.lifeboat.forwardingAudit())}
          >
            Audit forwarding
          </button>
        </div>
        {audit && <pre>{JSON.stringify(audit, null, 2)}</pre>}
        <div className="form">
          <label>
            Auto-reply subject
            <input value={vacSubject} onChange={(event) => setVacSubject(event.target.value)} />
          </label>
          <label>
            Auto-reply message
            <textarea value={vacBody} onChange={(event) => setVacBody(event.target.value)} />
          </label>
          <button
            disabled={!settingsGranted || !data.gmail.stats.verified || busy}
            onClick={() =>
              act("vacation", () =>
                window.lifeboat.updateVacation({
                  subject: vacSubject,
                  body: vacBody,
                }),
              )
            }
          >
            Review and enable vacation responder
          </button>
        </div>
      </section>
      <JobHistory jobs={data.gmail.runs} />
    </>
  );
}
