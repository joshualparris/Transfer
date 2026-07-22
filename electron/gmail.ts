import { google, gmail_v1 } from "googleapis";
import { createHash, randomInt } from "node:crypto";
import { mkdir, rename, stat, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { authFor } from "./google";
import type { LifeboatDatabase } from "./database";
import { redact } from "./security";
const h = (v = "") => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
const rawHash = (raw: string) =>
  createHash("sha256").update(Buffer.from(raw, "base64url")).digest("hex");
const header = (m: gmail_v1.Schema$Message, n: string) =>
  (m.payload?.headers ?? []).find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value ?? "";
function parts(m: gmail_v1.Schema$Message) {
  let attachments = 0;
  const meta: string[] = [];
  const walk = (p: gmail_v1.Schema$MessagePart) => {
    if (p.filename) {
      attachments++;
      meta.push(`${h(p.filename)}:${p.body?.size ?? 0}`);
    }
    for (const c of p.parts ?? []) walk(c);
  };
  if (m.payload) walk(m.payload);
  return { attachments, fingerprint: h(meta.sort().join("|")) };
}
export function semanticFingerprint(x: {
  messageId?: string;
  date?: string;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  size?: number;
  attachments?: string;
}) {
  return h(
    [x.messageId, x.date, x.from, x.to, x.cc, x.subject, String(x.size ?? 0), x.attachments].join(
      "\n",
    ),
  );
}
export function retryDelay(attempt: number) {
  return Math.min(64_000, 2 ** Math.min(attempt, 6) * 1000) + randomInt(0, 1001);
}
export function isRetryable(e: any) {
  const code = Number(e?.code ?? e?.response?.status ?? 0),
    reason = e?.response?.data?.error?.errors?.[0]?.reason ?? "";
  return (
    [429, 500, 502, 503, 504].includes(code) ||
    (code === 403 &&
      ["rateLimitExceeded", "userRateLimitExceeded", "backendError"].includes(reason)) ||
    ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(e?.code)
  );
}
export async function withRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, error: string) => void,
  maxAttempts = 5,
): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryable(e) || attempt === maxAttempts - 1) throw e;
      onRetry?.(attempt + 1, redact(e));
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    }
  }
  throw last;
}
export async function discoverGmail(
  db: LifeboatDatabase,
  input: {
    runId: string;
    sourceSubject: string;
    destinationSubject: string;
    query?: string;
    includeDrafts: boolean;
    method: "insert" | "import";
  },
  onProgress?: (x: any) => void,
) {
  const api = google.gmail({ version: "v1", auth: await authFor("source") }),
    query = `${input.query?.trim() || "-in:spam -in:trash"} -in:drafts`;
  let token: string | undefined,
    count = 0;
  do {
    const r = await withRetry(
      () =>
        api.users.messages.list({
          userId: "me",
          maxResults: 500,
          pageToken: token,
          q: query,
          includeSpamTrash: false,
        }),
      (attempt) => onProgress?.({ operation: "Retrying Gmail message list", attempt }),
    );
    for (const ref of r.data.messages ?? []) {
      if (!ref.id) continue;
      const m = (
          await withRetry(
            async () =>
              await (api.users.messages.get as any)({
                userId: "me",
                id: ref.id,
                format: "metadata",
                metadataHeaders: ["Message-ID", "Date", "From", "To", "Cc", "Subject"],
              }),
            (attempt) =>
              onProgress?.({
                operation: "Retrying Gmail message metadata",
                attempt,
                discovered: count,
              }),
          )
        ).data,
        p = parts(m);
      db.upsertGmailMessage({
        runId: input.runId,
        sourceSubject: input.sourceSubject,
        destinationSubject: input.destinationSubject,
        sourceMessageId: m.id,
        sourceThreadId: m.threadId,
        internalDate: m.internalDate,
        rfcMessageIdHash: h(header(m, "Message-ID")),
        dateHash: h(header(m, "Date")),
        fromDomain: fromDomain(header(m, "From")),
        subjectHash: h(header(m, "Subject")),
        sizeEstimate: m.sizeEstimate,
        attachmentCount: p.attachments,
        attachmentFingerprint: p.fingerprint,
        sourceLabels: m.labelIds ?? [],
        method: input.method,
      });
      count++;
      onProgress?.({ operation: "Discovering messages", discovered: count });
    }
    token = r.data.nextPageToken ?? undefined;
  } while (token);
  if (input.includeDrafts) {
    let dToken: string | undefined;
    do {
      const r = await withRetry(
        () =>
          api.users.drafts.list({
            userId: "me",
            maxResults: 500,
            pageToken: dToken,
          }),
        (attempt) => onProgress?.({ operation: "Retrying Gmail draft list", attempt }),
      );
      for (const d of r.data.drafts ?? []) {
        if (!d.id) continue;
        const full = (
            await withRetry(
              async () =>
                await (api.users.drafts.get as any)({
                  userId: "me",
                  id: d.id,
                  format: "metadata",
                }),
              (attempt) =>
                onProgress?.({
                  operation: "Retrying Gmail draft metadata",
                  attempt,
                  discovered: count,
                }),
            )
          ).data,
          m = full.message;
        if (!m?.id) continue;
        const p = parts(m);
        db.upsertGmailMessage({
          runId: input.runId,
          sourceSubject: input.sourceSubject,
          destinationSubject: input.destinationSubject,
          sourceMessageId: `draft:${d.id}`,
          sourceDraftId: d.id,
          sourceThreadId: m.threadId,
          internalDate: m.internalDate,
          rfcMessageIdHash: h(header(m, "Message-ID")),
          dateHash: h(header(m, "Date")),
          fromDomain: fromDomain(header(m, "From")),
          subjectHash: h(header(m, "Subject")),
          sizeEstimate: m.sizeEstimate,
          attachmentCount: p.attachments,
          attachmentFingerprint: p.fingerprint,
          sourceLabels: ["DRAFT"],
          method: "draft",
        });
        count++;
      }
      dToken = r.data.nextPageToken ?? undefined;
    } while (dToken);
  }
  return { count, query };
}
function fromDomain(v: string) {
  const m = v.match(/@([\w.-]+)/);
  return m?.[1]?.toLowerCase() ?? "";
}
function rawHeader(raw: string, name: string) {
  const text = Buffer.from(raw, "base64url").subarray(0, 65536).toString("utf8"),
    head = text.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, " "),
    line = head
      .split(/\r?\n/)
      .find((x) => x.slice(0, x.indexOf(":")).toLowerCase() === name.toLowerCase());
  return line?.slice(line.indexOf(":") + 1).trim() ?? "";
}
const DIRECT_SYSTEM = new Set(["INBOX", "UNREAD", "STARRED", "IMPORTANT"]);
const STATE_NAMES: Record<string, string> = {
  SENT: "Sent",
  SPAM: "Spam Archive",
  TRASH: "Trash Archive",
  DRAFT: "Drafts",
  CATEGORY_PERSONAL: "Category Personal",
  CATEGORY_SOCIAL: "Category Social",
  CATEGORY_PROMOTIONS: "Category Promotions",
  CATEGORY_UPDATES: "Category Updates",
  CATEGORY_FORUMS: "Category Forums",
};
export async function ensureLabels(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
) {
  const source = google.gmail({ version: "v1", auth: await authFor("source") }),
    dest = google.gmail({ version: "v1", auth: await authFor("destination") }),
    [s, d] = await Promise.all([
      source.users.labels.list({ userId: "me" }),
      dest.users.labels.list({ userId: "me" }),
    ]);
  const existing = new Map((d.data.labels ?? []).map((x) => [x.name?.toLowerCase(), x.id!]));
  for (const label of s.data.labels ?? []) {
    if (!label.id || !label.name) continue;
    if (DIRECT_SYSTEM.has(label.id)) {
      db.upsertLabelMap({
        sourceSubject,
        destinationSubject,
        sourceId: label.id,
        sourceName: label.name,
        destinationId: label.id,
        destinationName: label.name,
        status: "mapped",
      });
      continue;
    }
    const target = `Cornerstone Import/${STATE_NAMES[label.id] ?? label.name}`;
    let id = existing.get(target.toLowerCase());
    if (!id) {
      try {
        const made = await dest.users.labels.create({
          userId: "me",
          requestBody: {
            name: target,
            labelListVisibility: label.labelListVisibility ?? "labelShow",
            messageListVisibility: label.messageListVisibility ?? "show",
          },
        });
        id = made.data.id!;
        existing.set(target.toLowerCase(), id);
      } catch (e) {
        db.upsertLabelMap({
          sourceSubject,
          destinationSubject,
          sourceId: label.id,
          sourceName: label.name,
          destinationName: target,
          status: "failed",
          error: redact(e),
        });
        continue;
      }
    }
    db.upsertLabelMap({
      sourceSubject,
      destinationSubject,
      sourceId: label.id,
      sourceName: label.name,
      destinationId: id,
      destinationName: target,
      status: "mapped",
    });
  }
  return db.labelMaps(sourceSubject, destinationSubject);
}
export class GmailRunner {
  private stopped = false;
  pause() {
    this.stopped = true;
  }
  async run(
    db: LifeboatDatabase,
    runId: string,
    sourceSubject: string,
    destinationSubject: string,
    archivePath: string | undefined,
    onProgress: (x: any) => void,
  ) {
    this.stopped = false;
    const source = google.gmail({
        version: "v1",
        auth: await authFor("source"),
      }),
      dest = google.gmail({
        version: "v1",
        auth: await authFor("destination"),
      }),
      maps = new Map(
        db
          .labelMaps(sourceSubject, destinationSubject)
          .filter((x) => x.destination_label_id)
          .map((x) => [x.source_label_id, x.destination_label_id]),
      );
    let done = 0;
    while (!this.stopped) {
      const rows = db.nextGmail(2, sourceSubject, destinationSubject, runId);
      if (!rows.length) break;
      for (const row of rows) {
        if (this.stopped) break;
        if (row.destination_message_id) {
          db.verifyGmailMessage(row.id, true, { recoveredPair: true });
          continue;
        }
        if (!db.startGmailMessage(row.id)) continue;
        try {
          const isDraft = !!row.source_draft_id;
          const rawMsg = isDraft
            ? (
                await source.users.drafts.get({
                  userId: "me",
                  id: row.source_draft_id,
                  format: "raw",
                })
              ).data.message
            : (
                await source.users.messages.get({
                  userId: "me",
                  id: row.source_message_id,
                  format: "raw",
                })
              ).data;
          if (!rawMsg?.raw) throw new Error("Source did not return RAW MIME");
          const raw = rawMsg.raw,
            rawSha = rawHash(raw),
            fingerprint = semanticFingerprint({
              messageId: row.rfc_message_id_hash,
              date: row.date_hash,
              from: row.from_domain,
              subject: row.subject_hash,
              size: row.size_estimate,
              attachments: row.attachment_fingerprint,
            });
          if (!isDraft) {
            const messageId = rawHeader(raw, "Message-ID");
            if (messageId) {
              const candidates = await dest.users.messages.list({
                userId: "me",
                q: `rfc822msgid:${messageId}`,
                maxResults: 10,
              });
              const matches: gmail_v1.Schema$Message[] = [];
              for (const c of candidates.data.messages ?? []) {
                if (!c.id) continue;
                const m = (
                  await dest.users.messages.get({
                    userId: "me",
                    id: c.id,
                    format: "metadata",
                    metadataHeaders: ["Message-ID", "Date", "From", "Subject"],
                  })
                ).data;
                if (
                  h(header(m, "Message-ID")) === row.rfc_message_id_hash &&
                  h(header(m, "Date")) === row.date_hash &&
                  fromDomain(header(m, "From")) === row.from_domain &&
                  h(header(m, "Subject")) === row.subject_hash
                )
                  matches.push(m);
              }
              if (matches.length === 1 && matches[0].id) {
                db.completeGmailMessage(row.id, {
                  destinationMessageId: matches[0].id,
                  destinationThreadId: matches[0].threadId ?? undefined,
                  rawSha256: rawSha,
                  fingerprint,
                  destinationLabels: matches[0].labelIds ?? [],
                });
                db.verifyGmailMessage(row.id, true, {
                  recoveredAfterUncertainInsert: true,
                  matchedBy: ["Message-ID", "Date", "From domain", "Subject"],
                });
                done++;
                onProgress({
                  operation: "Recovered existing destination copy",
                  processed: done,
                  stats: db.gmailStats(),
                });
                continue;
              }
              if (matches.length > 1) {
                db.failGmailMessage(
                  row.id,
                  false,
                  "ambiguous-duplicate",
                  "Multiple destination messages match independent metadata",
                );
                continue;
              }
            }
          }
          if (archivePath)
            await archiveRaw(archivePath, row.source_message_id, row.internal_date, raw, rawSha);
          if (Buffer.from(raw, "base64url").byteLength > 35 * 1024 * 1024) {
            db.failGmailMessage(
              row.id,
              false,
              "over-upload-limit",
              "Raw message exceeds the documented Gmail API upload limit; preserve it in the optional archive",
            );
            continue;
          }
          if (isDraft) {
            const created = await dest.users.drafts.create({
              userId: "me",
              requestBody: { message: { raw } },
            });
            if (!created.data.id || !created.data.message?.id)
              throw new Error("Destination draft did not return IDs");
            db.completeGmailMessage(row.id, {
              destinationMessageId: created.data.message.id,
              destinationThreadId: created.data.message.threadId ?? undefined,
              rawSha256: rawSha,
              fingerprint,
              destinationLabels: ["DRAFT"],
            });
            const verify = (
              await dest.users.drafts.get({
                userId: "me",
                id: created.data.id,
                format: "metadata",
              })
            ).data;
            db.verifyGmailMessage(row.id, !!verify.message?.labelIds?.includes("DRAFT"), {
              draftId: created.data.id,
              stillDraft: verify.message?.labelIds?.includes("DRAFT"),
            });
          } else {
            const labelIds = (JSON.parse(row.source_labels_json) as string[])
              .map((x) => maps.get(x))
              .filter(Boolean) as string[];
            const created =
              row.method === "import"
                ? await dest.users.messages.import({
                    userId: "me",
                    internalDateSource: "dateHeader",
                    neverMarkSpam: true,
                    processForCalendar: false,
                    requestBody: { raw, labelIds },
                  })
                : await dest.users.messages.insert({
                    userId: "me",
                    internalDateSource: "dateHeader",
                    requestBody: { raw, labelIds },
                  });
            if (!created.data.id) throw new Error("Destination insert did not return a message ID");
            db.completeGmailMessage(row.id, {
              destinationMessageId: created.data.id,
              destinationThreadId: created.data.threadId ?? undefined,
              rawSha256: rawSha,
              fingerprint,
              destinationLabels: labelIds,
            });
            const v = (
                await dest.users.messages.get({
                  userId: "me",
                  id: created.data.id,
                  format: "metadata",
                  metadataHeaders: ["Message-ID", "Date", "From", "Subject"],
                })
              ).data,
              att = parts(v),
              details = {
                messageId: h(header(v, "Message-ID")) === row.rfc_message_id_hash,
                dateHeader: h(header(v, "Date")) === row.date_hash,
                fromDomain: fromDomain(header(v, "From")) === row.from_domain,
                subject: h(header(v, "Subject")) === row.subject_hash,
                attachments: att.attachments === row.attachment_count,
                internalDateDelta: Math.abs(
                  Number(v.internalDate ?? 0) - Number(row.internal_date ?? 0),
                ),
              };
            db.verifyGmailMessage(
              row.id,
              Object.values(details).every((x, i) =>
                i === 5 ? Number(x) <= 86400000 : x === true,
              ),
              details,
            );
          }
          done++;
          onProgress({
            operation: "Copying and verifying",
            processed: done,
            stats: db.gmailStats(),
          });
        } catch (e: any) {
          const retryable = isRetryable(e),
            attempt = row.attempts + 1;
          db.failGmailMessage(
            row.id,
            retryable && attempt < 8,
            String(e?.code ?? "unknown"),
            redact(e),
            retryable ? new Date(Date.now() + retryDelay(attempt)).toISOString() : undefined,
          );
        }
      }
    }
    return { paused: this.stopped, stats: db.gmailStats() };
  }
}
async function archiveRaw(
  root: string,
  sourceId: string,
  internalDate: string,
  raw: string,
  sha: string,
) {
  const d = new Date(Number(internalDate) || Date.now()),
    dir = path.join(
      root,
      "gmail-archive",
      String(d.getUTCFullYear()),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
    );
  await mkdir(dir, { recursive: true });
  const safe = sourceId.replace(/[^A-Za-z0-9_-]/g, "_"),
    final = path.join(dir, `${safe}.eml`);
  try {
    const s = await stat(final);
    if (s.size > 0) return;
  } catch {}
  const temp = `${final}.${process.pid}.tmp`;
  await writeFile(temp, Buffer.from(raw, "base64url"), { flag: "wx" });
  await rename(temp, final);
  await writeFile(`${final}.sha256`, sha, { flag: "wx" }).catch(() => {});
}
export async function cleanupArchiveTemps(root: string) {
  if (!root) return 0;
  const base = path.resolve(root, "gmail-archive");
  let removed = 0;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.resolve(dir, e.name);
      if (!full.startsWith(base + path.sep)) continue;
      if (e.isDirectory()) await walk(full);
      else if (/\.\d+\.tmp$/.test(e.name)) {
        await unlink(full).catch(() => {});
        removed++;
      }
    }
  }
  await walk(base);
  return removed;
}
export async function updateVacation(destination: string, subject: string, body: string) {
  const api = google.gmail({ version: "v1", auth: await authFor("source") });
  return (
    await api.users.settings.updateVacation({
      userId: "me",
      requestBody: {
        enableAutoReply: true,
        responseSubject: subject,
        responseBodyPlainText: body.replaceAll("{destination}", destination),
        restrictToContacts: false,
        restrictToDomain: false,
      },
    })
  ).data;
}
export async function forwardingAudit() {
  const api = google.gmail({ version: "v1", auth: await authFor("source") });
  const [forwarding, vacation] = await Promise.all([
    api.users.settings.getAutoForwarding({ userId: "me" }),
    api.users.settings.getVacation({ userId: "me" }),
  ]);
  return {
    autoForwarding: forwarding.data,
    vacation: {
      enabled: vacation.data.enableAutoReply,
      endTime: vacation.data.endTime,
    },
    creationSupported: false,
    reason:
      "Google restricts forwardingAddresses.create to service accounts with domain-wide delegation. Lifeboat does not request that authority.",
  };
}
export async function verifyGmailAggregate(
  db: LifeboatDatabase,
  sourceSubject: string,
  destinationSubject: string,
) {
  const api = google.gmail({ version: "v1", auth: await authFor("destination") }),
    maps = new Map(
      db.labelMaps(sourceSubject, destinationSubject).map((x) => [x.source_label_id, x]),
    ),
    counts = db.gmailLabelCounts(sourceSubject, destinationSubject),
    perLabel = [];
  for (const c of counts) {
    const map = maps.get(c.source_label_id);
    if (!map?.destination_label_id) {
      perLabel.push({ sourceLabel: c.source_label_id, migrated: c.count, status: "unmapped" });
      continue;
    }
    try {
      const l = await api.users.labels.get({ userId: "me", id: map.destination_label_id });
      perLabel.push({
        sourceLabel: c.source_label_id,
        destinationLabel: map.destination_name,
        migrated: c.count,
        destinationTotal: l.data.messagesTotal ?? 0,
        status: (l.data.messagesTotal ?? 0) >= c.count ? "verified" : "mismatch",
      });
    } catch (e) {
      perLabel.push({
        sourceLabel: c.source_label_id,
        migrated: c.count,
        status: "error",
        error: redact(e),
      });
    }
  }
  const stats = db.gmailStats(),
    problems = perLabel.filter((x) => x.status !== "verified").length;
  return {
    status: (stats.failed ?? 0) > 0 || problems > 0 ? "verified-with-limitations" : "verified",
    pairedVerified: stats.verified,
    failed: stats.failed,
    perLabel,
  };
}
