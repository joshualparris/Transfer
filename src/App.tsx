import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "../electron/types";
const nav = [
  "Overview",
  "Accounts",
  "Inventory",
  "Drive setup",
  "Backup",
  "Shared items",
  "Verification",
  "Gmail migration",
  "Security",
  "Final report",
];
const fmt = (n = 0) => new Intl.NumberFormat().format(n);
const bytes = (n = 0) => (n ? `${(n / 1024 ** 3).toFixed(1)} GB` : "—");
export default function App() {
  const [data, setData] = useState<DashboardData | null>(null),
    [active, setActive] = useState("Overview"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const load = () => window.lifeboat.dashboard().then(setData);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const offDrive = window.lifeboat.onDriveProgress(() => load());
    const offGmail = window.lifeboat.onGmailProgress(() => load());
    const offInventory = window.lifeboat.onInventoryProgress(() => load());
    return () => { offDrive(); offGmail(); offInventory(); };
  }, []);
  const act = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setError("");
    try {
      const r = await fn();
      if (r?.settings) setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  const days = useMemo(
    () =>
      data
        ? Math.ceil(
            (new Date(data.settings.deadline).getTime() - Date.now()) / 864e5,
          )
        : 0,
    [data],
  );
  if (!data) return <div className="splash">Preparing the lifeboat…</div>;
  const inv = data.latestInventory,
    source = data.accounts.find((a) => a.role === "source"),
    dest = data.accounts.find((a) => a.role === "destination");
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span>CL</span>
          <div>
            <b>Cornerstone</b>
            <small>Lifeboat</small>
          </div>
        </div>
        <nav>
          {nav.map((x) => (
            <button
              className={active === x ? "on" : ""}
              onClick={() => setActive(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </nav>
        <div className="safety">
          <b>Source-safe</b>
          <small>
            rclone copy only
            <br />
            No deletion operations
          </small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">MIGRATION COCKPIT</p>
            <h1>{active}</h1>
          </div>
          <div className={"deadline " + (days < 7 ? "urgent" : "")}>
            <small>ACCESS WINDOW</small>
            <b>{days > 0 ? `${days} days remaining` : "Deadline passed"}</b>
          </div>
        </header>
        {error && (
          <div className="error">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {active === "Overview" && (
          <Overview
            data={data}
            source={!!source}
            dest={!!dest}
            busy={busy}
            act={act}
          />
        )}{" "}
        {active === "Accounts" && (
          <Accounts data={data} busy={busy} act={act} />
        )}{" "}
        {active === "Inventory" && (
          <Inventory data={data} inv={inv} busy={busy} source={!!source} act={act} />
        )}{" "}
        {active === "Drive setup" && (
          <DriveSetup data={data} busy={busy} act={act} />
        )}{" "}
        {active === "Backup" && <Backup data={data} busy={busy} act={act} />}{" "}
        {active === "Shared items" && <Shared />}{" "}
        {active === "Verification" && (
          <Verification data={data} busy={busy} act={act} />
        )}{" "}
        {active === "Gmail migration" && (
          <GmailMigration data={data} busy={busy} act={act} />
        )}{" "}
        {active === "Security" && (
          <Security data={data} busy={busy} act={act} />
        )}{" "}
        {active === "Final report" && (
          <section className="panel intro">
            <div>
              <h2>Evidence bundle</h2>
              <p>
                Exports source inventory, Drive manifest, shared audit and
                verification evidence. “Safe” requires completed verification
                and reviewed limitations.
              </p>
            </div>
            <button
              onClick={() =>
                act("export", () => window.lifeboat.exportReports())
              }
            >
              Export evidence
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
function Overview({
  data,
  source,
  dest,
  busy,
  act,
}: {
  data: DashboardData;
  source: boolean;
  dest: boolean;
  busy: string;
  act: any;
}) {
  const inv = data.latestInventory;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">PRIMARY ROUTE</p>
          <h2>{data.settings.sourceEmail}</h2>
          <div className="route">
            <span>Workspace Drive</span>
            <i>→</i>
            <span>Local / NAS</span>
          </div>
          <p>Inventory, copy without deletion, then independently verify.</p>
        </div>
        <button
          disabled={!!busy || !source}
          onClick={() => act("inventory", () => window.lifeboat.runInventory())}
        >
          {busy ? "Working…" : "Run inventory"}
        </button>
      </section>
      <div className="metrics">
        <Metric
          label="Drive items"
          value={inv ? fmt(inv.drive.files) : "Not scanned"}
        />
        <Metric
          label="Manifest items"
          value={fmt(data.drive.stats.discovered)}
        />
        <Metric label="Externally owned" value={fmt(data.drive.stats.shared)} />
        <Metric
          label="Latest backup"
          value={data.drive.jobs[0]?.status ?? "Not started"}
        />
      </div>
      <section className="panel">
        <Check
          done={source}
          title="Source identity verified"
          note={
            data.accounts.find((a) => a.role === "source")?.email ??
            "Not connected"
          }
        />
        <Check
          done={dest}
          title="Personal identity verified"
          note={
            data.accounts.find((a) => a.role === "destination")?.email ??
            "Not connected"
          }
        />
        <Check
          done={!!data.drive.rclone}
          title="rclone validated"
          note={data.drive.rclone?.version ?? "Not detected"}
        />
        <Check
          done={!!data.drive.config.destination}
          title="Backup storage tested"
          note={data.drive.config.destination ?? "Not selected"}
        />
      </section>
    </>
  );
}
function Accounts({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: string;
  act: any;
}) {
  return (
    <>
      <section className="panel intro">
        <div>
          <h2>Two separate Google identities</h2>
          <p>
            OAuth tokens live only in the operating-system credential store.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => act("client", () => window.lifeboat.pickClient())}
        >
          Select client_secret.json
        </button>
      </section>
      <div className="accountgrid">
        {(["source", "destination"] as const).map((role) => {
          const a = data.accounts.find((x) => x.role === role);
          return (
            <section className="panel account" key={role}>
              <p className="eyebrow">{role}</p>
              <h3>{a?.email ?? "Not connected"}</h3>
              {a ? (
                <button
                  className="danger"
                  onClick={() =>
                    act(role, () => window.lifeboat.disconnect(role))
                  }
                >
                  Revoke & remove
                </button>
              ) : (
                <button
                  disabled={!!busy}
                  onClick={() => act(role, () => window.lifeboat.connect(role))}
                >
                  Connect {role}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
function Inventory({
  data,
  inv,
  busy,
  source,
  act,
}: {
  data: DashboardData;
  inv: DashboardData["latestInventory"];
  busy: string;
  source: boolean;
  act: any;
}) {
  return (
    <>
      <section className="panel intro">
        <div>
          <h2>Read-only source census</h2>
          <p>Phase 2 expands Drive metadata into a paged local manifest.</p>
        </div>
        <div className="actions">
          <button
            disabled={!source || !!busy}
            onClick={() =>
              act("inventory", () => window.lifeboat.runInventory())
            }
          >
            Account inventory
          </button>
          <button
            disabled={!source || !!busy}
            onClick={() =>
              act("drive-discover", () => window.lifeboat.discoverDrive())
            }
          >
            Build Drive manifest
          </button>
        </div>
      </section>
      {(data.inventory.running||data.inventory.logs.length>0)&&<section className="panel"><h2>{data.inventory.running?'Inventory running':'Inventory activity'}</h2><p>{data.inventory.progress?.message??'Preparing'} {data.inventory.progress?.counts?`— ${Object.entries(data.inventory.progress.counts).map(([k,v])=>`${k}: ${fmt(Number(v))}`).join(' · ')}`:''}</p><pre className="activitylog">{data.inventory.logs.map(x=>`${new Date(x.at).toLocaleTimeString()}  ${x.error?'ERROR':'INFO '}  [${x.module}] ${x.message}${x.counts?' — '+Object.entries(x.counts).map(([k,v])=>`${k}=${v}`).join(', '):''}`).join('\n')}</pre><p className="muted">Sensitive content and OAuth credentials are deliberately excluded from logs.</p></section>}
      {inv && (
        <div className="inventorygrid">
          <Module
            title="Drive"
            main={`${fmt(inv.drive.files)} items`}
            lines={[
              `${fmt(inv.drive.folders)} folders`,
              `${fmt(inv.drive.googleNative)} native`,
              bytes(inv.drive.bytes),
            ]}
          />
          <Module
            title="Manifest"
            main="Persistent and resumable"
            lines={[
              "Paths and checksums recorded",
              "Shared ownership audited",
              "Native export selected",
            ]}
          />
        </div>
      )}
    </>
  );
}
function DriveSetup({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: string;
  act: any;
}) {
  const [r, setR] = useState(
      data.drive.config.remote ?? data.drive.rclone?.remotes?.[0] ?? "",
    ),
    [p, setP] = useState(data.drive.config.destination ?? "");
  return (
    <>
      <section className="panel intro">
        <div>
          <h2>Managed rclone</h2>
          <p>
            Validates rclone and lists remote names without displaying its
            configuration or tokens.
          </p>
        </div>
        <button
          disabled={!!busy}
          onClick={() => act("rclone", () => window.lifeboat.detectRclone())}
        >
          {data.drive.rclone ? "Re-detect" : "Detect rclone"}
        </button>
      </section>
      <section className="panel form">
        <label>
          Source remote
          <select
            value={r}
            onChange={(e) => {
              setR(e.target.value);
              act("remote", () =>
                window.lifeboat.setDriveRemote(e.target.value),
              );
            }}
          >
            <option value="">Select…</option>
            {data.drive.rclone?.remotes.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Local, drive-letter or UNC destination
          <input
            value={p}
            onChange={(e) => setP(e.target.value)}
            placeholder="Z:\Cornerstone Account Backup"
          />
        </label>
        <div className="actions">
          <button
            className="secondary"
            onClick={() =>
              act("pick", () => window.lifeboat.pickDriveDestination())
            }
          >
            Browse
          </button>
          <button
            disabled={!p || !!busy}
            onClick={() =>
              act("test", () => window.lifeboat.testDriveDestination(p))
            }
          >
            Test write access
          </button>
        </div>
        {data.drive.config.destination && (
          <p className="success">
            Reachable: {data.drive.config.destination} ·{" "}
            {bytes(data.drive.config.freeBytes)} free
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Export policy</h3>
        <p>
          Docs → DOCX · Sheets → XLSX · Slides → PPTX · Drawings → PDF.
          Revisions, comments, permissions, Apps Script bindings and unsupported
          native features are not preserved.
        </p>
      </section>
    </>
  );
}
function Backup({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: string;
  act: any;
}) {
  const remote = data.drive.config.remote ?? "",
    destination = data.drive.config.destination ?? "",
    p = data.drive.progress;
  return (
    <>
      <div className="metrics">
        <Metric label="Discovered" value={fmt(data.drive.stats.discovered)} />
        <Metric label="Transferred" value={fmt(p.files ?? 0)} />
        <Metric label="Bytes" value={bytes(p.bytes ?? 0)} />
        <Metric
          label="Speed / ETA"
          value={`${p.speed ?? "—"} / ${p.eta ?? "—"}`}
        />
      </div>
      <section className="panel">
        <div className="paneltitle">
          <div>
            <p className="eyebrow">CURRENT OPERATION</p>
            <h3>{p.current ?? p.operation ?? "Idle"}</h3>
          </div>
          <span>{data.drive.running ? "Running" : "Stopped"}</span>
        </div>
        {data.drive.running ? (
          <button
            className="danger"
            onClick={() => act("pause", () => window.lifeboat.pauseDrive())}
          >
            Pause safely
          </button>
        ) : (
          <button
            disabled={!remote || !destination || !!busy}
            onClick={() =>
              act("start", () =>
                window.lifeboat.startDrive({ remote, destination }),
              )
            }
          >
            Start / resume backup
          </button>
        )}
      </section>
      <JobHistory jobs={data.drive.jobs} />
    </>
  );
}
function Verification({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: string;
  act: any;
}) {
  const remote = data.drive.config.remote ?? "",
    destination = data.drive.config.destination ?? "",
    job = data.drive.jobs.find((j) => j.type === "drive_backup_verify");
  return (
    <section className="panel intro">
      <div>
        <h2>{job?.status ?? "Not verified"}</h2>
        <p>
          Runs a non-destructive downloaded-content comparison. Google-native
          exports are reported as converted because source checksums cannot
          match Office/PDF output.
        </p>
        {job?.verification && (
          <pre>{JSON.stringify(job.verification, null, 2)}</pre>
        )}
      </div>
      <button
        disabled={!remote || !destination || data.drive.running || !!busy}
        onClick={() =>
          act("verify", () =>
            window.lifeboat.verifyDrive({ remote, destination }),
          )
        }
      >
        Run verification
      </button>
    </section>
  );
}
function Shared() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    window.lifeboat.drivePage(0, 100, true).then(setRows);
  }, []);
  return (
    <section className="panel">
      <h2>Shared-with-me audit</h2>
      <p>
        Read-only audit. Permission changes remain unavailable in this phase.
      </p>
      <div className="table">
        <div className="tr head">
          <span>Name</span>
          <span>Owner</span>
          <span>Classification</span>
        </div>
        {rows.map((r) => (
          <div className="tr" key={r.sourceId}>
            <span>{r.name}</span>
            <span>{r.owner}</span>
            <span>{r.classification}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
function JobHistory({ jobs }: { jobs: any[] }) {
  return (
    <section className="panel">
      <h3>Job history</h3>
      {jobs.length ? (
        jobs.map((j) => (
          <div className="job" key={j.id}>
            <b>{j.type.replaceAll("_", " ")}</b>
            <span>{j.status}</span>
            <small>{j.started_at}</small>
          </div>
        ))
      ) : (
        <p>No jobs yet.</p>
      )}
    </section>
  );
}
function GmailMigration({data,busy,act}:{data:DashboardData;busy:string;act:any}){
  const [cfg,setCfg]=useState(data.gmail.config),[audit,setAudit]=useState<any>(null),[vacSubject,setVacSubject]=useState("My email address has changed"),[vacBody,setVacBody]=useState("Thanks for your message. Please update your records and contact me at {destination}.");
  const stats=data.gmail.stats,p=data.gmail.progress,source=data.accounts.find(a=>a.role==="source"),destination=data.accounts.find(a=>a.role==="destination");
  const copyGranted=destination?.scopes.includes("https://www.googleapis.com/auth/gmail.insert")&&destination.scopes.includes("https://www.googleapis.com/auth/gmail.labels");
  const settingsGranted=source?.scopes.includes("https://www.googleapis.com/auth/gmail.settings.basic");
  return <>
    <section className="panel"><div className="paneltitle"><div><p className="eyebrow">GMAIL IDENTITIES</p><h2>{source?.email??"Source not connected"} → {destination?.email??"Destination not connected"}</h2></div><span>{data.gmail.running?"Running":"Resumable"}</span></div><p>Source access is read-only. Destination insertion never sends messages. Stable Google account IDs must differ.</p><div className="actions"><button disabled={!!busy||!!copyGranted} onClick={()=>act("gmail-auth",()=>window.lifeboat.authorizeGmail("copy"))}>{copyGranted?"Copy access authorised":"Authorise destination copy + drafts"}</button><button className="secondary" disabled={!!busy||!!settingsGranted} onClick={()=>act("settings-auth",()=>window.lifeboat.authorizeGmail("settings"))}>{settingsGranted?"Settings access authorised":"Authorise source vacation settings"}</button></div></section>
    <div className="metrics"><Metric label="Discovered" value={fmt(stats.discovered)}/><Metric label="Copied" value={fmt(stats.copied)}/><Metric label="Verified" value={fmt(stats.verified)}/><Metric label="Failed" value={fmt(stats.failed)}/></div>
    <section className="panel form"><label>Mailbox query<input value={cfg.query} onChange={e=>setCfg({...cfg,query:e.target.value})}/></label><label>Migration method<select value={cfg.method} onChange={e=>setCfg({...cfg,method:e.target.value})}><option value="insert">Insert — recommended</option><option value="import">Import — delivery scanning</option></select></label><label className="checkline"><input type="checkbox" checked={cfg.includeDrafts} onChange={e=>setCfg({...cfg,includeDrafts:e.target.checked})}/> Include drafts</label><p className="warning">Cornerstone Lifeboat never sends migrated drafts.</p><label>Optional protected raw archive<input readOnly value={cfg.archivePath??""} placeholder="Not enabled"/></label><div className="actions"><button className="secondary" onClick={()=>act("archive",()=>window.lifeboat.pickGmailArchive())}>Choose archive folder</button><button disabled={!!busy||data.gmail.running} onClick={()=>act("discover-mail",()=>window.lifeboat.discoverGmail(cfg))}>Dry-run discovery</button>{data.gmail.running?<button className="danger" onClick={()=>act("pause-mail",()=>window.lifeboat.pauseGmail())}>Pause after current message</button>:<button disabled={!!busy||!copyGranted} onClick={()=>act("start-mail",()=>window.lifeboat.startGmail(cfg))}>Start confirmed migration</button>}</div><p>{p.operation??"Idle"} {p.processed?`· ${fmt(p.processed)} processed`:""}</p></section>
    <section className="panel"><h2>Forwarding and vacation responder</h2><p>Forwarding creation is administrator-dependent and cannot be performed by desktop OAuth. Lifeboat audits the current setting. Vacation response is a separate, confirmed source-account write enabled only after message verification.</p><div className="actions"><button className="secondary" disabled={!settingsGranted||!!busy} onClick={async()=>{setAudit(await window.lifeboat.forwardingAudit())}}>Audit forwarding</button></div>{audit&&<pre>{JSON.stringify(audit,null,2)}</pre>}<div className="form"><label>Auto-reply subject<input value={vacSubject} onChange={e=>setVacSubject(e.target.value)}/></label><label>Auto-reply message<textarea value={vacBody} onChange={e=>setVacBody(e.target.value)}/></label><button disabled={!settingsGranted||!stats.verified||!!busy} onClick={()=>act("vacation",()=>window.lifeboat.updateVacation({subject:vacSubject,body:vacBody}))}>Review and enable vacation responder</button></div></section>
    <JobHistory jobs={data.gmail.runs}/>
  </>
}
function Security({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: string;
  act: any;
}) {
  return (
    <section className="panel">
      <h2>Credentials and safeguards</h2>
      <p>
        OAuth tokens stay in the OS vault. rclone is invoked without a shell;
        its config is never copied.
      </p>
      {data.accounts.map((a) => (
        <div className="securityrow" key={a.role}>
          <div>
            <b>{a.email}</b>
            <small>
              {a.role} · {a.connectedAt}
            </small>
          </div>
          <button
            className="danger"
            disabled={!!busy}
            onClick={() =>
              act(a.role, () => window.lifeboat.disconnect(a.role))
            }
          >
            Revoke & remove
          </button>
        </div>
      ))}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
function Check({
  done,
  title,
  note,
}: {
  done: boolean;
  title: string;
  note: string;
}) {
  return (
    <div className="check">
      <i className={done ? "done" : ""}>{done ? "✓" : "·"}</i>
      <div>
        <b>{title}</b>
        <small>{note}</small>
      </div>
    </div>
  );
}
function Module({
  title,
  main,
  lines,
}: {
  title: string;
  main: string;
  lines: string[];
}) {
  return (
    <section className="panel module">
      <p className="eyebrow">{title}</p>
      <h3>{main}</h3>
      {lines.map((x) => (
        <small key={x}>{x}</small>
      ))}
    </section>
  );
}
