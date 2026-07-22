# Implementation plan

1. Phase 1 — secure Electron shell, SQLite queue, settings, OAuth, source inventory, and report framework. Implemented.
2. Phase 2 — managed `rclone copy`, Drive-to-NAS manifest ingestion, `rclone check`, native export policy, and shared-with-me audit. Implemented.
3. Phase 3 — Gmail raw-message import, label mapping, deduplication, resumability, and content verification. Implemented.
4. Phase 4 — People and Calendar writers with destination-side deduplication, recurrence preservation, evidence backups, and destination verification. Implemented.
5. Phase 5 — safe Photos/Keep Takeout hashing and preservation evidence. Implemented.
6. Phase 6 — YouTube transferable metadata, redacted password comparison, third-party discovery, and Play evidence. Not implemented; unsupported controls are not shown.
7. Phase 7 — cross-module final safety gate, packaging hardening, and live-account acceptance. Packaging and automated QA are implemented; broader live-account acceptance remains user-authorised.

Each phase must pass formatting, type checking, automated tests, packaged-build smoke testing, README/CHANGELOG updates, and a workflow review. Unsupported work remains visibly unavailable rather than being represented by fake controls.

## Current status

Phases 1–5 are implemented. Drive-to-NAS backup, Gmail migration, Contacts, Calendar, unified evidence, and Photos/Keep Takeout preservation are available. Automated QA never sends mail, deletes source data, or starts destination writes without confirmation.

## Maintenance backlog

- Split main-process IPC registration into feature modules while preserving the typed preload allowlist.
- Add an optional guided checklist while retaining direct navigation for experienced users.
- Add isolated live-account restart-recovery acceptance tests.
- Add more capacity and long-path guidance for very large NAS backups.
- Continue documenting evidence-retention and sensitive archive-location choices in the UI.
