# Tauri migration measurements — October 12, 2026

The Mac desktop shell and backend have been migrated to Tauri 2/Rust. The
existing React UI and user-visible task model remain shared with browser mode.
Measurements compare the previous Electron build with local Tauri builds.

## Measured size and RAM

| Measurement | Electron | Tauri |
| --- | ---: | ---: |
| Installed Apple Silicon Mac app | 320.3 MiB | 5.48 MiB |
| Compressed local DMG | not compared | 2.83 MiB |
| Mean physical memory including helpers | 310.5 MiB | 217.9 MiB |

The installed app size decreased by **98.3%**. The initial controlled memory
reduction was **29.8%**. A subsequent accepted rendering optimization is
documented in [RAM optimization results](TAURI-RAM-RESULTS.md). Each app used a fresh,
isolated profile, matching 15-task sample board, Calendar view, dark OS theme,
and 1440 × 900 window. Measurements used macOS `top` physical-memory accounting
and included the main app plus all three browser/webview helpers. There was a
30-second warm-up followed by three samples 10 seconds apart.

Electron samples: 310.8, 309.8, 310.8 MiB.
Tauri samples: 217.9, 217.9, 217.9 MiB.

These are short local measurements, not a long-running leak/soak test. Shared
system webview code is outside the app bundle. The Windows installer uses the
shared WebView2 runtime rather than bundling a private browser engine.

## Validation

- 47 React/store/remarks/synchronization tests passed.
- 11 Node reference API/calendar tests passed.
- Rust tests cover atomic persistence, concurrent writes, rollback on invalid
  input, legacy-file preservation, Chromium preference migration, and calendar
  settings validation without granting calendar access.
- 40 differential API checks passed against the existing Node implementation.
- Packaged Rust backend plus Playwright WebKit UI flow passed: board/calendar,
  drag-to-schedule, archive/restore with relaunch, list rename, task time editing, Snark/Cheer/Hush, appearance,
  external API creation/completion, minimum layout, and relaunch persistence.
- Native Mac smoke testing verified list editing, native export Save dialog,
  JSON export/import round trip (four lists, 15 tasks), confirmation/cancellation,
  native menus, zoom/reset, and relaunch with remembered preferences.
- Rust formatting and lint checks pass, including the Windows MSVC target.

## Windows and Calendar limitations

The Windows x64 target passed cross-target Rust checking and linting on the Mac,
then passed [native Windows CI](https://github.com/amilnes1/schedugrr/actions/runs/38296646007) on October 12, 2026. The Windows workflow
built the NSIS installer and portable ZIP, passed unit/Rust/API checks and
native WebView2 UI/relaunch tests, and enforced the 50 MB executable budget.
The installer is 1.90 MiB, ZIP 2.37 MiB, and executable 5.53 MiB. Downloaded
artifacts matched their SHA-256 checksums. The shared WebView2 runtime is
separate. This branch run uploaded CI artifacts without publishing a release.

The EventKit implementation retains the previous one-way calendar behavior
through a C ABI instead of N-API. The adapter compiles and availability/settings
checks pass. Permission grants and actual writes into a personal calendar were
not exercised by automated QA; those require an opt-in manual test. Native
account-calendar sync remains macOS-only.

## Local artifacts and use

The local Mac DMG and application are copied to the repository's ignored
`release` directory. They use an ad-hoc signature for local testing. Public
release signing/notarization and publishing were not performed.

Quit the Electron app before launching the Tauri app with the normal profile.
Both use the authoritative existing JSON data directory and port 8787. Tests
used separate profiles/ports and did not modify personal task/calendar data.

See [feature coverage and migration details](TAURI-MIGRATION.md) and
[build/distribution instructions](DISTRIBUTION.md). Development builds require
stable Rust; the desktop app itself requires no Node.js or Rust installation.
The temporary toolchain used for this task was kept outside the repository.
