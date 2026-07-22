import type { DashboardData } from "../../../electron/types";

export default function SecurityPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
}) {
  return (
    <section className="panel">
      <h2>Credentials and safeguards</h2>
      <p>
        OAuth tokens stay in the OS vault. rclone is invoked without a shell; its config is never
        copied.
      </p>
      {data.accounts.map((account) => (
        <div className="securityrow" key={account.role}>
          <div>
            <b>{account.email}</b>
            <small>
              {account.role} · {account.connectedAt}
            </small>
          </div>
          <button
            className="danger"
            disabled={busy}
            onClick={() => act(account.role, () => window.lifeboat.disconnect(account.role))}
          >
            Revoke & remove
          </button>
        </div>
      ))}
    </section>
  );
}
