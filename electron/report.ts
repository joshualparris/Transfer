import { writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { InventorySnapshot } from "./types";
const esc = (v: unknown) => {
  let value = String(v ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  return `"${value.replaceAll('"', '""')}"`;
};
async function atomicWrite(file: string, data: string) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, data, { flag: "wx" });
  await rename(temp, file);
}
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
      contactsMigration: phase2?.contacts,
      calendarMigration: phase2?.calendar,
      takeoutPreservation: phase2?.preservation,
    };
  await atomicWrite(path.join(dir, `${base}.json`), JSON.stringify(payload, null, 2));
  const rows = [
    "module,metric,value",
    `gmail,messages,${snapshot.gmail.messages}`,
    `drive,files,${snapshot.drive.files}`,
    `drive,bytes,${snapshot.drive.bytes}`,
    `contacts,verified,${phase2?.contacts?.stats?.verified ?? 0}`,
    `calendar,verified,${phase2?.calendar?.stats?.verified ?? 0}`,
    `photos_takeout,files,${phase2?.preservation?.result?.photos ?? 0}`,
    `keep_takeout,files,${phase2?.preservation?.result?.keep ?? 0}`,
  ];
  await atomicWrite(path.join(dir, `${base}.csv`), rows.join("\n"));
  if (phase2?.manifest) {
    await atomicWrite(
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
    await atomicWrite(
      path.join(dir, "shared-items.csv"),
      [
        "source_id,name,owner,path,classification",
        ...phase2.shared.map((x: any) =>
          [x.sourceId, esc(x.name), esc(x.owner), esc(x.path), x.classification].join(","),
        ),
      ].join("\n"),
    );
  }
  if (phase2?.gmailManifest) {
    await atomicWrite(
      path.join(dir, "gmail-manifest.csv"),
      [
        "source_message_id,destination_message_id,size,status,verification,method,attempts,last_error_code",
        ...phase2.gmailManifest.map((x: any) =>
          [
            x.source_message_id,
            x.destination_message_id ?? "",
            x.size_estimate ?? "",
            x.status,
            x.verification_status ?? "",
            x.method,
            x.attempts,
            x.last_error_code ?? "",
          ]
            .map(esc)
            .join(","),
        ),
      ].join("\n"),
    );
  }
  if (phase2?.contactsManifest)
    await atomicWrite(
      path.join(dir, "contacts-manifest.csv"),
      [
        "source_type,status,verification,photo_present",
        ...phase2.contactsManifest.map((x: any) =>
          [x.source_type, x.status, x.verification_status ?? "", x.photo_present]
            .map(esc)
            .join(","),
        ),
      ].join("\n"),
    );
  if (phase2?.calendarManifest)
    await atomicWrite(
      path.join(dir, "calendar-manifest.csv"),
      [
        "status,verification,recurring",
        ...phase2.calendarManifest.map((x: any) =>
          [x.status, x.verification_status ?? "", x.recurrence_json !== "[]"].map(esc).join(","),
        ),
      ].join("\n"),
    );
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
  const g = phase2?.gmail?.stats ?? {},
    gmailHtml = `<div class="card"><h2>Gmail migration</h2><p>${g.discovered ?? 0} discovered · ${g.copied ?? 0} copied · ${g.verified ?? 0} verified · ${g.failed ?? 0} failed</p><p>Evidence is redacted: bodies, subjects, recipients and raw MIME are excluded.</p></div>`;
  const c = phase2?.contacts?.stats ?? {},
    cal = phase2?.calendar?.stats ?? {},
    take = phase2?.preservation?.result ?? {},
    more = `<div class="card"><h2>Contacts migration</h2><p>${c.discovered ?? 0} discovered · ${c.copied ?? 0} paired · ${c.verified ?? 0} verified · ${c.failed ?? 0} failed</p></div><div class="card"><h2>Calendar migration</h2><p>${cal.discovered ?? 0} events discovered · ${cal.copied ?? 0} copied · ${cal.verified ?? 0} verified · ${cal.recurring ?? 0} recurring</p></div><div class="card"><h2>Photos + Keep Takeout</h2><p>${take.photos ?? 0} photo/video files · ${take.keep ?? 0} Keep files · ${take.bytes ?? 0} bytes checksum-verified</p></div>`;
  const htmlFile = path.join(dir, `${base}.html`);
  await atomicWrite(htmlFile, html + gmailHtml + more);
  await atomicWrite(
    path.join(dir, `${base}.sha256.json`),
    JSON.stringify(
      {
        algorithm: "SHA-256",
        generatedAt: new Date().toISOString(),
        evidenceHtml: createHash("sha256")
          .update(html + gmailHtml + more)
          .digest("hex"),
        exportedCounts: {
          drive: phase2?.manifest?.length ?? 0,
          shared: phase2?.shared?.length ?? 0,
          gmail: phase2?.gmailManifest?.length ?? 0,
          contacts: phase2?.contactsManifest?.length ?? 0,
          calendar: phase2?.calendarManifest?.length ?? 0,
        },
      },
      null,
      2,
    ),
  );
  return dir;
}
