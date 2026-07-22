# Migration data model

`settings` stores non-secret configuration. `accounts` stores role, verified email, stable Google subject ID, and granted scopes—never tokens. OAuth credentials remain in the operating-system keychain.

`inventory_runs` stores timestamped source count snapshots. `migration_items` is the shared resumable item manifest with source/destination identity, IDs, parent information, modification date, size, fingerprint, status, attempts, retry time, redacted error, timestamps, and verification result. Its unique identity prevents duplicate discovery.

Allowed states are `discovered`, `queued`, `copying`, `copied`, `verifying`, `verified`, `skipped`, `manual-action-required`, `failed-retryable`, and `failed-permanent`.

Crash recovery changes stale `copying` work to `failed-retryable` and preserves destination pairing keys. Stale Drive jobs and module runs become historical `interrupted` jobs so a restart can resume safely.

## Drive

`drive_manifest` records source IDs, resolved paths, ownership, checksums, native export policy, and capabilities. `backup_jobs` stores copy/verification history and persisted progress; `backup_logs` stores redacted rclone output. Destination locking prevents conflicting work.

## Gmail

`gmail_runs`, `gmail_messages`, `gmail_label_map`, and `gmail_logs` implement discovery, copying, verification, and evidence. The unique `(source subject, destination subject, source message ID)` key is the idempotency boundary. Destination IDs are persisted immediately. Rows contain IDs, sizes, hashes, labels, retry state, and verification evidence—never message content.

## Contacts and Calendar

`contacts_manifest` pairs source resource names with destination resource names and retains fingerprints, groups, photo, retry, and review state. `contact_group_map` separates source groups from prefixed destination groups.

`calendar_events_v2` pairs each source event with its destination event. `calendar_map_v2` locks each source calendar to its isolated destination calendar. The `v2` names preserve compatibility with early development databases; future changes use numbered migrations instead of another table suffix.

## Operations and schema versions

`operation_logs` is the redacted cross-module activity stream. It contains progress and diagnostic metadata but no OAuth credentials, raw Gmail MIME, contact bodies, or Calendar descriptions.

The database schema is numbered with SQLite `PRAGMA user_version`. Version upgrades run inside a transaction before crash recovery. A database from a newer unsupported app version is rejected rather than modified.
