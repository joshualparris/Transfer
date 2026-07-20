import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { AccountSummary, InventorySnapshot, ItemStatus } from './types';

export class LifeboatDatabase {
  private db: Database.Database;
  constructor(path: string) { this.db = new Database(path); this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.migrate(); this.recover(); }
  private migrate() { this.db.exec(`
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts(role TEXT PRIMARY KEY CHECK(role IN ('source','destination')),email TEXT NOT NULL,scopes_json TEXT NOT NULL,connected_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_runs(id TEXT PRIMARY KEY,account TEXT NOT NULL,created_at TEXT NOT NULL,snapshot_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_items(id TEXT PRIMARY KEY,module TEXT NOT NULL,source_account TEXT NOT NULL,destination_account TEXT NOT NULL,source_item_id TEXT NOT NULL,destination_item_id TEXT,source_parent TEXT,destination_parent TEXT,source_modified_at TEXT,size INTEGER,fingerprint TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,last_error TEXT,created_at TEXT NOT NULL,completed_at TEXT,verification_status TEXT,UNIQUE(module,source_account,destination_account,source_item_id));
    CREATE INDEX IF NOT EXISTS idx_items_status_retry ON migration_items(status,next_attempt_at);
    CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,action TEXT NOT NULL,details_json TEXT NOT NULL);
  `); }
  private recover() { this.db.prepare("UPDATE migration_items SET status='failed-retryable',last_error='Recovered after interrupted copy' WHERE status='copying'").run(); this.db.prepare("UPDATE migration_items SET status='copied',last_error='Recovered before verification completed' WHERE status='verifying'").run(); }
  close(){ this.db.close(); }
  setting<T>(key:string,fallback:T):T { const row=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined; return row?JSON.parse(row.value):fallback; }
  setSetting(key:string,value:unknown){ this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value)); }
  saveAccount(a:AccountSummary){ this.db.prepare('INSERT INTO accounts(role,email,scopes_json,connected_at) VALUES(?,?,?,?) ON CONFLICT(role) DO UPDATE SET email=excluded.email,scopes_json=excluded.scopes_json,connected_at=excluded.connected_at').run(a.role,a.email,JSON.stringify(a.scopes),a.connectedAt); }
  removeAccount(role:string){ this.db.prepare('DELETE FROM accounts WHERE role=?').run(role); }
  accounts():AccountSummary[]{ return (this.db.prepare('SELECT * FROM accounts ORDER BY role DESC').all() as any[]).map(r=>({role:r.role,email:r.email,scopes:JSON.parse(r.scopes_json),connectedAt:r.connected_at})); }
  saveInventory(s:InventorySnapshot){ this.db.prepare('INSERT INTO inventory_runs(id,account,created_at,snapshot_json) VALUES(?,?,?,?)').run(s.runId,s.account,s.createdAt,JSON.stringify(s)); }
  latestInventory():InventorySnapshot|null { const r=this.db.prepare('SELECT snapshot_json FROM inventory_runs ORDER BY created_at DESC LIMIT 1').get() as {snapshot_json:string}|undefined; return r?JSON.parse(r.snapshot_json):null; }
  queueCounts():Record<string,number>{ return Object.fromEntries((this.db.prepare('SELECT status,count(*) count FROM migration_items GROUP BY status').all() as any[]).map(r=>[r.status,r.count])); }
  enqueue(input:{module:string;sourceAccount:string;destinationAccount:string;sourceItemId:string;sourceParent?:string;size?:number;fingerprint?:string}) { const id=randomUUID(),now=new Date().toISOString(); const result=this.db.prepare(`INSERT OR IGNORE INTO migration_items(id,module,source_account,destination_account,source_item_id,source_parent,size,fingerprint,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,input.module,input.sourceAccount,input.destinationAccount,input.sourceItemId,input.sourceParent??null,input.size??null,input.fingerprint??null,'discovered',now); return {id,inserted:result.changes===1}; }
  transition(id:string,from:ItemStatus,to:ItemStatus,fields:{destinationId?:string;error?:string;verification?:string}={}) { const terminal=['verified','skipped','failed-permanent'].includes(to)?new Date().toISOString():null; const r=this.db.prepare('UPDATE migration_items SET status=?,destination_item_id=COALESCE(?,destination_item_id),last_error=?,verification_status=COALESCE(?,verification_status),attempts=attempts+?,completed_at=? WHERE id=? AND status=?').run(to,fields.destinationId??null,fields.error?.slice(0,500)??null,fields.verification??null,to==='copying'?1:0,terminal,id,from); return r.changes===1; }
  exportRows(){ return this.db.prepare('SELECT * FROM migration_items ORDER BY created_at').all(); }
}
