# Security policy

ScheduGrr is local-first. Its API binds to `127.0.0.1` by default and has no
authentication, so do not expose it to an untrusted network without adding an
authentication layer or a trusted reverse proxy.

Please report vulnerabilities privately to the repository maintainer rather
than opening a public issue. Until a public contact is configured, use the
private security-reporting feature of the Git hosting provider.

Personal board data lives in browser storage and, when the development API is
enabled, in `data/schedugrr.json`. The desktop application instead writes to
the operating system's per-user application-data directory (for example,
`~/Library/Application Support/ScheduGrr/schedugrr.json` on macOS). OpenAgenda
and OpenBoard data is read only as a migration source. These files
and common environment files should remain outside version control.

The Tauri system webview has explicit native capabilities, restricted external
navigation, and a Content Security Policy. Native export writes only to a
user-selected destination in the system Save dialog. Node.js is not shipped or
exposed to the webview. Public binaries should
also be signed—and on macOS, notarized—as described in
`docs/DISTRIBUTION.md`. Windows builds can run unsigned, but public unsigned
installers trigger an Unknown Publisher/SmartScreen warning and should be
clearly labeled until Authenticode signing is configured.

Native calendar sync is opt-in and uses Apple EventKit. ScheduGrr stores only
the selected calendar identifier, preferences, and its own task-to-event
identifier mappings. It does not store calendar-account passwords. Disabling
sync stops future writes; it does not silently erase calendar events. Calendar
access can be revoked at any time in macOS System Settings.
