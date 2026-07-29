import type { DashboardData } from "../../../electron/types";
import type { ActionState } from "../../hooks/useActionManager";
import Metric from "../common/Metric";
import Check from "../common/Check";

export default function OverviewPage({
  data,
  source,
  dest,
  busy,
  act,
  actionState,
  goTo,
}: {
  data: DashboardData;
  source: boolean;
  dest: boolean;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
  actionState: Record<string, ActionState>;
  goTo: (page: string) => void;
}) {
  const inv = data.latestInventory;
  const inventoryStatus = data.inventory.progress;
  const inventoryRunning = data.inventory.running || actionState.inventory?.status === "running";
  const counts = inventoryStatus?.counts
    ? Object.entries(inventoryStatus.counts)
        .map(([key, value]) => `${key}: ${new Intl.NumberFormat().format(Number(value))}`)
        .join(" · ")
    : "";
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
          disabled={inventoryRunning || !source}
          onClick={() => act("inventory", () => window.lifeboat.runInventory())}
        >
          {inventoryRunning ? "Inventory running" : "Run inventory"}
        </button>
      </section>
      {(inventoryRunning || data.inventory.logs.length > 0) && (
        <section className="statusstrip">
          <div>
            <b>{inventoryRunning ? "Account inventory running" : "Latest inventory activity"}</b>
            <span>
              {inventoryStatus?.message ?? "Preparing inventory"}
              {counts ? ` — ${counts}` : ""}
            </span>
          </div>
          <button className="secondary" onClick={() => goTo("Inventory")}>
            View inventory log
          </button>
        </section>
      )}
      <div className="metrics">
        <Metric
          label="Drive items"
          value={inv ? new Intl.NumberFormat().format(inv.drive.files) : "Not scanned"}
        />
        <Metric
          label="Manifest items"
          value={new Intl.NumberFormat().format(data.drive.stats.discovered)}
        />
        <Metric
          label="Externally owned"
          value={new Intl.NumberFormat().format(data.drive.stats.shared)}
        />
        <Metric label="Latest backup" value={data.drive.jobs[0]?.status ?? "Not started"} />
      </div>
      <section className="panel">
        <Check
          done={source}
          title="Source identity verified"
          note={data.accounts.find((a) => a.role === "source")?.email ?? "Not connected"}
        />
        <Check
          done={dest}
          title="Personal identity verified"
          note={data.accounts.find((a) => a.role === "destination")?.email ?? "Not connected"}
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
