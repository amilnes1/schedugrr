# Tauri desktop migration

The desktop application now uses Tauri 2, a compiled Rust backend, and the
operating system's webview. The React interface remains shared with browser
mode. No Chromium, Node.js runtime, npm dependency tree, or subprocess server
is shipped in the desktop application.

## Feature coverage

| Existing behavior | Tauri implementation | Verification |
| --- | --- | --- |
| Board, calendar, day schedule, task/list CRUD | Existing React components | Existing unit tests and WebKit UI QA |
| Drag-and-drop, priority/manual ordering | Existing dnd-kit and stores | Store tests, drag-to-schedule UI QA, API parity |
| Task dates, times, notes, completion | Same UI and JSON schema | UI edits and API parity |
| Archive completed list items and restore | Archive controls and JSON passthrough | Archive unit tests and Rust/WebKit relaunch QA |
| Snark/Cheer/Hush remarks and external completions | Existing remark engine; SSE updates | Remarks tests and UI QA |
| Appearance, dark/light mode, remembered view | Existing Zustand preferences, native backup | UI QA and relaunch |
| JSON import/export | File input import; native Save dialog export | Browser tests and native Mac smoke test |
| Local LLM API and OpenAPI | Rust HTTP server, same loopback address/routes | Differential tests against the Node reference |
| Atomic JSON persistence | Atomic replacement in the same directory | Rust concurrency/rollback tests and relaunch |
| macOS Calendar | Existing EventKit logic with C ABI instead of N-API | Adapter compiles, status check, existing calendar coordination tests |
| Windows | WebView2, per-user NSIS installer, portable executable | Windows compile check and build/API/native WebView2 jobs; native Windows run pending |
| Menus, zoom/fullscreen, window bounds | Tauri native window and menu APIs | Native smoke test |
| Single instance | Tauri single-instance plugin plus data-directory lock | Rust locking test |

The existing Electron installation and production user data are not replaced
by test runs. Tests use temporary profiles and ports. Quit the Electron app
before opening the Tauri app with the normal profile: both implementations
serve port 8787 and share the authoritative JSON file.

## Data and preference migration

The data directory stays `~/Library/Application Support/ScheduGrr` on macOS
and `%APPDATA%/ScheduGrr` on Windows. Existing ScheduGrr JSON, calendar settings,
calendar event mappings, and window bounds are reused. OpenAgenda/OpenBoard
files are copied forward only if the corresponding destination is missing.
Original files are retained.

Chromium and WebKit/WebView2 have incompatible browser profile formats.
A one-time importer reads a temporary copy of Chromium's LevelDB and extracts
appearance/view/remark preferences into `preferences.json`. It never opens or
modifies the original LevelDB. Native preferences are restored before Zustand
initializes, then backed up whenever they change. Existing WebKit preferences
are not overwritten during normal launches.

## Build and test

Install Node.js 20+, stable Rust, and the platform's Tauri prerequisites:
<https://v2.tauri.app/start/prerequisites/>.

```sh
npm ci
npm test
npm run build
npm run test:native
npm run desktop:pack
npm run test:tauri:api
npx playwright install webkit chromium
npm run test:desktop
npm run desktop:dist
```

`test:desktop` exercises the actual Rust backend with Playwright WebKit on
macOS and Chromium on other platforms. This checks the rendering engine and
application flows, but is not a replacement for native window integration.
`test:windows` launches the actual packaged Windows app with an isolated
profile and attaches Playwright to its native WebView2 instance over a
loopback debugging port. It is included in the Windows packaging workflow;
normal launches do not enable the test debugging port.

Calendar permission grants and actual writes to a personal calendar require
an opt-in manual test; automated QA does not grant access or create events in
the user's calendar. The previous one-way sync behavior is retained, including
updating events and deleting mappings for completed/deleted/unscheduled tasks.
Native account-calendar sync remains macOS-only.

## Size and memory

Measurements and the final Mac artifacts are recorded in the local migration
report after native QA. The Windows packaging job enforces a 50,000,000-byte
executable budget. Shared WebView2 runtime installation is separate from the
app; an offline installer that bundles that runtime would exceed this budget.

The local API now publishes revision notifications through `/api/events`.
The UI fetches board data when a revision changes rather than every 1.5 seconds.
EventSource reconnects automatically and receives the current revision on
connection. Writes made during an in-flight write remain queued.
