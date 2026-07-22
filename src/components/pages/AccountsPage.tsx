import type { DashboardData } from "../../../electron/types";

export default function AccountsPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
}) {
  return (
    <>
      <section className="panel intro">
        <div>
          <h2>Two separate Google identities</h2>
          <p>
            OAuth tokens live only in the operating-system credential store.
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => act("client", () => window.lifeboat.pickClient())}
        >
          Select client_secret.json
        </button>
      </section>
      <div className="accountgrid">
        {( ["source", "destination"] as const).map((role) => {
          const account = data.accounts.find((x) => x.role === role);
          return (
            <section className="panel account" key={role}>
              <p className="eyebrow">{role}</p>
              <h3>{account?.email ?? "Not connected"}</h3>
              {account ? (
                <button
                  className="danger"
                  onClick={() => act(role, () => window.lifeboat.disconnect(role))}
                >
                  Revoke & remove
                </button>
              ) : (
                <button disabled={busy} onClick={() => act(role, () => window.lifeboat.connect(role))}>
                  Connect {role}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
