import { useEffect, useState } from "react";
import type { DashboardData } from "../../../electron/types";

export default function SharedPage({ data }: { data: DashboardData }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    window.lifeboat.drivePage(0, 100, true).then(setRows);
  }, []);

  return (
    <section className="panel">
      <h2>Shared-with-me audit</h2>
      <p>Read-only audit. Permission changes remain unavailable in this phase.</p>
      <div className="table">
        <div className="tr head">
          <span>Name</span>
          <span>Owner</span>
          <span>Classification</span>
        </div>
        {rows.map((row) => (
          <div className="tr" key={row.sourceId}>
            <span>{row.name}</span>
            <span>{row.owner}</span>
            <span>{row.classification}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
