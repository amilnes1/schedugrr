# OpenAgenda roadmap

## 0.2 — public desktop foundation

- Complete the OpenAgenda rename and preserve OpenBoard data.
- Keep one-way native Calendar sync available to macOS source builds.
- Keep macOS build-from-source support without promising a signed or notarized
  public artifact.
- Publish an x64 Windows NSIS installer and ZIP built on a Windows runner.
- Document the local API, privacy model, contribution process, and release path.

## 0.3 — deeper desktop integration

- Add Linux packaging and broaden automated installer checks.
- Evaluate Windows Authenticode or Azure Trusted Signing after public-download
  volume justifies the certificate or service cost.
- Add direct Google Calendar and Microsoft Graph adapters using desktop OAuth
  authorization-code flows with PKCE and OS-protected token storage.

## Later, after real-world sync feedback

- Evaluate two-way calendar editing with explicit conflict and deletion rules.
- Add recurrence only after its interaction with tasks is understandable.
- Offer an MCP server backed by the existing local OpenAPI surface.
- Improve accessibility, localization, import formats, and contributor tooling.

OpenAgenda will remain local-first. Hosted accounts, analytics, and mandatory
cloud infrastructure are outside the current project direction.
