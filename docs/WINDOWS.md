# Windows support

ScheduGrr's Electron shell, React interface, task model, local JSON storage,
and loopback API are cross-platform. The Windows release supports the Board,
in-app Calendar, day schedule, timed tasks, priorities and manual ordering,
appearance settings, JSON import/export, and LLM-friendly API.

The one current platform difference is native account-calendar sync. Version
0.3 uses Apple EventKit and therefore exposes that connection only on macOS.
The Windows app continues to schedule tasks inside ScheduGrr normally and
shows the Calendar-sync control as unavailable. Outlook and Google integration
are roadmap items requiring provider OAuth, token storage, and conflict rules;
they are not packaging toggles.

## Build on Windows

Use Node.js 20 or newer from PowerShell:

```powershell
npm ci
npm test
npm run desktop:dist:win
```

The release directory receives:

- `ScheduGrr-<version>-x64-setup.exe` — per-user NSIS installer
- `ScheduGrr-<version>-x64.zip` — unpacked application archive

The installer offers a destination choice, creates Start-menu and desktop
shortcuts, and deliberately preserves board data during uninstall. ScheduGrr
uses Electron's per-user application-data directory, normally beneath
`%APPDATA%\ScheduGrr`.

For packaged UI QA on a Windows machine:

```powershell
npm run desktop:pack:win
npm run test:desktop
```

The QA script uses a temporary profile and exercises task display, list-title
editing, appearance persistence, local-API task creation, timed-task editing,
minimum window size, and relaunch persistence.

## CI and signing

`.github/workflows/ci.yml` runs the application tests on Windows, macOS, and
Linux. `.github/workflows/windows-package.yml` builds the installer and ZIP on
a Windows runner and uploads checksummed artifacts. It can use repository
secrets named `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` when a Windows code-
signing certificate is available; with no secrets it produces an explicitly
unsigned test build.

Windows has no Apple-style notarization step. Code signing is strongly
recommended before presenting the installer to a broad audience because an
unsigned build displays Unknown Publisher and may trigger Microsoft
SmartScreen. Prefer Microsoft Azure Artifact Signing (formerly Trusted
Signing) where it is available, or a cloud-/hardware-backed EV certificate.
The `WIN_CSC_LINK` path remains useful for compatible certificate workflows and
private testing. Do not commit a certificate or password.
