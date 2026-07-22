import { useEffect, useRef } from "react";
import type { DashboardData } from "../../../electron/types";
import Module from "../common/Module";

export default function InventoryPage({
  data,
  inv,
  busy,
  source,
  act,
}: {
  data: DashboardData;
  inv: DashboardData["latestInventory"];
  busy: boolean;
  source: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
}) {
  const logRef = useRef<HTMLPreElement>(null);
  const followLog = useRef(true);

  useEffect(() => {
    const el = logRef.current;
    if (el && followLog.current) el.scrollTop = el.scrollHeight;
  }, [data.inventory.logs.length]);

  return (
    <>
      <section className="panel intro">
        <div>
          <h2>Read-only source census</h2>
          <p>Phase 2 expands Drive metadata into a paged local manifest.</p>
        </div>
        <div className="actions">
          <button
            disabled={!source || busy}
            onClick={() => act("inventory", () => window.lifeboat.runInventory())}
          >
            Account inventory
          </button>
          {data.inventory.running && (
            <button
              className="danger"
              onClick={() => act("cancel-inventory", () => window.lifeboat.cancelInventory())}
            >
              Stop inventory
            </button>
          )}
          <button
            disabled={!source || busy}
            onClick={() => act("drive-discover", () => window.lifeboat.discoverDrive())}
          >
            Build Drive manifest
          </button>
        </div>
      </section>
      {(data.inventory.running || data.inventory.logs.length > 0) && (
        <section className="panel">
          <h2>{data.inventory.running ? "Inventory running" : "Inventory activity"}</h2>
          <p>
            {data.inventory.progress?.message ?? "Preparing"}{" "}
            {data.inventory.progress?.counts
              ? `— ${Object.entries(data.inventory.progress.counts)
                  .map(([key, value]) => `${key}: ${new Intl.NumberFormat().format(Number(value))}`)
                  .join(" · ")}`
              : ""}
          </p>
          <pre
            ref={logRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              followLog.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
            }}
            className="activitylog"
          >
            {data.inventory.logs
              .map(
                (entry) =>
                  `${new Date(entry.at).toLocaleTimeString()}  ${entry.error ? "ERROR" : "INFO "}  [${entry.module}] ${entry.message}${
                    entry.counts
                      ? " — " +
                        Object.entries(entry.counts)
                          .map(([key, value]) => `${key}=${value}`)
                          .join(", ")
                      : ""
                  }`,
              )
              .join("\n")}
          </pre>
          <p className="muted">
            Following newest entries automatically. Scroll up to pause following. Sensitive content
            and OAuth credentials are excluded.
          </p>
        </section>
      )}
      {inv && (
        <div className="inventorygrid">
          <section className="panel module">
            <p className="eyebrow">Drive</p>
            <h3>{new Intl.NumberFormat().format(inv.drive.files)} items</h3>
            <small>{new Intl.NumberFormat().format(inv.drive.folders)} folders</small>
            <small>{new Intl.NumberFormat().format(inv.drive.googleNative)} native</small>
            <small>
              {inv.drive.bytes ? `${(inv.drive.bytes / 1024 ** 3).toFixed(1)} GB` : "—"}
            </small>
          </section>
          <section className="panel module">
            <p className="eyebrow">Manifest</p>
            <h3>Persistent and resumable</h3>
            <small>Paths and checksums recorded</small>
            <small>Shared ownership audited</small>
            <small>Native export selected</small>
          </section>
        </div>
      )}
    </>
  );
}
