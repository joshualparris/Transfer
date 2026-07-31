import { useState } from "react";
import type { DashboardData } from "../../../electron/types";

export default function BookshelfPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: (label: string, fn: () => Promise<any>) => Promise<any>;
}) {
  const [destination, setDestination] = useState(data.bookshelf.config.destination ?? "");
  const scan = data.bookshelf.scan;
  const result = data.bookshelf.result;
  const progress = data.bookshelf.progress ?? {};

  return (
    <>
      <section className="panel intro">
        <div>
          <h2>BookShelf rescue</h2>
          <p>
            Downloads the known BookShelf Drive folders and writes restore metadata with reading
            progress from Drive appProperties.
          </p>
        </div>
        <button disabled={busy} onClick={() => act("bookshelf-scan", window.lifeboat.scanBookshelf)}>
          Scan folders
        </button>
      </section>

      <section className="panel form">
        <label>
          Rescue destination
          <input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="/path/to/Cornerstone Account Backup"
          />
        </label>
        <div className="actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              act("bookshelf-pick", async () => {
                const next = await window.lifeboat.pickBookshelfDestination();
                setDestination(next.bookshelf.config.destination ?? "");
                return next;
              })
            }
          >
            Browse
          </button>
          <button
            disabled={!destination || busy}
            onClick={() =>
              act("bookshelf-rescue", () => window.lifeboat.rescueBookshelf({ destination }))
            }
          >
            Rescue files
          </button>
        </div>
        {data.bookshelf.config.destination && (
          <p className="success">
            Ready: {data.bookshelf.config.destination} ·{" "}
            {data.bookshelf.config.freeBytes
              ? `${(data.bookshelf.config.freeBytes / 1024 ** 3).toFixed(1)} GB`
              : "—"}{" "}
            free
          </p>
        )}
      </section>

      {(data.bookshelf.running || progress.operation) && (
        <section className="panel">
          <h3>{progress.operation ?? "Working"}</h3>
          <p>
            {progress.copied ?? 0} rescued · {progress.failed ?? 0} failed ·{" "}
            {progress.files ?? 0} discovered
          </p>
          {progress.current && <p className="muted">{progress.current}</p>}
        </section>
      )}

      {scan && (
        <section className="panel">
          <h3>Latest scan</h3>
          <p>
            {scan.ebooks ?? 0} ebooks · {scan.audiobooks ?? 0} audiobooks ·{" "}
            {scan.audiobookTracks ?? 0} audio tracks · {scan.withProgress} with saved reading
            progress
          </p>
          <div className="grid">
            {Object.entries(scan.bySource ?? {}).map(([source, count]) => (
              <div className="metric" key={source}>
                <span>{source}</span>
                <b>{String(count)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && (
        <section className="panel">
          <h3>Last rescue</h3>
          <p>
            {result.rescued} rescued · {result.failed} failed · {result.discovered} discovered
          </p>
          <p className="success">{result.root}</p>
        </section>
      )}
    </>
  );
}
