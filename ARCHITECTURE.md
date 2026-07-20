# Architecture

Cornerstone Lifeboat is a local-first Electron application. The sandboxed React renderer has no Node access and communicates only through a narrow, typed preload bridge. The Electron main process owns OAuth, Google API clients, SQLite, filesystem/report exports, and future managed `rclone` child processes.

The migration engine is manifest-first: inventory creates immutable snapshots and queue items use a unique `(module, source account, destination account, source item ID)` identity. Jobs lease one item at a time, recover `copying`/`verifying` rows after a crash, apply capped exponential backoff, and verify before reaching `verified`. Source API clients are read-only by default. Explicit source mutations (vacation responder or forwarding) will be isolated behind separate consent and confirmation.

Phase 1 supplies the secure shell, settings, OAuth role validation, Gmail/Drive/Contacts/Calendar inventory, persistent queue primitives, JSON/CSV/HTML reports, dry-run default, and sandbox inventory mode. Later modules attach workers to the same queue rather than bypassing it.
