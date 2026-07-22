import { useState } from "react";
import type { DashboardData } from "../../../electron/types";

export default function DriveSetupPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
}) {
  const [remote, setRemote] = useState(
    data.drive.config.remote ?? data.drive.rclone?.remotes?.[0] ?? "",
  );
  const [destination, setDestination] = useState(data.drive.config.destination ?? "");

  return (
    <>
      <section className="panel intro">
        <div>
          <h2>Managed rclone</h2>
          <p>
            Validates rclone and lists remote names without displaying its configuration or tokens.
          </p>
        </div>
        <button disabled={busy} onClick={() => act("rclone", () => window.lifeboat.detectRclone())}>
          {data.drive.rclone ? "Re-detect" : "Detect rclone"}
        </button>
      </section>
      <section className="panel form">
        <label>
          Source remote
          <select
            value={remote}
            onChange={(event) => {
              const value = event.target.value;
              setRemote(value);
              act("remote", () => window.lifeboat.setDriveRemote(value));
            }}
          >
            <option value="">Select…</option>
            {data.drive.rclone?.remotes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Local, drive-letter or UNC destination
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="Z:\\Cornerstone Account Backup"
          />
        </label>
        <div className="actions">
          <button
            className="secondary"
            onClick={() => act("pick", () => window.lifeboat.pickDriveDestination())}
          >
            Browse
          </button>
          <button
            disabled={!destination || busy}
            onClick={() => act("test", () => window.lifeboat.testDriveDestination(destination))}
          >
            Test write access
          </button>
        </div>
        {data.drive.config.destination && (
          <p className="success">
            Reachable: {data.drive.config.destination} ·{" "}
            {data.drive.config.freeBytes
              ? `${(data.drive.config.freeBytes / 1024 ** 3).toFixed(1)} GB`
              : "—"}{" "}
            free
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Export policy</h3>
        <p>
          Docs → DOCX · Sheets → XLSX · Slides → PPTX · Drawings → PDF. Revisions, comments,
          permissions, Apps Script bindings and unsupported native features are not preserved.
        </p>
      </section>
    </>
  );
}
