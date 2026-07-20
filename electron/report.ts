import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { InventorySnapshot } from "./types";
const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
export async function exportReports(
  dir: string,
  snapshot: InventorySnapshot,
  queue: unknown[],
  phase2?: any,
) {
  await mkdir(dir, { recursive: true });
  const stamp = snapshot.createdAt.replaceAll(":", "-"),
    base = `lifeboat-evidence-${stamp}`,
    payload = {
      generatedAt: new Date().toISOString(),
      snapshot,
      queue,
      driveBackup: phase2?.drive,
      gmailMigration: phase2?.gmail,
    };
  await writeFile(
    path.join(dir, `${base}.json`),
    JSON.stringify(payload, null, 2),
  );
  const rows = [
    "module,metric,value",
    `gmail,messages,${snapshot.gmail.messages}`,
    `drive,files,${snapshot.drive.files}`,
    `drive,bytes,${snapshot.drive.bytes}`,
  ];
  await writeFile(path.join(dir, `${base}.csv`), rows.join("\n"));
  if (phase2?.manifest) {
    await writeFile(
      path.join(dir, "drive-manifest.csv"),
      [
        "source_id,name,mime_type,relative_path,size,md5,status,verification",
        ...phase2.manifest.map((x: any) =>
          [
            x.source_id,
            esc(x.name),
            esc(x.mime_type),
            esc(x.relative_path),
            x.size ?? "",
            x.md5 ?? "",
            x.status,
            x.verification ?? "",
          ].join(","),
        ),
      ].join("\n"),
    );
    await writeFile(
      path.join(dir, "shared-items.csv"),
      [
        "source_id,name,owner,path,classification",
        ...phase2.shared.map((x: any) =>
          [
            x.sourceId,
            esc(x.name),
            esc(x.owner),
            esc(x.path),
            x.classification,
          ].join(","),
        ),
      ].join("\n"),
    );
  }
  if (phase2?.gmailManifest) {
    await writeFile(path.join(dir, "gmail-manifest.csv"), [
      "source_message_id,destination_message_id,size,status,verification,method,attempts,last_error_code",
      ...phase2.gmailManifest.map((x:any)=>[x.source_message_id,x.destination_message_id??"",x.size_estimate??"",x.status,x.verification_status??"",x.method,x.attempts,x.last_error_code??""].map(esc).join(",")),
    ].join("\n"));
  }
  const h = (s: unknown) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      ),
    job = phase2?.drive?.jobs?.[0],
    status = job?.status ?? "not started";
  const html = `<!doctype html><meta charset="utf-8"><title>Cornerstone Lifeboat evidence</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;color:#17251d}h1{color:#155b3a}.card{padding:18px;border:1px solid #cad8cf;border-radius:12px;margin:12px 0}.warn{color:#9b4216}</style><h1>Cornerstone Lifeboat evidence</h1><p>${h(snapshot.account)} · ${h(new Date().toISOString())}</p><div class="card"><h2>Drive backup: ${h(status)}</h2><p>${phase2?.drive?.stats?.discovered ?? 0} discovered · ${phase2?.drive?.stats?.native ?? 0} converted native files · ${phase2?.drive?.stats?.shared ?? 0} externally owned</p><p>Verification limits: Google-native exports cannot match source checksums. Revisions, comments, sharing permissions, Apps Script bindings and some native features are not preserved.</p></div><div class="card"><h2>Source inventory</h2><p>${snapshot.drive.files.toLocaleString()} Drive items · ${snapshot.gmail.messages.toLocaleString()} messages</p></div><p><b>This report is not “safe to lose source access” unless the backup job is verified and all listed limitations have been reviewed.</b></p>`;
  const g=phase2?.gmail?.stats??{},gmailHtml=`<div class="card"><h2>Gmail migration</h2><p>${g.discovered??0} discovered · ${g.copied??0} copied · ${g.verified??0} verified · ${g.failed??0} failed</p><p>Evidence is redacted: bodies, subjects, recipients and raw MIME are excluded.</p></div>`;
  await writeFile(path.join(dir, `${base}.html`), html+gmailHtml);
  return dir;
}
