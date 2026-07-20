# Migration data model

`settings` stores non-secret configuration. `accounts` stores role, verified email and granted scopes, never tokens. `inventory_runs` stores timestamped JSON count snapshots. `migration_items` is the resumable item manifest with source/destination identity, IDs, parents, modification date, size, fingerprint, status, attempts, retry time, redacted error, timestamps and verification result. A unique key prevents duplicate discovery. `audit_log` records redacted state changes.

Allowed states: `discovered`, `queued`, `copying`, `copied`, `verifying`, `verified`, `skipped`, `manual-action-required`, `failed-retryable`, `failed-permanent`.

Crash recovery changes stale `copying` to `failed-retryable` and stale `verifying` to `copied`; source IDs remain the idempotency anchor.
