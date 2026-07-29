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
  const backupJob = data.drive.jobs.find((item) => item.type === "drive_backup_copy");
  const canVerify = !!remote && !!destination && !!backupJob && !data.drive.running && !busy;

  return (
    <section className="panel intro">
      <div>
        <h2>{job?.status ?? (backupJob ? "Not verified" : "Backup required")}</h2>
        <p>
          {backupJob
            ? "Runs a non-destructive downloaded-content comparison. Google-native exports are reported as converted because source checksums cannot match Office/PDF output."
            : "Start the Drive backup first. Verification uses the source remote locked during backup confirmation so it cannot accidentally compare the wrong Google account."}
        </p>
        {job?.verification && <pre>{JSON.stringify(job.verification, null, 2)}</pre>}
      </div>
      <button
        disabled={!canVerify}
        onClick={() => act("verify", () => window.lifeboat.verifyDrive({ remote, destination }))}
      >
        Run verification
      </button>
    </section>
  );
}
