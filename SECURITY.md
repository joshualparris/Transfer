# Security model

- OAuth desktop-app flow only; passwords are never requested.
- Refresh tokens, the desktop OAuth client ID, and its client secret are stored together in the OS credential store through `keytar`. The selected client-file path is stored in local settings. They are never written to SQLite, logs, or evidence exports.
- Renderer context isolation and sandboxing are enabled; Node integration is disabled.
- The bridge exposes no generic filesystem, shell, token, or database access. Completing schema-derived validation for every channel remains a hardening task.
- SQLite contains migration metadata including Drive names and paths, owner/permission identities, Gmail source IDs and labels, contact resource identifiers, and Calendar identifiers. It does not contain OAuth tokens, Gmail bodies/raw MIME, full Contact bodies, or Calendar descriptions. Treat the database and evidence folders as sensitive personal data.
- Dry-run is the default. The source role uses read-only scopes. No source deletion/trashing/synchronisation code exists.
- Source and destination verified email addresses must differ. Destination allow-list defaults to `joshualparris@gmail.com` and `joshparriscornerstone@gmail.com`.
- Credentials can be revoked at Google and removed from the local keychain from the Security screen.
- rclone is spawned without a shell using validated remote names and absolute non-root destinations. Only non-destructive copy/check and inspection operations are used.
- The rclone config is never opened, displayed, copied, or included in reports. Subprocess logs receive token-pattern redaction but may still contain filenames and paths, so local application state must be access-controlled.

Threat boundaries: a compromised operating-system user can access application data and may access keychain entries after OS approval. Reports and manifests can reveal filenames and account identifiers, so backup locations should be access-controlled.

Gmail Phase 3 stores no bodies, raw MIME, recipient addresses, attachment bytes or full subjects in SQLite/logs. Headers become hashes or a sender domain. Production code contains no Gmail send method. Optional `.eml` archives are explicitly selected and written atomically. Source message access remains read-only; vacation settings require separate consent and confirmation.
