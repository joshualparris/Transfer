# Implementation plan

1. Phase 1 — secure Electron shell, SQLite queue, settings, OAuth, source inventory and report framework. Implemented in this release.
2. Phase 2 — managed `rclone copy`, Drive-to-NAS manifest ingestion, `rclone check`, native export policy and shared-with-me audit.
3. Phase 3 — Gmail raw-message import, label mapping, deduplication and content verification.
4. Phase 4 — People and Calendar writers with destination-side deduplication and representative verification.
5. Phase 5 — safe Photos/Keep Takeout extraction, hashing, sidecar linking and local viewers.
6. Phase 6 — YouTube transferable metadata, redacted password comparison, third-party discovery and Play evidence.
7. Phase 7 — cross-module final safety gate, packaging hardening and live-account acceptance tests.

Each phase must pass lint, type checking, automated tests, packaged build smoke testing, README/CHANGELOG updates and an actual workflow review. Unsupported work remains visibly unavailable rather than being represented by fake controls.

Status: Phase 2 Drive-to-NAS backup, verification, native export policy and shared audit are implemented. Gmail migration remains Phase 3.

Phase 3 status: Gmail discovery, label mapping, message insertion/import, draft creation, optional raw archive, recovery, verification, vacation response and forwarding audit are implemented. Live-account acceptance requires explicit OAuth and a test-sized migration.

Implementation backlog for next iteration
----------------------------------------
- Refactor main process IPC into strongly-typed feature modules with `zod` validation for incoming renderer data.
- Persist job lifecycle state for `drive_backup_copy`, `drive_backup_verify`, and Gmail migration runs so restart recovery is deterministic.
- Replace in-memory progress globals with stored progress and log rows that can be replayed by the renderer.
- Add a renderer-side step wizard for the migration workflow and clearer next-action guidance per phase.
- Harden `rclone` destination validation and expose destination safety warnings in the UI.
- Add explicit internal docs for exported evidence boundaries and sensitive archive handling.
