import type { DashboardData } from "../../../electron/types";
type Act = (label: string, fn: () => Promise<any>) => Promise<any>;
export default function PreservationPage({
  data,
  busy,
  act,
}: {
  data: DashboardData;
  busy: boolean;
  act: Act;
}) {
  const p = data.preservation;
  return (
    <>
      <section className="panel">
        <div className="paneltitle">
          <div>
            <p className="eyebrow">PRESERVATION · PHOTOS + KEEP</p>
            <h2>Selected Takeout file checksum inventory</h2>
          </div>
          <span>Non-destructive</span>
        </div>
        <p>
          Google does not provide a supported API that can faithfully copy all Google Photos or Keep
          data to another consumer account. Lifeboat therefore verifies an extracted Google Takeout
          folder with SHA-256 checksums and records exactly what was readable. This is an inventory,
          not proof that every Takeout archive part was downloaded or that a second copy exists.
        </p>
        <button
          disabled={busy || p.running}
          onClick={() => act("takeout-scan", () => window.lifeboat.scanTakeout())}
        >
          Choose and checksum Takeout folder
        </button>
        <button
          disabled={busy || p.running}
          onClick={() => act("takeout-import-photos", () => window.lifeboat.importPhotosTakeout())}
        >
          Import Photos Takeout to NAS
        </button>
        <button
          disabled={busy || p.running}
          onClick={() =>
            act("takeout-organize-folder", () => window.lifeboat.organizeTakeoutFolder())
          }
        >
          Organize folder of Takeout zips
        </button>
        <button
          className="secondary"
          disabled={busy || !p.result?.galleryFile}
          onClick={() => act("takeout-open-gallery", () => window.lifeboat.openTakeoutGallery())}
        >
          Open latest photo gallery
        </button>
      </section>
      <div className="metrics">
        <div className="metric">
          <small>Photos / videos</small>
          <b>{Number(p.result?.photos ?? p.result?.media ?? 0).toLocaleString()}</b>
        </div>
        <div className="metric">
          <small>Sidecars / Keep</small>
          <b>{Number(p.result?.sidecars ?? p.result?.keep ?? 0).toLocaleString()}</b>
        </div>
        <div className="metric">
          <small>Total files</small>
          <b>{Number(p.result?.files ?? 0).toLocaleString()}</b>
        </div>
        <div className="metric">
          <small>Bytes hashed</small>
          <b>{Number(p.result?.bytes ?? 0).toLocaleString()}</b>
        </div>
      </div>
      <section className="panel">
        <h3>What to do</h3>
        <ol>
          <li>Request Google Takeout for Google Photos and Keep from the source account.</li>
          <li>
            For the fastest Photos path, download every archive part, then use the import button and
            choose the NAS/local destination folder.
          </li>
          <li>
            For an already extracted Takeout folder, use the checksum button and choose a separate
            evidence-output folder.
          </li>
          <li>Keep both the extracted archive and generated JSON/CSV checksum manifests.</li>
          <li>
            Google Photos upload can be added as an append-only destination workflow, but it cannot
            faithfully compare with or manage photos already in the target library.
          </li>
        </ol>
        <p>{p.progress?.operation ?? "No Takeout folder verified yet."}</p>
        {p.result?.organizedFolder && <p>Organized folder: {p.result.organizedFolder}</p>}
      </section>
    </>
  );
}
