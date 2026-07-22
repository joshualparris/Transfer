import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData } from "../../../electron/types";
const names: Record<string, string> = {
  inventory: "Inventory",
  drive: "Drive",
  rclone: "rclone",
  gmail: "Gmail",
  contacts: "Contacts",
  calendar: "Calendar",
  preservation: "Photos + Keep",
};
const describe = (p: any) => {
  if (!p) return "No active operation";
  const base = p.message ?? p.operation ?? p.current ?? "Working",
    details = Object.entries(p)
      .filter(
        ([k, v]) =>
          !["message", "operation", "current", "module", "at"].includes(k) &&
          ["string", "number", "boolean"].includes(typeof v),
      )
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  return details ? `${base} — ${details}` : base;
};
export default function ActivityPage({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState("all"),
    [follow, setFollow] = useState(true),
    [, setClock] = useState(0),
    box = useRef<HTMLDivElement>(null),
    logs = useMemo(
      () =>
        data.activity.logs.filter(
          (x) => filter === "all" || x.module === filter,
        ),
      [data.activity.logs, filter],
    ),
    reviews = data.activity.diagnostics.filter(
      (x) => x.code === "manual-action-required",
    ),
    failures = data.activity.diagnostics.filter(
      (x) => x.code !== "manual-action-required",
    );
  useEffect(() => {
    const timer = window.setInterval(() => setClock((x) => x + 1), 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [logs, follow]);
  return (
    <>
      <section className="panel activity-summary">
        <div className="paneltitle">
          <div>
            <p className="eyebrow">LIVE OPERATIONS</p>
            <h2>Everything running in one place</h2>
          </div>
          <span>
            {
              Object.values(data.activity.modules).filter((x) => x.running)
                .length
            }{" "}
            active
          </span>
        </div>
        <p>
          Progress is persisted locally and credentials are redacted. Yellow
          means no update has arrived for two minutes; it does not automatically
          mean failure.
        </p>
        <div className="activitycards">
          {Object.entries(data.activity.modules).map(([key, value]) => {
            const last = data.activity.logs.find(
                (x) =>
                  x.module === key ||
                  (key === "drive" && x.module === "rclone"),
              ),
              waiting =
                value.running &&
                !!last &&
                Date.now() - new Date(last.created_at).getTime() > 120000;
            return (
              <article
                key={key}
                className={`activitycard ${value.running ? "running" : ""} ${waiting ? "waiting" : ""}`}
              >
                <div>
                  <b>{names[key] ?? key}</b>
                  <span>
                    {waiting
                      ? "Waiting for update"
                      : value.running
                        ? "Running"
                        : "Idle"}
                  </span>
                </div>
                <p>{describe(value.progress)}</p>
                <small>
                  {last
                    ? `Last log ${new Date(last.created_at).toLocaleTimeString()}`
                    : "No logs yet"}
                </small>
              </article>
            );
          })}
        </div>
      </section>
      {reviews.length > 0 && (
        <section className="panel">
          <h3>Items waiting for your review — not errors</h3>
          <p>
            Lifeboat found possible duplicates or fidelity differences and
            deliberately stopped rather than guessing or overwriting anything.
          </p>
          <div className="diagnostics review">
            {reviews.map((x, i) => (
              <div key={`${x.module}-${x.code}-${i}`}>
                <b>{names[x.module] ?? x.module} · {x.count.toLocaleString()} to review</b>
                <span>{x.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {failures.length > 0 && (
        <section className="panel">
          <h3>Failures requiring attention</h3>
          <p>
            Grouped directly from the manifests so repeated failures have a
            concrete reason and count.
          </p>
          <div className="diagnostics">
            {failures.map((x, i) => (
              <div key={`${x.module}-${x.code}-${i}`}>
                <b>
                  {names[x.module] ?? x.module} · {x.count.toLocaleString()} ·{" "}
                  {x.code}
                </b>
                <span>{x.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="logtoolbar">
          <div>
            <h3>Detailed redacted logs</h3>
            <small>{logs.length.toLocaleString()} newest entries loaded</small>
          </div>
          <label>
            Section
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All sections</option>
              {Object.entries(names).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => setFollow((x) => !x)}>
            {follow ? "Auto-follow on" : "Auto-follow off"}
          </button>
        </div>
        <div
          ref={box}
          className="activitylog unified"
          onScroll={(e) => {
            const x = e.currentTarget;
            setFollow(x.scrollHeight - x.scrollTop - x.clientHeight < 24);
          }}
        >
          {[...logs].reverse().map((x, i) => (
            <div className={`logline ${x.level}`} key={`${x.created_at}-${i}`}>
              <time>{new Date(x.created_at).toLocaleTimeString()}</time>
              <b>[{names[x.module] ?? x.module}]</b>
              <span>{x.message}</span>
            </div>
          ))}
        </div>
        <p className="muted">
          This panel stays fixed-height. Scroll inside it for older entries;
          turn auto-follow on to return to the newest line.
        </p>
      </section>
    </>
  );
}
