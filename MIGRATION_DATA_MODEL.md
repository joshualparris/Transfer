# Migration data model

`settings` stores non-secret configuration. `accounts` stores role, verified email and granted scopes, never tokens. `inventory_runs` stores timestamped JSON count snapshots. `migration_items` is the resumable item manifest with source/destination identity, IDs, parents, modification date, size, fingerprint, status, attempts, retry time, redacted error, timestamps and verification result. A unique key prevents duplicate discovery. `audit_log` records redacted state changes.

Allowed states: `discovered`, `queued`, `copying`, `copied`, `verifying`, `verified`, `skipped`, `manual-action-required`, `failed-retryable`, `failed-permanent`.

Crash recovery changes stale `copying` to `failed-retryable` and stale `verifying` to `copied`; source IDs remain the idempotency anchor.

Phase 2 adds `drive_manifest` for source IDs, resolved paths, ownership, checksums, export policy and capabilities; `backup_jobs` for copy/verification history and persisted progress; and redacted `backup_logs`. Startup marks active jobs interrupted. Destination locking prevents conflicting work.

Phase 3 adds `gmail_runs`, `gmail_messages`, `gmail_label_map`, and `gmail_logs`. The unique `(source subject, destination subject, source message ID)` key is the idempotency boundary. Destination IDs are persisted immediately. Rows contain IDs, sizes, hashes, labels, retry state and verification evidence—never message content.
