# Architecture

Cornerstone Lifeboat is a local-first Electron application. The sandboxed React renderer has no Node access and communicates only through a narrow, typed preload bridge. The Electron main process owns OAuth, Google API clients, SQLite, filesystem/report exports, and future managed `rclone` child processes.

The migration engine is manifest-first: inventory creates immutable snapshots and queue items use a unique `(module, source account, destination account, source item ID)` identity. Jobs lease one item at a time, recover `copying`/`verifying` rows after a crash, apply capped exponential backoff, and verify before reaching `verified`. Source API clients are read-only by default. Explicit source mutations (vacation responder or forwarding) will be isolated behind separate consent and confirmation.

Phase 1 supplies the secure shell, settings, OAuth role validation, Gmail/Drive/Contacts/Calendar inventory, persistent queue primitives, JSON/CSV/HTML reports, dry-run default, and sandbox inventory mode. Later modules attach workers to the same queue rather than bypassing it.

Phase 2 adds `drive_manifest`, `backup_jobs`, and redacted `backup_logs`, plus one managed rclone subprocess. Renderer views use query-backed summaries/pages. rclone uses `spawn(executable, argumentArray, {shell:false})`; copy and verification are separate persisted jobs. Startup marks abandoned jobs interrupted, and rerunning the same copy safely resumes.

Phase 3 adds paged Gmail discovery, deterministic label mapping, bounded leases, immediate destination-ID persistence, per-message verification and recovery searches. RAW MIME exists only in worker memory or an explicitly selected archive. Destination copy and source settings use separate incremental consent.

Next improvements
-----------------
- Add a strongly-typed preload IPC contract so renderer/main communication is validated and easier to maintain.
- Persist backup and migration job state in SQLite so interrupted operations can recover on restart.
- Encapsulate external `rclone` subprocess handling and destination validation behind a dedicated drive job manager.
- Improve progress observability by storing structured logs, audit events, and progress metrics for UI replay and post-mortem review.
- Guide users through a step-based migration workflow instead of a flat navigation pattern.
- Document explicit security boundaries for exported evidence, archive paths, and OAuth client handling.
