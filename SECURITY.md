# Security model

- OAuth desktop-app flow only; passwords are never requested.
- Refresh tokens are stored in the OS credential store through `keytar`. Client secrets are read from the user-selected file and retained only in memory; the path is stored locally.
- Renderer context isolation and sandboxing are enabled; Node integration is disabled.
- IPC handlers validate all inputs. The bridge exposes no generic filesystem, shell, token, or database access.
- Logs and reports contain counts, IDs only where necessary, and redacted errors. Tokens, message bodies, full contacts, and password values are prohibited.
- Dry-run is the default. The source role uses read-only scopes. No source deletion/trashing/synchronisation code exists.
- Source and destination verified email addresses must differ. Destination allow-list defaults to `joshualparris@gmail.com` and `joshparriscornerstone@gmail.com`.
- Credentials can be revoked at Google and removed from the local keychain from the Security screen.

Threat boundaries: a compromised operating-system user can access application data and may access keychain entries after OS approval. Reports and manifests can reveal filenames and account identifiers, so backup locations should be access-controlled.
