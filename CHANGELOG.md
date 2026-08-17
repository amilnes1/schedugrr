# Changelog

All notable changes to OpenAgenda are documented here.

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
