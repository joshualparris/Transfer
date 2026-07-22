import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "../electron/types";
import { useActionManager } from "./hooks/useActionManager";
import AccountsPage from "./components/pages/AccountsPage";
import BackupPage from "./components/pages/BackupPage";
import DriveSetupPage from "./components/pages/DriveSetupPage";
import GmailPage from "./components/pages/GmailPage";
import InventoryPage from "./components/pages/InventoryPage";
import OverviewPage from "./components/pages/OverviewPage";
import SecurityPage from "./components/pages/SecurityPage";
import SharedPage from "./components/pages/SharedPage";
import VerificationPage from "./components/pages/VerificationPage";
import ContactsPage from "./components/pages/ContactsPage";
import CalendarPage from "./components/pages/CalendarPage";
import PreservationPage from "./components/pages/PreservationPage";

const nav = [
  "Overview",
  "Accounts",
  "Inventory",
  "Drive setup",
  "Backup",
  "Shared items",
  "Verification",
  "Gmail migration",
  "Contacts migration",
  "Calendar migration",
  "Photos + Keep",
  "Security",
  "Final report",
];

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [active, setActive] = useState("Overview");
  const [error, setError] = useState("");
  const { actionState, act: managedAct, isBusy } = useActionManager();

  const load = () => window.lifeboat.dashboard().then(setData);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const offDrive = window.lifeboat.onDriveProgress(() => load());
    const offGmail = window.lifeboat.onGmailProgress(() => load());
    const offInventory = window.lifeboat.onInventoryProgress(() => load());
    const offContacts = window.lifeboat.onContactsProgress(() => load());
    const offCalendar = window.lifeboat.onCalendarProgress(() => load());
    const offPreservation = window.lifeboat.onPreservationProgress(() => load());
    return () => {
      offDrive();
      offGmail();
      offInventory();
      offContacts();
      offCalendar();
      offPreservation();
    };
  }, []);

  const act = async (label: string, fn: () => Promise<any>) => {
    setError("");
    try {
      const result = await managedAct(label, fn);
      if (result && typeof result === "object" && "settings" in result) {
        setData(result as DashboardData);
      }
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const days = useMemo(() => {
    if (!data) return 0;
    return Math.ceil((new Date(data.settings.deadline).getTime() - Date.now()) / 864e5);
  }, [data]);

  if (!data) return <div className="splash">Preparing the lifeboat…</div>;

  const source = data.accounts.some((a) => a.role === "source");
  const dest = data.accounts.some((a) => a.role === "destination");

  const page = {
    Overview: (
      <OverviewPage
        data={data}
        source={source}
        dest={dest}
        busy={isBusy}
        act={act}
        actionState={actionState}
      />
    ),
    Accounts: <AccountsPage data={data} busy={isBusy} act={act} />,
    Inventory: <InventoryPage data={data} inv={data.latestInventory} busy={isBusy} source={source} act={act} />,
    "Drive setup": <DriveSetupPage data={data} busy={isBusy} act={act} />,
    Backup: <BackupPage data={data} busy={isBusy} act={act} />,
    "Shared items": <SharedPage data={data} />,
    Verification: <VerificationPage data={data} busy={isBusy} act={act} />,
    "Gmail migration": <GmailPage data={data} busy={isBusy} act={act} />,
    "Contacts migration": <ContactsPage data={data} busy={isBusy} act={act} />,
    "Calendar migration": <CalendarPage data={data} busy={isBusy} act={act} />,
    "Photos + Keep": <PreservationPage data={data} busy={isBusy} act={act} />,
    Security: <SecurityPage data={data} busy={isBusy} act={act} />,
    "Final report": (
      <section className="panel intro">
        <div>
          <h2>Evidence bundle</h2>
          <p>
            Exports source inventory, Drive manifest, shared audit and
            verification evidence. “Safe” requires completed verification and
            reviewed limitations.
          </p>
        </div>
        <button onClick={() => act("export", () => window.lifeboat.exportReports())}>
          Export evidence
        </button>
      </section>
    ),
  }[active];

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
            <button key={x} className={active === x ? "on" : ""} onClick={() => setActive(x)}>
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
        {page}
      </main>
    </div>
  );
}
