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
}: {
  data: DashboardData;
  source: boolean;
  dest: boolean;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
  actionState: Record<string, ActionState>;
}) {
  const inv = data.latestInventory;
  const sourceAccount = data.accounts.find((a) => a.role === "source");
  const inventoryGranted = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts.other.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ].every((scope) => sourceAccount?.scopes.includes(scope));
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
        <div className="actions">
          <button
            disabled={busy || !source}
            onClick={() => act("inventory-auth", () => window.lifeboat.authorizeInventory())}
          >
            {inventoryGranted ? "Re-authorise inventory access" : "Authorise inventory access"}
          </button>
          <button
            disabled={busy || !source || !inventoryGranted}
            onClick={() => act("inventory", () => window.lifeboat.runInventory())}
          >
            {busy ? "Working…" : "Run inventory"}
          </button>
        </div>
      </section>
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
          note={sourceAccount?.email ?? "Not connected"}
        />
        <Check
          done={inventoryGranted}
          title="Source inventory access authorised"
          note={inventoryGranted ? "Read-only Google scopes granted" : "Authorise before inventory"}
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
