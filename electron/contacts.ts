import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { google, people_v1 } from "googleapis";
import type { LifeboatDatabase } from "./database";
import { authFor } from "./google";
import { redact } from "./security";

export const CONTACT_FIELDS =
  "names,emailAddresses,phoneNumbers,organizations,occupations,addresses,birthdays,biographies,urls,relations,events,nicknames,userDefined,memberships,photos,metadata";
const norm = (v: unknown) =>
    String(v ?? "")
      .normalize("NFKC")
      .trim()
      .toLowerCase(),
  vals = (a: any[] | null | undefined, k = "value") =>
    (a ?? [])
      .map((x) => norm(x?.[k]))
      .filter(Boolean)
      .sort();
export function fingerprint(p: any, key: string) {
  return createHmac("sha256", key)
    .update(
      JSON.stringify({
        e: vals(p.emailAddresses),
        p: vals(p.phoneNumbers).map((x) => x.replace(/[^+\d]/g, "")),
      n: vals(primaryOnly(p.names), "displayName"),
        o: vals(p.organizations, "name"),
        b: (p.birthdays ?? [])
          .map(
            (x: any) =>
              `${x.date?.year ?? ""}-${x.date?.month ?? ""}-${x.date?.day ?? ""}`,
          )
          .sort(),
      }),
    )
    .digest("hex");
}
export function presence(p: any) {
  return Object.fromEntries(
    [
      "names",
      "emailAddresses",
      "phoneNumbers",
      "organizations",
      "occupations",
      "addresses",
      "birthdays",
      "biographies",
      "urls",
      "relations",
      "events",
      "nicknames",
      "userDefined",
      "memberships",
      "photos",
    ].map((k) => [k, !!p[k]?.length]),
  );
}
export function writablePerson(p: any) {
  const fields = [
    "names",
    "emailAddresses",
    "phoneNumbers",
    "organizations",
    "occupations",
    "addresses",
    "birthdays",
    "biographies",
    "urls",
    "relations",
    "events",
    "nicknames",
    "userDefined",
  ];
  return Object.fromEntries(
    fields
      .filter((k) => p[k]?.length)
      .map((k) => [
        k,
        (k === "names" ? primaryOnly(p[k]) : p[k]).map((v: any) => {
          const x = { ...v };
          delete x.metadata;
          delete x.formattedType;
          delete x.formattedValue;
          delete x.source;
          return x;
        }),
      ]),
  );
}
function primaryOnly(values: any[] | null | undefined) {
  if (!values?.length) return [];
  return [values.find((x) => x?.metadata?.primary) ?? values[0]];
}
function transientContactError(error: any) {
  const code = Number(error?.code ?? error?.response?.status);
  return (
    code === 429 ||
    code >= 500 ||
    ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "ABORT_ERR"].includes(
      String(error?.code ?? error?.cause?.code ?? "").toUpperCase(),
    ) ||
    /aborted|network|socket hang up/i.test(String(error?.message ?? error))
  );
}
export async function withContactRetry<T>(fn: () => Promise<T>, attempts = 5) {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!transientContactError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15_000)),
      );
    }
  }
  throw last;
}
export function classifyMatch(source: any, dest: any[], key: string) {
  const exact = dest.filter(
    (x) => fingerprint(x, key) === fingerprint(source, key),
  );
  if (exact.length === 1) return { kind: "existing", person: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous" };
  const emails = new Set(vals(source.emailAddresses)),
    possible = dest.filter((x) =>
      vals(x.emailAddresses).some((e) => emails.has(e)),
    );
  return possible.length
    ? {
        kind: possible.length === 1 ? "possible" : "ambiguous",
        person: possible[0],
      }
    : { kind: "none" };
}
export const groupName = (name: string, exact = false) =>
  (exact ? "" : `Cornerstone Import/`) +
  (name
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 180) || "Unnamed group");
export const systemGroup = (g: any) => g.groupType === "SYSTEM_CONTACT_GROUP";
export function csvCell(v: unknown) {
  let s = String(v ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const ve = (v: unknown) =>
  String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/[,;]/g, (m) => `\\${m}`);
export function vcard(p: any) {
  const n = p.names?.[0]?.displayName ?? "Unnamed contact",
    l = ["BEGIN:VCARD", "VERSION:3.0", `FN:${ve(n)}`];
  for (const x of p.emailAddresses ?? [])
    if (x.value) l.push(`EMAIL:${ve(x.value)}`);
  for (const x of p.phoneNumbers ?? [])
    if (x.value) l.push(`TEL:${ve(x.value)}`);
  return l.concat("END:VCARD", "").join("\r\n");
}
export function validatePhoto(bytes: Buffer, mime: string) {
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Photo exceeds 10 MB");
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime))
    throw new Error("Unsupported photo type");
  if (bytes.length < 8) throw new Error("Invalid photo");
  return true;
}
async function listPeople(api: people_v1.People) {
  const all: people_v1.Schema$Person[] = [];
  let pageToken: string | undefined;
  do {
    const r = await withContactRetry(() => api.people.connections.list({
      resourceName: "people/me",
      pageSize: 1000,
      pageToken,
      personFields: CONTACT_FIELDS,
    }));
    all.push(...(r.data.connections ?? []).filter((x) => !x.metadata?.deleted));
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  return all;
}
export async function inventoryContacts(
  db: LifeboatDatabase,
  input: {
    sourceSubject: string;
    sourceEmail: string;
    destinationSubject: string;
    destinationEmail: string;
    otherPolicy: string;
  },
  progress?: (x: any) => void,
) {
  const api = google.people({ version: "v1", auth: await authFor("source") }),
    runId = randomUUID(),
    key = `${input.sourceSubject}:${input.destinationSubject}`,
    now = new Date().toISOString();
  db.phaseRun(
    "INSERT INTO contacts_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    runId,
    input.sourceSubject,
    input.sourceEmail,
    input.destinationSubject,
    input.destinationEmail,
    "dry-run",
    "running",
    now,
    null,
    JSON.stringify({ otherPolicy: input.otherPolicy }),
    "{}",
    null,
  );
  let pageToken: string | undefined,
    count = 0;
  do {
    const r = await api.people.connections.list({
      resourceName: "people/me",
      pageSize: 1000,
      pageToken,
      personFields: CONTACT_FIELDS,
      requestSyncToken: true,
    });
    for (const p of r.data.connections ?? []) {
      if (!p.resourceName || p.metadata?.deleted) continue;
      const memberships = (p.memberships ?? [])
        .map((m) => m.contactGroupMembership?.contactGroupResourceName)
        .filter(Boolean);
      db.phaseRun(
        `INSERT OR IGNORE INTO contacts_manifest(id,run_id,source_subject,destination_subject,source_resource_name,source_etag,source_type,semantic_fingerprint,field_presence_json,group_memberships_json,photo_present,status,created_at,verification_json)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        randomUUID(),
        runId,
        input.sourceSubject,
        input.destinationSubject,
        p.resourceName,
        p.etag ?? null,
        "personal",
        fingerprint(p, key),
        JSON.stringify(presence(p)),
        JSON.stringify(memberships),
        p.photos?.some((x) => !x.default) ? 1 : 0,
        "discovered",
        now,
        "{}",
      );
      count++;
    }
    pageToken = r.data.nextPageToken ?? undefined;
    progress?.({ operation: "Contacts inventory", discovered: count });
  } while (pageToken);
  let groups = 0,
    gToken: string | undefined;
  do {
    const r = await api.contactGroups.list({
      pageSize: 1000,
      pageToken: gToken,
      groupFields: "groupType,memberCount,metadata,name",
    });
    for (const g of r.data.contactGroups ?? []) {
      if (!g.resourceName) continue;
      const type = systemGroup(g) ? "system" : "user";
      db.phaseRun(
        `INSERT OR IGNORE INTO contact_group_map(run_id,source_subject,destination_subject,source_group_resource,source_group_name_hash,destination_group_name,group_type,status)VALUES(?,?,?,?,?,?,?,?)`,
        runId,
        input.sourceSubject,
        input.destinationSubject,
        g.resourceName,
        createHash("sha256")
          .update(g.name ?? "")
          .digest("hex"),
        groupName(g.name ?? ""),
        type,
        type === "system" ? "skipped" : "discovered",
      );
      groups++;
    }
    gToken = r.data.nextPageToken ?? undefined;
  } while (gToken);
  let other = 0,
    oToken: string | undefined;
  do {
    const r = await api.otherContacts.list({
      pageSize: 1000,
      pageToken: oToken,
      readMask: "metadata,names,emailAddresses,phoneNumbers,photos",
    });
    for (const p of r.data.otherContacts ?? []) {
      if (!p.resourceName) continue;
      db.phaseRun(
        `INSERT OR IGNORE INTO other_contacts_manifest(id,run_id,source_subject,destination_subject,source_resource_name,semantic_fingerprint,available_fields_json,selected_for_conversion,status)VALUES(?,?,?,?,?,?,?,?,?)`,
        randomUUID(),
        runId,
        input.sourceSubject,
        input.destinationSubject,
        p.resourceName,
        fingerprint(p, key),
        JSON.stringify(presence(p)),
        0,
        input.otherPolicy === "ignore" ? "skipped" : "archived",
      );
      other++;
    }
    oToken = r.data.nextPageToken ?? undefined;
  } while (oToken);
  db.phaseRun(
    "UPDATE contacts_runs SET status='inventory-complete',completed_at=? WHERE id=?",
    new Date().toISOString(),
    runId,
  );
  return { runId, contacts: count, groups, other };
}
export async function runContacts(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
  progress?: (x: any) => void,
) {
  const source = google.people({
      version: "v1",
      auth: await authFor("source"),
    }),
    dest = google.people({ version: "v1", auth: await authFor("destination") }),
    key = `${sourceSubject}:${destinationSubject}`,
    destPeople = await listPeople(dest);
  const existingGroups = await dest.contactGroups.list({ pageSize: 1000 }),
    byName = new Map(
      (existingGroups.data.contactGroups ?? []).map((g) => [
        norm(g.name),
        g.resourceName!,
      ]),
    );
  for (const g of db.phaseAll(
    "SELECT * FROM contact_group_map WHERE source_subject=? AND destination_subject=? AND group_type='user'",
    sourceSubject,
    destinationSubject,
  )) {
    try {
      let id =
        g.destination_group_resource ||
        byName.get(norm(g.destination_group_name));
      if (!id)
        id = (
          await dest.contactGroups.create({
            requestBody: { contactGroup: { name: g.destination_group_name } },
          })
        ).data.resourceName!;
      db.phaseRun(
        "UPDATE contact_group_map SET destination_group_resource=?,status='mapped' WHERE source_subject=? AND destination_subject=? AND source_group_resource=?",
        id,
        sourceSubject,
        destinationSubject,
        g.source_group_resource,
      );
    } catch (e) {
      db.phaseRun(
        "UPDATE contact_group_map SET status='failed' WHERE source_subject=? AND destination_subject=? AND source_group_resource=?",
        sourceSubject,
        destinationSubject,
        g.source_group_resource,
      );
    }
  }
  const rows = db.phaseAll(
    "SELECT * FROM contacts_manifest WHERE source_subject=? AND destination_subject=? AND status IN ('discovered','failed-retryable') ORDER BY created_at",
    sourceSubject,
    destinationSubject,
  );
  let copied = 0,
    matched = 0,
    failed = 0;
  for (const row of rows) {
    db.phaseRun(
      "UPDATE contacts_manifest SET status='copying',attempts=attempts+1 WHERE id=?",
      row.id,
    );
    try {
      const p = (
          await withContactRetry(() => source.people.get({
            resourceName: row.source_resource_name,
            personFields: CONTACT_FIELDS,
          }))
        ).data,
        match = row.destination_resource_name
          ? { kind: "resuming", person: (await withContactRetry(() => dest.people.get({ resourceName: row.destination_resource_name, personFields: CONTACT_FIELDS }))).data }
          : classifyMatch(p, destPeople, key);
      if (match.kind === "ambiguous" || match.kind === "possible") {
        db.phaseRun(
          "UPDATE contacts_manifest SET status='manual-action-required',verification_status=? WHERE id=?",
          match.kind,
          row.id,
        );
        continue;
      }
      let created: any;
      if (match.kind === "existing" || match.kind === "resuming") {
        created = match.person;
        matched++;
      } else {
        created = (
          await dest.people.createContact({
            requestBody: writablePerson(p),
            personFields: CONTACT_FIELDS,
          })
        ).data;
        destPeople.push(created);
        copied++;
      }
      db.phaseRun(
        "UPDATE contacts_manifest SET destination_resource_name=?,semantic_fingerprint=?,status='copied',copied_at=?,redacted_last_error=NULL WHERE id=?",
        created.resourceName,
        fingerprint(p, key),
        new Date().toISOString(),
        row.id,
      );
      const memberships = JSON.parse(row.group_memberships_json) as string[];
      for (const sourceGroup of memberships) {
        const map = db.phaseGet(
          "SELECT destination_group_resource FROM contact_group_map WHERE source_subject=? AND destination_subject=? AND source_group_resource=?",
          sourceSubject,
          destinationSubject,
          sourceGroup,
        );
        if (map?.destination_group_resource)
          await withContactRetry(() => dest.contactGroups.members.modify({
            resourceName: map.destination_group_resource,
            requestBody: { resourceNamesToAdd: [created.resourceName!] },
          }));
      }
      let photoCopied = false,
        photoError = false;
      const photo = p.photos?.find((x) => !x.default && x.url);
      if (photo?.url && match.kind !== "existing" && match.kind !== "resuming")
        try {
          const response = await fetch(photo.url);
          const bytes = Buffer.from(await response.arrayBuffer());
          validatePhoto(
            bytes,
            response.headers.get("content-type")?.split(";")[0] ?? "",
          );
          await dest.people.updateContactPhoto({
            resourceName: created.resourceName!,
            requestBody: { photoBytes: bytes.toString("base64") },
          });
          photoCopied = true;
        } catch {
          photoError = true;
        }
      const got = (
          await withContactRetry(() => dest.people.get({
            resourceName: created.resourceName!,
            personFields: CONTACT_FIELDS,
          }))
        ).data,
        ok = fingerprint(p, key) === fingerprint(got, key);
      db.phaseRun(
        "UPDATE contacts_manifest SET status=?,verification_status=?,verification_json=? WHERE id=?",
        ok ? "verified" : "manual-action-required",
        ok ? "verified" : "mismatch",
        JSON.stringify({ supportedFields: ok, photoCopied, photoError }),
        row.id,
      );
    } catch (e) {
      failed++;
      db.phaseRun(
        "UPDATE contacts_manifest SET status='failed-retryable',redacted_last_error=? WHERE id=?",
        redact(e).slice(0, 500),
        row.id,
      );
    }
    progress?.({
      operation: "Migrating contacts",
      processed: copied + matched + failed,
      copied,
      matched,
      failed,
    });
  }
  return { copied, matched, failed };
}
export function contactStats(db: LifeboatDatabase) {
  return (
    db.phaseGet(
      `SELECT count(*) discovered,sum(status='verified') verified,sum(destination_resource_name IS NOT NULL) copied,sum(status='manual-action-required') ambiguous,sum(status LIKE 'failed%') failed,sum(photo_present) photos FROM contacts_manifest`,
    ) ?? {}
  );
}
export async function convertOtherContacts(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
  progress?: (x: any) => void,
) {
  const source = google.people({
      version: "v1",
      auth: await authFor("source"),
    }),
    dest = google.people({ version: "v1", auth: await authFor("destination") }),
    key = `${sourceSubject}:${destinationSubject}`,
    existing = await listPeople(dest),
    wanted = new Map(
      db
        .phaseAll(
          "SELECT * FROM other_contacts_manifest WHERE source_subject=? AND destination_subject=? AND destination_resource_name IS NULL AND status='archived'",
          sourceSubject,
          destinationSubject,
        )
        .map((x) => [x.source_resource_name, x]),
    );
  let token: string | undefined,
    converted = 0,
    skipped = 0;
  do {
    const r = await source.otherContacts.list({
      pageSize: 1000,
      pageToken: token,
      readMask: "metadata,names,emailAddresses,phoneNumbers,photos",
    });
    for (const p of r.data.otherContacts ?? []) {
      const row = wanted.get(p.resourceName ?? "");
      if (!row) continue;
      const match = classifyMatch(p, existing, key);
      if (match.kind !== "none") {
        skipped++;
        db.phaseRun(
          "UPDATE other_contacts_manifest SET status=?,verification_status=? WHERE id=?",
          "manual-action-required",
          match.kind,
          row.id,
        );
        continue;
      }
      try {
        const created = (
          await dest.people.createContact({
            requestBody: writablePerson(p),
            personFields: CONTACT_FIELDS,
          })
        ).data;
        existing.push(created);
        converted++;
        db.phaseRun(
          "UPDATE other_contacts_manifest SET selected_for_conversion=1,destination_resource_name=?,status='verified',verification_status='converted' WHERE id=?",
          created.resourceName,
          row.id,
        );
      } catch (e) {
        db.phaseRun(
          "UPDATE other_contacts_manifest SET status='failed-retryable',verification_status=? WHERE id=?",
          redact(e).slice(0, 300),
          row.id,
        );
      }
      progress?.({
        operation: "Converting Other Contacts",
        converted,
        skipped,
      });
    }
    token = r.data.nextPageToken ?? undefined;
  } while (token);
  return { converted, skipped };
}
export async function verifyContactsDestinationOnly(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
) {
  const dest = google.people({
      version: "v1",
      auth: await authFor("destination"),
    }),
    key = `${sourceSubject}:${destinationSubject}`,
    rows = db.phaseAll(
      "SELECT * FROM contacts_manifest WHERE source_subject=? AND destination_subject=? AND destination_resource_name IS NOT NULL",
      sourceSubject,
      destinationSubject,
    );
  let verified = 0,
    failed = 0;
  for (const row of rows)
    try {
      const p = (
          await dest.people.get({
            resourceName: row.destination_resource_name,
            personFields: CONTACT_FIELDS,
          })
        ).data,
        ok = fingerprint(p, key) === row.semantic_fingerprint;
      db.phaseRun(
        "UPDATE contacts_manifest SET verification_status=?,verification_json=?,status=? WHERE id=?",
        ok ? "destination-only-verified" : "destination-only-mismatch",
        JSON.stringify({
          destinationOnly: true,
          exists: true,
          fingerprint: ok,
        }),
        ok ? "verified" : "manual-action-required",
        row.id,
      );
      ok ? verified++ : failed++;
    } catch (e) {
      failed++;
      db.phaseRun(
        "UPDATE contacts_manifest SET verification_status='destination-only-missing',verification_json=? WHERE id=?",
        JSON.stringify({ destinationOnly: true, error: redact(e) }),
        row.id,
      );
    }
  return {
    verified,
    failed,
    status: failed ? "verified-with-limitations" : "verified",
  };
}
export async function exportContacts(dir: string) {
  const api = google.people({ version: "v1", auth: await authFor("source") }),
    people = await listPeople(api);
  await mkdir(dir, { recursive: true });
  const base = path.join(
      dir,
      `cornerstone-contacts-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    ),
    csv = [
      "Name,E-mail 1 - Value,Phone 1 - Value",
      ...people.map((p) =>
        [
          p.names?.[0]?.displayName,
          p.emailAddresses?.[0]?.value,
          p.phoneNumbers?.[0]?.value,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n"),
    vcf = people.map(vcard).join(""),
    json = JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        contacts: people.map((p) => ({
          resource: hash(p.resourceName),
          fields: presence(p),
        })),
      },
      null,
      2,
    );
  for (const [ext, data] of [
    ["csv", csv],
    ["vcf", vcf],
    ["json", json],
  ] as const) {
    const tmp = `${base}.${ext}.tmp`;
    await writeFile(tmp, data, { flag: "wx" });
    await rename(tmp, `${base}.${ext}`);
  }
  return base;
}
const hash = (v: unknown) =>
  createHash("sha256")
    .update(String(v ?? ""))
    .digest("hex");
