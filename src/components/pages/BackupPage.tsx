import type { DashboardData } from "../../../electron/types";
import JobHistory from "../JobHistory";

export default function BackupPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
}) {
  const remote = data.drive.config.remote ?? "";
  const destination = data.drive.config.destination ?? "";
  const progress = data.drive.progress;

  return (
    <>
      <div className="metrics">
        <div className="metric">
          <small>Discovered</small>
          <b>{new Intl.NumberFormat().format(data.drive.stats.discovered)}</b>
        </div>
        <div className="metric">
          <small>Transferred</small>
          <b>{new Intl.NumberFormat().format(progress.files ?? 0)}</b>
        </div>
        <div className="metric">
          <small>Bytes</small>
          <b>{progress.bytes ? `${(progress.bytes / 1024 ** 3).toFixed(1)} GB` : "—"}</b>
        </div>
        <div className="metric">
          <small>Speed / ETA</small>
          <b>{`${progress.speed ?? "—"} / ${progress.eta ?? "—"}`}</b>
        </div>
      </div>
      <section className="panel">
        <div className="paneltitle">
          <div>
            <p className="eyebrow">CURRENT OPERATION</p>
            <h3>{progress.current ?? progress.operation ?? "Idle"}</h3>
          </div>
          <span>{data.drive.running ? "Running" : "Stopped"}</span>
        </div>
        {data.drive.running ? (
          <button className="danger" onClick={() => act("pause", () => window.lifeboat.pauseDrive())}>
            Pause safely
          </button>
        ) : (
          <button
            disabled={!remote || !destination || busy}
            onClick={() => act("start", () => window.lifeboat.startDrive({ remote, destination }))}
          >
            Start / resume backup
          </button>
        )}
      </section>
      <JobHistory jobs={data.drive.jobs} />
    </>
  );
}
