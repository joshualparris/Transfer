import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { AccountSummary, InventorySnapshot, ItemStatus } from "./types";
export class LifeboatDatabase {
  private db: Database.Database;
  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.ensureColumns();
    this.recover();
  }
  private migrate() {
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS accounts(role TEXT PRIMARY KEY CHECK(role IN ('source','destination')),email TEXT NOT NULL,scopes_json TEXT NOT NULL,connected_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS inventory_runs(id TEXT PRIMARY KEY,account TEXT NOT NULL,created_at TEXT NOT NULL,snapshot_json TEXT NOT NULL);CREATE TABLE IF NOT EXISTS migration_items(id TEXT PRIMARY KEY,module TEXT NOT NULL,source_account TEXT NOT NULL,destination_account TEXT NOT NULL,source_item_id TEXT NOT NULL,destination_item_id TEXT,source_parent TEXT,destination_parent TEXT,source_modified_at TEXT,size INTEGER,fingerprint TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,last_error TEXT,created_at TEXT NOT NULL,completed_at TEXT,verification_status TEXT,UNIQUE(module,source_account,destination_account,source_item_id));CREATE INDEX IF NOT EXISTS idx_items_status_retry ON migration_items(status,next_attempt_at);CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,action TEXT NOT NULL,details_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS drive_manifest(source_id TEXT PRIMARY KEY,name TEXT NOT NULL,mime_type TEXT NOT NULL,parent_ids_json TEXT NOT NULL,resolved_path TEXT NOT NULL,relative_path TEXT NOT NULL,size INTEGER,created_time TEXT,modified_time TEXT,md5 TEXT,is_native INTEGER NOT NULL,is_folder INTEGER NOT NULL,is_shortcut INTEGER NOT NULL,shortcut_target_id TEXT,owned INTEGER NOT NULL,owner_name TEXT,owner_email TEXT,shared INTEGER NOT NULL,trashed INTEGER NOT NULL,export_extension TEXT,can_download INTEGER,can_copy INTEGER,permissions_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'discovered',verification TEXT,last_error TEXT,updated_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_drive_status ON drive_manifest(status);CREATE INDEX IF NOT EXISTS idx_drive_shared ON drive_manifest(shared);
CREATE TABLE IF NOT EXISTS backup_jobs(id TEXT PRIMARY KEY,type TEXT NOT NULL,status TEXT NOT NULL,source_remote TEXT NOT NULL,destination TEXT NOT NULL,rclone_path TEXT NOT NULL,rclone_version TEXT NOT NULL,args_json TEXT NOT NULL,progress_json TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,last_error TEXT,verification_json TEXT,UNIQUE(type,destination,status));CREATE INDEX IF NOT EXISTS idx_jobs_status ON backup_jobs(status);
CREATE TABLE IF NOT EXISTS backup_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,created_at TEXT NOT NULL,line TEXT NOT NULL,FOREIGN KEY(job_id) REFERENCES backup_jobs(id));CREATE TABLE IF NOT EXISTS gmail_runs(id TEXT PRIMARY KEY,status TEXT NOT NULL,source_subject TEXT NOT NULL,source_email TEXT NOT NULL,destination_subject TEXT NOT NULL,destination_email TEXT NOT NULL,query TEXT NOT NULL,method TEXT NOT NULL,include_drafts INTEGER NOT NULL,archive_path TEXT,progress_json TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,last_error TEXT);CREATE TABLE IF NOT EXISTS gmail_messages(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,source_message_id TEXT NOT NULL,source_thread_id TEXT,destination_message_id TEXT,destination_thread_id TEXT,source_draft_id TEXT,destination_draft_id TEXT,rfc_message_id_hash TEXT,internal_date TEXT,date_hash TEXT,from_domain TEXT,subject_hash TEXT,size_estimate INTEGER,raw_sha256 TEXT,semantic_fingerprint TEXT,attachment_count INTEGER,attachment_fingerprint TEXT,source_labels_json TEXT NOT NULL,destination_labels_json TEXT NOT NULL,method TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,last_error_code TEXT,last_error TEXT,created_at TEXT NOT NULL,started_at TEXT,completed_at TEXT,verification_status TEXT,verification_json TEXT NOT NULL,UNIQUE(source_subject,destination_subject,source_message_id));CREATE INDEX IF NOT EXISTS idx_gmail_status ON gmail_messages(status,next_attempt_at);CREATE TABLE IF NOT EXISTS gmail_label_map(source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,source_label_id TEXT NOT NULL,source_name TEXT NOT NULL,destination_label_id TEXT,destination_name TEXT NOT NULL,status TEXT NOT NULL,last_error TEXT,PRIMARY KEY(source_subject,destination_subject,source_label_id));CREATE TABLE IF NOT EXISTS gmail_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,created_at TEXT NOT NULL,event TEXT NOT NULL,details_json TEXT NOT NULL);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS contacts_runs(id TEXT PRIMARY KEY,source_subject TEXT NOT NULL,source_email_at_inventory TEXT NOT NULL,destination_subject TEXT NOT NULL,destination_email TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT,filter_settings_json TEXT NOT NULL,verification_json TEXT NOT NULL,last_error TEXT);
CREATE TABLE IF NOT EXISTS contacts_manifest(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,source_resource_name TEXT NOT NULL,destination_resource_name TEXT,source_etag TEXT,source_type TEXT NOT NULL,semantic_fingerprint TEXT NOT NULL,field_presence_json TEXT NOT NULL,group_memberships_json TEXT NOT NULL,photo_present INTEGER NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,last_error_code TEXT,redacted_last_error TEXT,created_at TEXT NOT NULL,copied_at TEXT,verification_status TEXT,verification_json TEXT NOT NULL,UNIQUE(source_subject,destination_subject,source_resource_name));CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts_manifest(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS contact_group_map(run_id TEXT NOT NULL,source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,source_group_resource TEXT NOT NULL,source_group_name_hash TEXT NOT NULL,destination_group_resource TEXT,destination_group_name TEXT NOT NULL,group_type TEXT NOT NULL,status TEXT NOT NULL,verification_status TEXT,PRIMARY KEY(source_subject,destination_subject,source_group_resource));
CREATE TABLE IF NOT EXISTS other_contacts_manifest(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,source_resource_name TEXT NOT NULL,semantic_fingerprint TEXT NOT NULL,available_fields_json TEXT NOT NULL,selected_for_conversion INTEGER NOT NULL,destination_resource_name TEXT,status TEXT NOT NULL,verification_status TEXT,UNIQUE(source_subject,destination_subject,source_resource_name));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS calendar_runs_v2(id TEXT PRIMARY KEY,source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT,last_error TEXT);
CREATE TABLE IF NOT EXISTS calendar_map_v2(source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,source_calendar_id TEXT NOT NULL,source_name TEXT NOT NULL,destination_calendar_id TEXT,status TEXT NOT NULL,PRIMARY KEY(source_subject,destination_subject,source_calendar_id));
CREATE TABLE IF NOT EXISTS calendar_events_v2(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,source_subject TEXT NOT NULL,destination_subject TEXT NOT NULL,source_calendar_id TEXT NOT NULL,source_event_id TEXT NOT NULL,destination_calendar_id TEXT,destination_event_id TEXT,ical_uid TEXT,summary_hash TEXT,start_json TEXT NOT NULL,end_json TEXT NOT NULL,recurrence_json TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,verification_status TEXT,UNIQUE(source_subject,destination_subject,source_calendar_id,source_event_id));CREATE INDEX IF NOT EXISTS idx_calendar_events_v2_status ON calendar_events_v2(status);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS operation_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL,module TEXT NOT NULL,level TEXT NOT NULL,message TEXT NOT NULL,details_json TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_operation_logs_time ON operation_logs(created_at DESC);CREATE INDEX IF NOT EXISTS idx_operation_logs_module ON operation_logs(module,created_at DESC);`);
  }
  private ensureColumns() {
    try {
      this.db.exec("ALTER TABLE accounts ADD COLUMN subject TEXT");
    } catch {}
  }
  private recover() {
    this.db
      .prepare(
        "UPDATE migration_items SET status='failed-retryable',last_error='Recovered after interrupted copy' WHERE status='copying'",
      )
      .run();
    this.db
      .prepare(
        "UPDATE migration_items SET status='copied',last_error='Recovered before verification completed' WHERE status='verifying'",
      )
      .run();
    this.db
      .prepare(
        "UPDATE backup_jobs SET status='interrupted',finished_at=?,last_error='Application closed while rclone was running' WHERE status IN ('running','verifying')",
      )
      .run(new Date().toISOString());
    this.db
      .prepare(
        "UPDATE gmail_runs SET status='interrupted',finished_at=?,last_error='Application closed during Gmail work' WHERE status IN ('running','verifying')",
      )
      .run(new Date().toISOString());
    this.db
      .prepare(
        "UPDATE gmail_messages SET status='failed-retryable',last_error='Recovered after interruption' WHERE status IN ('copying','verifying')",
      )
      .run();
    this.db.prepare("UPDATE contacts_manifest SET status='failed-retryable',redacted_last_error='Recovered after interruption' WHERE status IN ('copying','verifying')").run();
    this.db.prepare("UPDATE contacts_runs SET status='interrupted',completed_at=? WHERE status IN ('running','verifying')").run(new Date().toISOString());
    this.db.prepare("UPDATE calendar_events_v2 SET status='failed-retryable',last_error='Recovered after interruption' WHERE status IN ('copying','verifying')").run();
    this.db.prepare("UPDATE calendar_runs_v2 SET status='interrupted',completed_at=? WHERE status='running'").run(new Date().toISOString());
  }
  close() {
    this.db.close();
  }
  setting<T>(k: string, f: T): T {
    const r = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(k) as any;
    return r ? JSON.parse(r.value) : f;
  }
  setSetting(k: string, v: unknown) {
    this.db
      .prepare(
        "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(k, JSON.stringify(v));
  }
  saveAccount(a: AccountSummary) {
    this.db
      .prepare(
        "INSERT INTO accounts(role,email,scopes_json,connected_at,subject) VALUES(?,?,?,?,?) ON CONFLICT(role) DO UPDATE SET email=excluded.email,scopes_json=excluded.scopes_json,connected_at=excluded.connected_at,subject=excluded.subject",
      )
      .run(
        a.role,
        a.email,
        JSON.stringify(a.scopes),
        a.connectedAt,
        a.subject ?? null,
      );
  }
  removeAccount(r: string) {
    this.db.prepare("DELETE FROM accounts WHERE role=?").run(r);
  }
  accounts(): AccountSummary[] {
    return (
      this.db
        .prepare("SELECT * FROM accounts ORDER BY role DESC")
        .all() as any[]
    ).map((r) => ({
      role: r.role,
      email: r.email,
      subject: r.subject ?? undefined,
      scopes: JSON.parse(r.scopes_json),
      connectedAt: r.connected_at,
    }));
  }
  saveInventory(s: InventorySnapshot) {
    this.db
      .prepare("INSERT INTO inventory_runs VALUES(?,?,?,?)")
      .run(s.runId, s.account, s.createdAt, JSON.stringify(s));
  }
  latestInventory(): InventorySnapshot | null {
    const r = this.db
      .prepare(
        "SELECT snapshot_json FROM inventory_runs ORDER BY created_at DESC LIMIT 1",
      )
      .get() as any;
    return r ? JSON.parse(r.snapshot_json) : null;
  }
  queueCounts() {
    return Object.fromEntries(
      (
        this.db
          .prepare(
            "SELECT status,count(*) count FROM migration_items GROUP BY status",
          )
          .all() as any[]
      ).map((r) => [r.status, r.count]),
    );
  }
  enqueue(x: {
    module: string;
    sourceAccount: string;
    destinationAccount: string;
    sourceItemId: string;
    sourceParent?: string;
    size?: number;
    fingerprint?: string;
  }) {
    const id = randomUUID(),
      now = new Date().toISOString(),
      r = this.db
        .prepare(
          `INSERT OR IGNORE INTO migration_items(id,module,source_account,destination_account,source_item_id,source_parent,size,fingerprint,status,created_at)VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          x.module,
          x.sourceAccount,
          x.destinationAccount,
          x.sourceItemId,
          x.sourceParent ?? null,
          x.size ?? null,
          x.fingerprint ?? null,
          "discovered",
          now,
        );
    return { id, inserted: r.changes === 1 };
  }
  transition(
    id: string,
    from: ItemStatus,
    to: ItemStatus,
    f: { destinationId?: string; error?: string; verification?: string } = {},
  ) {
    const done = ["verified", "skipped", "failed-permanent"].includes(to)
      ? new Date().toISOString()
      : null;
    return (
      this.db
        .prepare(
          "UPDATE migration_items SET status=?,destination_item_id=COALESCE(?,destination_item_id),last_error=?,verification_status=COALESCE(?,verification_status),attempts=attempts+?,completed_at=? WHERE id=? AND status=?",
        )
        .run(
          to,
          f.destinationId ?? null,
          f.error?.slice(0, 500) ?? null,
          f.verification ?? null,
          to === "copying" ? 1 : 0,
          done,
          id,
          from,
        ).changes === 1
    );
  }
  exportRows() {
    return this.db
      .prepare("SELECT * FROM migration_items ORDER BY created_at")
      .all();
  }
  upsertDrive(x: any) {
    this.db
      .prepare(
        `INSERT INTO drive_manifest(source_id,name,mime_type,parent_ids_json,resolved_path,relative_path,size,created_time,modified_time,md5,is_native,is_folder,is_shortcut,shortcut_target_id,owned,owner_name,owner_email,shared,trashed,export_extension,can_download,can_copy,permissions_json,status,updated_at)VALUES(@sourceId,@name,@mimeType,@parents,@resolvedPath,@relativePath,@size,@createdTime,@modifiedTime,@md5,@isNative,@isFolder,@isShortcut,@shortcutTarget,@owned,@ownerName,@ownerEmail,@shared,@trashed,@exportExtension,@canDownload,@canCopy,@permissions,'discovered',@updatedAt)ON CONFLICT(source_id)DO UPDATE SET name=excluded.name,mime_type=excluded.mime_type,parent_ids_json=excluded.parent_ids_json,resolved_path=excluded.resolved_path,relative_path=excluded.relative_path,size=excluded.size,modified_time=excluded.modified_time,md5=excluded.md5,updated_at=excluded.updated_at`,
      )
      .run(x);
  }
  markDriveCopyComplete() {
    this.db
      .prepare(
        "UPDATE drive_manifest SET status=CASE WHEN can_download=0 THEN 'manual-action-required' ELSE 'copied' END,last_error=CASE WHEN can_download=0 THEN 'Source API reports download prohibited' ELSE NULL END,updated_at=? WHERE status IN ('discovered','failed-retryable')",
      )
      .run(new Date().toISOString());
  }
  markDriveVerified(method: string) {
    this.db
      .prepare(
        "UPDATE drive_manifest SET status='verified',verification=?,updated_at=? WHERE status='copied'",
      )
      .run(method, new Date().toISOString());
  }
  drivePage(offset = 0, limit = 100, sharedOnly = false) {
    const where = sharedOnly ? "WHERE shared=1" : "";
    return this.db
      .prepare(
        `SELECT * FROM drive_manifest ${where} ORDER BY relative_path LIMIT ? OFFSET ?`,
      )
      .all(limit, offset);
  }
  driveStats() {
    return this.db
      .prepare(
        `SELECT count(*) discovered,sum(CASE WHEN is_native=1 THEN 1 ELSE 0 END) native,sum(CASE WHEN shared=1 THEN 1 ELSE 0 END) shared,sum(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified,sum(CASE WHEN status LIKE 'failed%' THEN 1 ELSE 0 END) failed,coalesce(sum(size),0) bytes FROM drive_manifest`,
      )
      .get() as any;
  }
  startJob(x: {
    type: string;
    remote: string;
    destination: string;
    rclonePath: string;
    version: string;
    args: string[];
  }) {
    const conflict = this.db
      .prepare(
        "SELECT id FROM backup_jobs WHERE destination=? AND status IN ('running','verifying')",
      )
      .get(x.destination);
    if (conflict)
      throw new Error(
        "A backup or verification is already active for this destination",
      );
    const id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO backup_jobs(id,type,status,source_remote,destination,rclone_path,rclone_version,args_json,progress_json,started_at)VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        x.type,
        "running",
        x.remote,
        x.destination,
        x.rclonePath,
        x.version,
        JSON.stringify(x.args),
        JSON.stringify({}),
        now,
      );
    return id;
  }
  updateJob(
    id: string,
    status: string,
    progress: unknown,
    error?: string,
    verification?: unknown,
  ) {
    const done = [
      "complete",
      "failed",
      "paused",
      "interrupted",
      "verified",
      "verified-with-limitations",
    ].includes(status)
      ? new Date().toISOString()
      : null;
    this.db
      .prepare(
        "UPDATE backup_jobs SET status=?,progress_json=?,last_error=?,verification_json=COALESCE(?,verification_json),finished_at=COALESCE(?,finished_at) WHERE id=?",
      )
      .run(
        status,
        JSON.stringify(progress),
        error?.slice(0, 500) ?? null,
        verification ? JSON.stringify(verification) : null,
        done,
        id,
      );
  }
  log(id: string, line: string) {
    this.db
      .prepare("INSERT INTO backup_logs(job_id,created_at,line)VALUES(?,?,?)")
      .run(id, new Date().toISOString(), line.slice(0, 1000));
  }
  jobs() {
    return (
      this.db
        .prepare("SELECT * FROM backup_jobs ORDER BY started_at DESC LIMIT 25")
        .all() as any[]
    ).map((x) => ({
      ...x,
      args: JSON.parse(x.args_json),
      progress: JSON.parse(x.progress_json),
      verification: x.verification_json
        ? JSON.parse(x.verification_json)
        : null,
    }));
  }
  startGmailRun(x: {
    sourceSubject: string;
    sourceEmail: string;
    destinationSubject: string;
    destinationEmail: string;
    query: string;
    method: string;
    includeDrafts: boolean;
    archivePath?: string;
  }) {
    if (
      this.db
        .prepare(
          "SELECT 1 FROM gmail_runs WHERE destination_subject=? AND status IN ('running','verifying')",
        )
        .get(x.destinationSubject)
    )
      throw new Error(
        "A Gmail migration is already active for this destination",
      );
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO gmail_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        "running",
        x.sourceSubject,
        x.sourceEmail,
        x.destinationSubject,
        x.destinationEmail,
        x.query,
        x.method,
        x.includeDrafts ? 1 : 0,
        x.archivePath ?? null,
        "{}",
        new Date().toISOString(),
        null,
        null,
      );
    return id;
  }
  updateGmailRun(
    id: string,
    status: string,
    progress: unknown,
    error?: string,
  ) {
    const done = [
      "complete",
      "paused",
      "failed",
      "interrupted",
      "verified",
      "verified-with-limitations",
    ].includes(status)
      ? new Date().toISOString()
      : null;
    this.db
      .prepare(
        "UPDATE gmail_runs SET status=?,progress_json=?,last_error=?,finished_at=COALESCE(?,finished_at) WHERE id=?",
      )
      .run(
        status,
        JSON.stringify(progress),
        error?.slice(0, 500) ?? null,
        done,
        id,
      );
  }
  gmailRuns() {
    return (
      this.db
        .prepare("SELECT * FROM gmail_runs ORDER BY started_at DESC LIMIT 20")
        .all() as any[]
    ).map((x) => ({ ...x, progress: JSON.parse(x.progress_json) }));
  }
  upsertGmailMessage(x: any) {
    const id = randomUUID(),
      r = this.db
        .prepare(
          `INSERT OR IGNORE INTO gmail_messages(id,run_id,source_subject,destination_subject,source_message_id,source_thread_id,source_draft_id,rfc_message_id_hash,internal_date,date_hash,from_domain,subject_hash,size_estimate,attachment_count,attachment_fingerprint,source_labels_json,destination_labels_json,method,status,created_at,verification_json)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          x.runId,
          x.sourceSubject,
          x.destinationSubject,
          x.sourceMessageId,
          x.sourceThreadId ?? null,
          x.sourceDraftId ?? null,
          x.rfcMessageIdHash ?? null,
          x.internalDate ?? null,
          x.dateHash ?? null,
          x.fromDomain ?? null,
          x.subjectHash ?? null,
          x.sizeEstimate ?? null,
          x.attachmentCount ?? 0,
          x.attachmentFingerprint ?? null,
          JSON.stringify(x.sourceLabels ?? []),
          "[]",
          x.method,
          "discovered",
          new Date().toISOString(),
          "{}",
        );
    return { id, inserted: r.changes === 1 };
  }
  nextGmail(limit = 3,sourceSubject?:string,destinationSubject?:string) {
    const identity=sourceSubject&&destinationSubject?' AND source_subject=? AND destination_subject=?':'';
    return this.db
      .prepare(
        `SELECT * FROM gmail_messages WHERE status IN ('discovered','failed-retryable') AND (next_attempt_at IS NULL OR next_attempt_at<=?)${identity} ORDER BY created_at LIMIT ?`,
      )
      .all(...(identity?[new Date().toISOString(),sourceSubject,destinationSubject,limit]:[new Date().toISOString(),limit])) as any[];
  }
  gmailPair(
    sourceSubject: string,
    destinationSubject: string,
    sourceId: string,
  ) {
    return this.db
      .prepare(
        "SELECT * FROM gmail_messages WHERE source_subject=? AND destination_subject=? AND source_message_id=?",
      )
      .get(sourceSubject, destinationSubject, sourceId) as any;
  }
  startGmailMessage(id: string) {
    return (
      this.db
        .prepare(
          "UPDATE gmail_messages SET status='copying',attempts=attempts+1,started_at=? WHERE id=? AND status IN ('discovered','failed-retryable')",
        )
        .run(new Date().toISOString(), id).changes === 1
    );
  }
  completeGmailMessage(
    id: string,
    x: {
      destinationMessageId: string;
      destinationThreadId?: string;
      rawSha256: string;
      fingerprint: string;
      destinationLabels: string[];
    },
  ) {
    this.db
      .prepare(
        "UPDATE gmail_messages SET destination_message_id=?,destination_thread_id=?,raw_sha256=?,semantic_fingerprint=?,destination_labels_json=?,status='copied',completed_at=?,last_error=NULL WHERE id=?",
      )
      .run(
        x.destinationMessageId,
        x.destinationThreadId ?? null,
        x.rawSha256,
        x.fingerprint,
        JSON.stringify(x.destinationLabels),
        new Date().toISOString(),
        id,
      );
  }
  verifyGmailMessage(id: string, ok: boolean, details: unknown) {
    this.db
      .prepare(
        "UPDATE gmail_messages SET status=?,verification_status=?,verification_json=?,completed_at=? WHERE id=?",
      )
      .run(
        ok ? "verified" : "manual-action-required",
        ok ? "verified" : "mismatch",
        JSON.stringify(details),
        new Date().toISOString(),
        id,
      );
  }
  failGmailMessage(
    id: string,
    retryable: boolean,
    code: string,
    error: string,
    next?: string,
  ) {
    this.db
      .prepare(
        "UPDATE gmail_messages SET status=?,last_error_code=?,last_error=?,next_attempt_at=? WHERE id=?",
      )
      .run(
        retryable ? "failed-retryable" : "failed-permanent",
        code,
        error.slice(0, 500),
        next ?? null,
        id,
      );
  }
  gmailStats() {
    return this.db
      .prepare(
        `SELECT count(*) discovered,sum(CASE WHEN status='copied' THEN 1 ELSE 0 END) copied,sum(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified,sum(CASE WHEN status='skipped' THEN 1 ELSE 0 END) skipped,sum(CASE WHEN status LIKE 'failed%' THEN 1 ELSE 0 END) failed,sum(CASE WHEN source_draft_id IS NOT NULL THEN 1 ELSE 0 END) drafts FROM gmail_messages`,
      )
      .get() as any;
  }
  gmailPage(offset = 0, limit = 100) {
    return this.db
      .prepare(
        "SELECT * FROM gmail_messages ORDER BY created_at LIMIT ? OFFSET ?",
      )
      .all(limit, offset);
  }
  gmailLabelCounts(sourceSubject:string,destinationSubject:string){return this.db.prepare("SELECT j.value source_label_id,count(*) count FROM gmail_messages,json_each(gmail_messages.source_labels_json) j WHERE source_subject=? AND destination_subject=? AND status='verified' GROUP BY j.value").all(sourceSubject,destinationSubject)as any[]}
  upsertLabelMap(x: {
    sourceSubject: string;
    destinationSubject: string;
    sourceId: string;
    sourceName: string;
    destinationId?: string;
    destinationName: string;
    status: string;
    error?: string;
  }) {
    this.db
      .prepare(
        "INSERT INTO gmail_label_map VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_subject,destination_subject,source_label_id) DO UPDATE SET destination_label_id=excluded.destination_label_id,destination_name=excluded.destination_name,status=excluded.status,last_error=excluded.last_error",
      )
      .run(
        x.sourceSubject,
        x.destinationSubject,
        x.sourceId,
        x.sourceName,
        x.destinationId ?? null,
        x.destinationName,
        x.status,
        x.error ?? null,
      );
  }
  labelMaps(sourceSubject: string, destinationSubject: string) {
    return this.db
      .prepare(
        "SELECT * FROM gmail_label_map WHERE source_subject=? AND destination_subject=?",
      )
      .all(sourceSubject, destinationSubject) as any[];
  }
  gmailLog(runId: string, event: string, details: unknown) {
    this.db
      .prepare(
        "INSERT INTO gmail_logs(run_id,created_at,event,details_json) VALUES(?,?,?,?)",
      )
      .run(runId, new Date().toISOString(), event, JSON.stringify(details));
  }
  activityLog(module:string,level:string,message:string,details:unknown={}){
    this.db.prepare("INSERT INTO operation_logs(created_at,module,level,message,details_json) VALUES(?,?,?,?,?)").run(new Date().toISOString(),module,level,message.slice(0,1000),JSON.stringify(details));
    this.db.prepare("DELETE FROM operation_logs WHERE id NOT IN (SELECT id FROM operation_logs ORDER BY id DESC LIMIT 20000)").run();
  }
  activityLogs(limit=1000){
    const own=this.db.prepare("SELECT created_at,module,level,message,details_json details FROM operation_logs ORDER BY id DESC LIMIT ?").all(limit) as any[];
    const drive=this.db.prepare("SELECT created_at,'rclone' module,CASE WHEN line LIKE '%ERROR%' OR line LIKE '%Failed%' THEN 'error' ELSE 'info' END level,line message,'{}' details FROM backup_logs ORDER BY id DESC LIMIT ?").all(Math.min(limit,500)) as any[];
    const gmail=this.db.prepare("SELECT created_at,'gmail' module,'info' level,event message,details_json details FROM gmail_logs ORDER BY id DESC LIMIT ?").all(Math.min(limit,500)) as any[];
    return [...own,...drive,...gmail].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,limit);
  }
  failureDiagnostics(){
    const queries=[["gmail","SELECT COALESCE(last_error_code,'unknown') code,COALESCE(last_error,'No detail recorded') message,count(*) count FROM gmail_messages WHERE status LIKE 'failed%' GROUP BY last_error_code,last_error ORDER BY count DESC LIMIT 20"],["contacts","SELECT status code,COALESCE(redacted_last_error,'Review or duplicate decision required') message,count(*) count FROM contacts_manifest WHERE status LIKE 'failed%' OR status='manual-action-required' GROUP BY status,redacted_last_error ORDER BY count DESC LIMIT 20"],["calendar","SELECT status code,COALESCE(last_error,'Verification or retry required') message,count(*) count FROM calendar_events_v2 WHERE status LIKE 'failed%' OR status='manual-action-required' GROUP BY status,last_error ORDER BY count DESC LIMIT 20"],["drive","SELECT status code,COALESCE(last_error,'No detail recorded') message,count(*) count FROM backup_jobs WHERE status IN ('failed','interrupted') GROUP BY status,last_error ORDER BY count DESC LIMIT 20"]] as const;
    return queries.flatMap(([module,sql])=>(this.db.prepare(sql).all() as any[]).map(x=>({module,...x,message:String(x.message).slice(0,500)})));
  }
  phaseRun(sql:string,...args:any[]){return this.db.prepare(sql).run(...args)}
  phaseGet(sql:string,...args:any[]){return this.db.prepare(sql).get(...args) as any}
  phaseAll(sql:string,...args:any[]){return this.db.prepare(sql).all(...args) as any[]}
}
