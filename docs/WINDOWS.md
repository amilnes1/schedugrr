# Windows support

ScheduGrr uses Tauri 2 and Microsoft's shared WebView2 runtime on Windows.
The board, in-app calendar, day schedule, timed tasks, notes, completion,
priority/manual ordering, appearance, remarks, JSON import/export, and local
LLM API use the same React interface and JSON data model as macOS.
Native account-calendar sync remains macOS-only because it uses Apple EventKit.
Outlook and Google account-calendar integrations remain roadmap items.

## Build on Windows

Install Node.js 20+, stable Rust, and Visual Studio C++ Build Tools with the
Desktop development with C++ workload. See the current Tauri prerequisites:
<https://v2.tauri.app/start/prerequisites/#windows>.

```powershell
npm ci
npm test
npm run build
npm run test:native
npm run desktop:dist:win
```

The installer is generated beneath
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis`.
The packaging workflow also creates a portable ZIP, SHA-256 checksums, and an
artifact-size check. It uses a shared WebView2 installation; the installer
obtains WebView2 if it is missing. A portable copy requires WebView2 to be
already installed. No separate Node.js installation is needed to run the app.

Data remains in `%APPDATA%/ScheduGrr`. The Tauri webview has its own subdirectory;
existing Electron task JSON and calendar mappings are preserved. The first
launch copies old appearance preferences from Chromium's profile. Original
profile files are retained. Quit the Electron app before launching Tauri with
the same profile and default API port.

## QA and signing

CI compiles and tests the Rust backend on Windows, macOS, and Linux. The Windows
package workflow runs API parity checks and launches the packaged executable
with a temporary profile. Playwright attaches directly to that app's WebView2
instance through a loopback debugging port. No separate browser or EdgeDriver
installation is required. Run `npm run test:windows` with
`SCHEDUGRR_QA_EXECUTABLE` pointing to the built executable. The debugging port
is enabled only in the test subprocess; normal app launches do not enable it.
GitHub-hosted Windows runners start elevated, so CI runs the UI test at normal
user privilege: recent WebView2 versions ignore debugging environment variables
in elevated processes. No WebView2 security policy is disabled.
Failure screenshots, page markup, and app logs are saved under
`release/windows-qa/` and uploaded by CI if the native UI test fails.

The [Windows packaging and native UI run](https://github.com/amilnes1/schedugrr/actions/runs/38296646007) passed on October 12, 2026
for commit `f8fda5c`. It verified unit tests, Rust tests, 40 API parity checks,
UI editing, API notifications, task time/completion, the small-window layout,
and persistence after relaunch. The NSIS installer built successfully; no
public release was published by this branch run.

Measured Windows x64 artifacts:

| Artifact | Bytes | MiB |
| --- | ---: | ---: |
| NSIS installer | 1,996,676 | 1.90 |
| Portable ZIP | 2,488,226 | 2.37 |
| Executable inside the ZIP | 5,801,984 | 5.53 |

The downloaded artifacts matched their published SHA-256 checksums. These
sizes exclude the shared WebView2 runtime, which the installer obtains if
missing.

The preview is unsigned. Windows may display Unknown Publisher/SmartScreen.
Public release signing can be configured with Tauri's Windows signing options:
<https://v2.tauri.app/distribute/sign/windows/>.
