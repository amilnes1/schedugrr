# Security policy

OpenAgenda is local-first. Its API binds to `127.0.0.1` by default and has no
authentication, so do not expose it to an untrusted network without adding an
authentication layer or a trusted reverse proxy.

Please report vulnerabilities privately to the repository maintainer rather
than opening a public issue. Until a public contact is configured, use the
private security-reporting feature of the Git hosting provider.

Personal board data lives in browser storage and, when the development API is
enabled, in `data/openagenda.json`. The desktop application instead writes to
the operating system's per-user application-data directory (for example,
`~/Library/Application Support/OpenAgenda/openagenda.json` on macOS). These files
and common environment files should remain outside version control.

The Electron renderer is sandboxed with Node integration disabled, context
isolation enabled, permission requests denied, external navigation restricted,
and a Content Security Policy applied to the bundled UI. Public binaries should
also be signed—and on macOS, notarized—as described in
`docs/DISTRIBUTION.md`. Windows builds can run unsigned, but public unsigned
installers trigger an Unknown Publisher/SmartScreen warning and should be
clearly labeled until Authenticode signing is configured.

Native calendar sync is opt-in and uses Apple EventKit. OpenAgenda stores only
the selected calendar identifier, preferences, and its own task-to-event
identifier mappings. It does not store calendar-account passwords. Disabling
sync stops future writes; it does not silently erase calendar events. Calendar
access can be revoked at any time in macOS System Settings.
