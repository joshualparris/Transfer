# Architecture

Cornerstone Lifeboat is a local-first Electron application. The sandboxed React renderer has no Node access and communicates only through a narrow, typed preload bridge. The Electron main process owns OAuth, Google API clients, SQLite, filesystem/report exports, and the managed `rclone` child process.

The migration engine is manifest-first: inventory creates immutable snapshots and queue items use a unique `(module, source account, destination account, source item ID)` identity. Jobs lease one item at a time, recover `copying`/`verifying` rows after a crash, apply capped exponential backoff, and verify before reaching `verified`. Source API clients are read-only by default. Explicit source mutations (vacation responder or forwarding) will be isolated behind separate consent and confirmation.

Phase 1 supplies the secure shell, settings, OAuth role validation, Gmail/Drive/Contacts/Calendar inventory, persistent queue primitives, JSON/CSV/HTML reports, dry-run default, and sandbox inventory mode. Later modules attach persistent manifests and workers without bypassing the safety boundary.

Phase 2 adds `drive_manifest`, `backup_jobs`, and redacted `backup_logs`, plus one managed rclone subprocess. Renderer views use query-backed summaries/pages. rclone uses `spawn(executable, argumentArray, {shell:false})`; copy and verification are separate persisted jobs. Startup marks abandoned jobs interrupted, and rerunning the same copy safely resumes.

Phase 3 adds paged Gmail discovery, deterministic label mapping, bounded leases, immediate destination-ID persistence, per-message verification and recovery searches. RAW MIME exists only in worker memory or an explicitly selected archive. Destination copy and source settings use separate incremental consent.

Phase 4 adds resumable Contacts and Calendar manifests. Contacts use privacy-keyed fingerprints, conservative duplicate review, user-group mapping, primary-name normalization, transient retries, and CSV/vCard evidence. Calendar creates isolated prefixed calendars, preserves recurrence and iCalendar UIDs, and omits attendees and conference links.

Phase 5 preserves Photos and Keep through a user-supplied Google Takeout archive because Google provides no supported fidelity-preserving account-to-account API. Lifeboat hashes the extracted files and exports JSON/CSV evidence without altering the archive.

Operational visibility is persistent. Structured, redacted logs from inventory, Google modules, and rclone feed a fixed-height live console and grouped diagnostics. Independent modules may run concurrently; conflicting work within one module is locked.

Database upgrades use SQLite `PRAGMA user_version` and run transactionally. Startup rejects databases created by a newer unsupported app version instead of guessing at their layout.

Current maintenance priorities
------------------------------

- Split feature IPC registration out of `electron/main/index.ts` into small handler modules without changing the preload security boundary.
- Add an optional guided migration checklist while retaining direct expert navigation.
- Expand live-account acceptance tests for restart recovery; all live writes remain explicitly user-triggered.
- Continue documenting evidence-retention and archive-location choices in the relevant screens.
