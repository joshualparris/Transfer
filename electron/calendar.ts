import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { google, calendar_v3 } from "googleapis";
import type { LifeboatDatabase } from "./database";
import { authFor } from "./google";
import { redact } from "./security";

const hash = (value: unknown) =>
  createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");
export const safeCalendarName = (name: string, sourceCalendarId?: string) =>
  `Cornerstone Import/${
    name
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 180) || "Calendar"
  }${sourceCalendarId ? ` [${hash(sourceCalendarId).slice(0, 8)}]` : ""}`;
export function writableEvent(event: calendar_v3.Schema$Event) {
  return {
    iCalUID: event.iCalUID,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    recurrence: event.recurrence,
    transparency: event.transparency,
    visibility: event.visibility,
    status: event.status === "cancelled" ? undefined : event.status,
    reminders: event.reminders,
    extendedProperties: event.extendedProperties,
    attachments: event.attachments?.map((item) => ({
      fileUrl: item.fileUrl,
      title: item.title,
      mimeType: item.mimeType,
      iconLink: item.iconLink,
    })),
    source: event.source,
  };
}
export function eventFingerprint(event: any) {
  return hash(
    JSON.stringify({
      s: event.summary ?? "",
      a: event.start ?? {},
      z: event.end ?? {},
      r: event.recurrence ?? [],
      l: event.location ?? "",
    }),
  );
}
async function listCalendars(api: calendar_v3.Calendar) {
  const items: calendar_v3.Schema$CalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const response = await api.calendarList.list({ maxResults: 250, pageToken });
    items.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}

export async function inventoryCalendars(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
  progress?: (value: any) => void,
) {
  const api = google.calendar({ version: "v3", auth: await authFor("source") }),
    runId = randomUUID(),
    now = new Date().toISOString();
  db.phaseRun(
    "INSERT INTO calendar_runs_v2(id,source_subject,destination_subject,status,started_at,completed_at,last_error) VALUES(?,?,?,?,?,?,?)",
    runId,
    sourceSubject,
    destinationSubject,
    "running",
    now,
    null,
    null,
  );
  let eventCount = 0,
    calendarCount = 0;
  for (const calendar of await listCalendars(api)) {
    if (!calendar.id) continue;
    calendarCount++;
    db.phaseRun(
      "INSERT OR IGNORE INTO calendar_map_v2(source_subject,destination_subject,source_calendar_id,source_name,destination_calendar_id,status) VALUES(?,?,?,?,?,?)",
      sourceSubject,
      destinationSubject,
      calendar.id,
      calendar.summaryOverride ?? calendar.summary ?? "Calendar",
      null,
      "discovered",
    );
    let token: string | undefined;
    do {
      const response = await api.events.list({
        calendarId: calendar.id,
        maxResults: 2500,
        pageToken: token,
        singleEvents: false,
        showDeleted: false,
      });
      for (const event of response.data.items ?? []) {
        if (!event.id || !event.start || !event.end) continue;
        db.phaseRun(
          "INSERT OR IGNORE INTO calendar_events_v2(id,run_id,source_subject,destination_subject,source_calendar_id,source_event_id,ical_uid,summary_hash,start_json,end_json,recurrence_json,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          runId,
          sourceSubject,
          destinationSubject,
          calendar.id,
          event.id,
          event.iCalUID ?? null,
          hash(event.summary),
          JSON.stringify(event.start),
          JSON.stringify(event.end),
          JSON.stringify(event.recurrence ?? []),
          "discovered",
        );
        eventCount++;
      }
      token = response.data.nextPageToken ?? undefined;
      progress?.({ operation: "Calendar inventory", calendars: calendarCount, events: eventCount });
    } while (token);
  }
  db.phaseRun(
    "UPDATE calendar_runs_v2 SET status='inventory-complete',completed_at=? WHERE id=?",
    new Date().toISOString(),
    runId,
  );
  return { runId, calendars: calendarCount, events: eventCount };
}

export async function runCalendars(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
  progress?: (value: any) => void,
) {
  const source = google.calendar({ version: "v3", auth: await authFor("source") }),
    destination = google.calendar({ version: "v3", auth: await authFor("destination") }),
    existing = await listCalendars(destination);
  for (const mapping of db.phaseAll(
    "SELECT * FROM calendar_map_v2 WHERE source_subject=? AND destination_subject=?",
    sourceSubject,
    destinationSubject,
  )) {
    try {
      let id =
        mapping.destination_calendar_id ||
        existing.find(
          (item) =>
            item.summary === safeCalendarName(mapping.source_name, mapping.source_calendar_id),
        )?.id;
      if (!id)
        id = (
          await destination.calendars.insert({
            requestBody: {
              summary: safeCalendarName(mapping.source_name, mapping.source_calendar_id),
              timeZone: "Australia/Sydney",
            },
          })
        ).data.id!;
      db.phaseRun(
        "UPDATE calendar_map_v2 SET destination_calendar_id=?,status='mapped' WHERE source_subject=? AND destination_subject=? AND source_calendar_id=?",
        id,
        sourceSubject,
        destinationSubject,
        mapping.source_calendar_id,
      );
    } catch {
      db.phaseRun(
        "UPDATE calendar_map_v2 SET status='failed' WHERE source_subject=? AND destination_subject=? AND source_calendar_id=?",
        sourceSubject,
        destinationSubject,
        mapping.source_calendar_id,
      );
    }
  }
  let copied = 0,
    verified = 0,
    failed = 0;
  const rows = db.phaseAll(
    "SELECT e.*,m.destination_calendar_id mapped_calendar FROM calendar_events_v2 e JOIN calendar_map_v2 m ON m.source_subject=e.source_subject AND m.destination_subject=e.destination_subject AND m.source_calendar_id=e.source_calendar_id WHERE e.source_subject=? AND e.destination_subject=? AND e.status IN ('discovered','failed-retryable')",
    sourceSubject,
    destinationSubject,
  );
  for (const row of rows) {
    if (!row.mapped_calendar) {
      failed++;
      continue;
    }
    db.phaseRun(
      "UPDATE calendar_events_v2 SET status='copying',attempts=attempts+1 WHERE id=?",
      row.id,
    );
    try {
      const event = (
        await source.events.get({
          calendarId: row.source_calendar_id,
          eventId: row.source_event_id,
        })
      ).data;
      const candidates = event.iCalUID
        ? ((
            await destination.events.list({
              calendarId: row.mapped_calendar,
              iCalUID: event.iCalUID,
              maxResults: 10,
              singleEvents: false,
              showDeleted: false,
            })
          ).data.items ?? [])
        : [];
      const matches = candidates.filter(
        (candidate) => eventFingerprint(candidate) === eventFingerprint(event),
      );
      if (matches.length > 1) {
        db.phaseRun(
          "UPDATE calendar_events_v2 SET status='manual-action-required',last_error='Multiple destination events match the source iCalUID and fingerprint' WHERE id=?",
          row.id,
        );
        continue;
      }
      let created = matches[0];
      if (!created)
        created = (
          await destination.events.import({
            calendarId: row.mapped_calendar,
            supportsAttachments: true,
            requestBody: writableEvent(event),
          })
        ).data;
      if (!created.id) throw new Error("Calendar import did not return a destination event ID");
      db.phaseRun(
        "UPDATE calendar_events_v2 SET destination_calendar_id=?,destination_event_id=?,status='copied' WHERE id=?",
        row.mapped_calendar,
        created.id,
        row.id,
      );
      copied++;
      created = (
        await destination.events.get({ calendarId: row.mapped_calendar, eventId: created.id! })
      ).data;
      const ok = eventFingerprint(event) === eventFingerprint(created);
      db.phaseRun(
        "UPDATE calendar_events_v2 SET status=?,verification_status=? WHERE id=?",
        ok ? "verified" : "manual-action-required",
        ok ? "verified" : "mismatch",
        row.id,
      );
      if (ok) verified++;
    } catch (error) {
      failed++;
      db.phaseRun(
        "UPDATE calendar_events_v2 SET status='failed-retryable',last_error=? WHERE id=?",
        redact(error).slice(0, 500),
        row.id,
      );
    }
    progress?.({ operation: "Migrating calendars", copied, verified, failed });
  }
  return { copied, verified, failed };
}

export function calendarStats(db: LifeboatDatabase) {
  return (
    db.phaseGet(
      "SELECT count(*) discovered,sum(destination_event_id IS NOT NULL) copied,sum(status='verified') verified,sum(recurrence_json!='[]') recurring,sum(status LIKE 'failed%') failed FROM calendar_events_v2",
    ) ?? {}
  );
}
export async function verifyCalendarsDestinationOnly(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
) {
  const api = google.calendar({ version: "v3", auth: await authFor("destination") });
  let verified = 0,
    failed = 0;
  for (const row of db.phaseAll(
    "SELECT * FROM calendar_events_v2 WHERE source_subject=? AND destination_subject=? AND destination_event_id IS NOT NULL",
    sourceSubject,
    destinationSubject,
  ))
    try {
      const event = (
          await api.events.get({
            calendarId: row.destination_calendar_id,
            eventId: row.destination_event_id,
          })
        ).data,
        ok =
          hash(event.summary) === row.summary_hash &&
          JSON.stringify(event.start) === row.start_json &&
          JSON.stringify(event.end) === row.end_json &&
          JSON.stringify(event.recurrence ?? []) === row.recurrence_json;
      db.phaseRun(
        "UPDATE calendar_events_v2 SET status=?,verification_status=? WHERE id=?",
        ok ? "verified" : "manual-action-required",
        ok ? "destination-only-verified" : "destination-only-mismatch",
        row.id,
      );
      ok ? verified++ : failed++;
    } catch {
      failed++;
      db.phaseRun(
        "UPDATE calendar_events_v2 SET verification_status='destination-only-missing' WHERE id=?",
        row.id,
      );
    }
  return { verified, failed };
}
const escapeIcs = (value: unknown) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/[,;]/g, (match) => `\\${match}`),
  dateTime = (value: any) =>
    value?.dateTime?.replace(/[-:]/g, "").replace(/\.\d{3}/, "") ?? value?.date?.replace(/-/g, "");
export async function exportCalendars(dir: string) {
  const api = google.calendar({ version: "v3", auth: await authFor("source") });
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
    files: string[] = [];
  for (const calendar of await listCalendars(api)) {
    if (!calendar.id) continue;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cornerstone Lifeboat//EN",
      `X-WR-CALNAME:${escapeIcs(calendar.summary)}`,
    ];
    let token: string | undefined;
    do {
      const response = await api.events.list({
        calendarId: calendar.id,
        maxResults: 2500,
        pageToken: token,
        singleEvents: false,
        showDeleted: false,
      });
      for (const event of response.data.items ?? []) {
        if (!event.start || !event.end) continue;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${escapeIcs(event.iCalUID ?? event.id)}`,
          `SUMMARY:${escapeIcs(event.summary)}`,
          `DTSTART:${dateTime(event.start)}`,
          `DTEND:${dateTime(event.end)}`,
          ...(event.recurrence ?? []),
          `DESCRIPTION:${escapeIcs(event.description)}`,
          "END:VEVENT",
        );
      }
      token = response.data.nextPageToken ?? undefined;
    } while (token);
    lines.push("END:VCALENDAR", "");
    const target = path.join(
        dir,
        `cornerstone-calendar-${hash(calendar.id).slice(0, 10)}-${stamp}.ics`,
      ),
      temp = `${target}.tmp`;
    await writeFile(temp, lines.join("\r\n"), { flag: "wx" });
    await rename(temp, target);
    files.push(target);
  }
  return files;
}
