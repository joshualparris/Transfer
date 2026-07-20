# Cornerstone Lifeboat

A local-first Electron migration cockpit for `joshua.parris@cornerstone.edu.au` to `joshualparris@gmail.com`, with `joshparriscornerstone@gmail.com` as the approved fallback. Phase 1 is implemented: secure account setup, persistent SQLite state, real read-only inventory for Gmail/Drive/Contacts/Calendar, crash-recoverable queue primitives, and JSON/CSV/HTML reports.

Later copy modules are deliberately unavailable until their idempotent copy and verification paths exist. No source deletion code exists. Dry-run is on by default.

## Run

Prerequisites: Node.js 22 LTS, npm, and a supported OS keychain (Windows Credential Manager or Linux Secret Service).

```text
npm install
npm run dev
npm test
npm run build
```

`npm run build:dir` creates an unpacked smoke-test build. Packaging targets Windows NSIS and Linux AppImage/deb on their respective platforms.

## Exact Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/), create a project such as “Cornerstone Lifeboat”, and select it.
2. In **APIs & Services → Library**, enable Gmail API, Google Drive API, People API, and Google Calendar API. YouTube Data API v3 is not needed until its later module.
3. Under **Google Auth platform**, configure the app name and contact email. Choose **External** unless your Workspace administrator makes an internal app available. Add both accounts as test users while the app is in testing.
4. Configure the scopes the app requests. Source consent uses Gmail read-only, Drive read-only, Contacts read-only, Other Contacts read-only, and Calendar read-only. Destination consent uses Gmail labels/import, Drive file, Contacts, and app-created Calendar scopes. Workspace policy can still block these.
5. Under **Clients**, create an OAuth client of type **Desktop app** and download its JSON. Never commit this file.
6. Start Lifeboat, open **Accounts**, select the JSON, connect **source**, and sign in as `joshua.parris@cornerstone.edu.au`.
7. Connect **destination** separately and sign in as `joshualparris@gmail.com` or `joshparriscornerstone@gmail.com`. The app rejects identical accounts and other destinations.
8. Run **Inventory**. Admin-blocked APIs appear as module warnings while successful modules remain in the snapshot.
9. Export the reports to the NAS or another protected folder. Inventory is evidence only; it does not mean migration is complete.

The client file is only read, never modified. Its path is stored locally; refresh tokens live in the OS credential vault. **Security → Revoke & remove** attempts Google token revocation and removes the local credential.

## Data and acceptance boundary

The manifest database lives in Electron’s per-user app-data directory. It contains settings, verified emails, counts, queue IDs and redacted errors—never OAuth tokens, email bodies, contact records, or passwords. Protect exported reports because they contain account identifiers and metadata.

Phase 1 performs no live writes. Automated tests cover account validation, queue idempotency/recovery, redaction and report generation. Live acceptance requires the user to initiate OAuth; no test contacts, messages, files, or events are created.
