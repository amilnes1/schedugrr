# Changelog

All notable changes to ScheduGrr are documented here.

## 0.3.0 — 2026-10-12

- Replaced the Electron desktop shell and bundled Node server with Tauri 2,
  an embedded Rust API, and the operating system's webview. The measured
  Apple Silicon app shrank from 320.3 MiB to 5.48 MiB; the Mac DMG is 2.83 MiB.
- Preserved existing board data, desktop preferences, native JSON export,
  menus, window behavior, and opt-in macOS EventKit synchronization.
- Replaced periodic full-board polling with revision events and queued writes.
- Reduced macOS graphics memory while preserving the paper-and-ink appearance.
- Added archive/restore for completed list items, clear-all tasks, and improved
  drag-to-schedule handling while preserving list membership.
- Added Rust/API parity tests and Windows NSIS/portable packaging with native
  WebView2 UI checks. Native Windows release validation remains a CI gate.

- Renamed the project from OpenAgenda to ScheduGrr across the desktop app,
  local API, packaging, documentation, and release automation.
- Added automatic migration from OpenAgenda and OpenBoard board files,
  browser storage, desktop preferences, and legacy environment variables.
- Added completion Remarks with Snark, Cheer, and Hush modes. Snark is the
  default; both speaking modes use nonrepeating, streak-aware message pools.
- Added accessible, reduced-motion-aware paper-chit feedback anchored to the
  task checkbox and an in-settings voice preview.
- Sharpened the full Snark library into consistently passive-aggressive,
  mildly insulting backhanded praise while keeping Cheer sincerely supportive.
- Replaced the torn completion-note edges with clear, high-contrast top and
  bottom rules for easier visual scanning.
- Applied the same completion feedback to live LLM/API edits without replaying
  completed tasks during initial synchronization.
- Expanded unit and packaged-app coverage for the new identity and settings.

## 0.2.2 — 2026-08-17

- Disabled Electron Builder's tag-triggered implicit publisher so the release
  workflow can run packaged-app QA and checksums before publishing artifacts.

## 0.2.1 — 2026-08-17

- Fixed the Windows release runner's Electron Builder invocation so native
  installer packaging works without relying on a Unix-style executable shim.

## 0.2.0 — 2026-08-17

- Renamed the project from OpenBoard to OpenAgenda with automatic migration of
  desktop data and browser preferences.
- Added opt-in, one-way macOS Calendar synchronization through Apple EventKit.
- Added a native calendar settings panel, writable-calendar selection, all-day
  task handling, configurable timed-event duration, and manual sync feedback.
- Added durable task-to-event mappings so edits, completion, and deletion can
  be reflected without creating duplicate calendar events.
- Added creator attribution, citation metadata, a public roadmap, a code of
  conduct, a trademark policy, and an OpenAI open-source application draft.
- Added x64 Windows NSIS and ZIP targets, cross-platform CI, a Windows packaging
  workflow, and packaged-app QA paths for macOS, Windows, and Linux.

## 0.1.0 — 2026-08-17

- Initial desktop task board, calendar, timed tasks, LLM-friendly local API,
  appearance settings, priority ordering, tests, and macOS packaging.
