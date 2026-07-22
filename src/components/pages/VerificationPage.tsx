import type { DashboardData } from "../../../electron/types";

export default function VerificationPage({
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
  const job = data.drive.jobs.find((item) => item.type === "drive_backup_verify");

  return (
    <section className="panel intro">
      <div>
        <h2>{job?.status ?? "Not verified"}</h2>
        <p>
          Runs a non-destructive downloaded-content comparison. Google-native exports are reported
          as converted because source checksums cannot match Office/PDF output.
        </p>
        {job?.verification && <pre>{JSON.stringify(job.verification, null, 2)}</pre>}
      </div>
      <button
        disabled={!remote || !destination || data.drive.running || busy}
        onClick={() => act("verify", () => window.lifeboat.verifyDrive({ remote, destination }))}
      >
        Run verification
      </button>
    </section>
  );
}
