# Changelog

## 0.3.0 — 2026-07-20

- Added resumable Gmail message/draft manifests, safe label mapping and bounded migration.
- Added `messages.insert` default, `messages.import` alternative and per-message verification.
- Added uncertain-insert recovery search and optional atomic `.eml` archive.
- Added incremental Gmail consent, vacation responder and honest forwarding audit.

## 0.2.0 — 2026-07-20

- Added persistent Drive manifest, managed resumable rclone backup and destination locking.
- Added local/drive-letter/UNC storage validation and free-space checks.
- Added non-destructive downloaded-content verification and shared-with-me classification.
- Added evidence CSVs, backup dashboards and Phase 2 safety/recovery tests.

## 0.1.0 — 2026-07-20

- Added hardened Electron/React/TypeScript shell with isolated renderer.
- Added OS-keychain OAuth storage and separate source/destination validation.
- Added real Gmail, Drive, People and Calendar inventory with partial-failure reporting.
- Added SQLite migration manifest, uniqueness constraints and crash recovery.
- Added JSON, CSV and HTML evidence exports.
