# RAM optimization results — October 12, 2026

The macOS webview now draws the existing paper texture as part of the page
background. The legacy full-window overlay is excluded from matching on macOS,
which avoids retaining its unused texture/compositing resources. Windows and
browser rendering retain their existing overlay.

The desktop platform marker is inserted into the served HTML before painting.
It uses the same platform value as the native window URL and accepts only that
known value. This avoids initially painting the wrong platform's rendering path.

## Measured RAM

| Matched release-candidate run | Combined physical memory |
| --- | ---: |
| Previous Tauri build | 216.0 MiB |
| Optimized Mac build | 136.9 MiB |
| Saving | 79.0 MiB (36.6%) |

Each app used a fresh profile and webview origin, the same 15-task sample board,
Calendar view, dark theme, and 1440 × 900 window. The main app and all three
WebKit helpers were counted with macOS `top`. Measurements followed a 20-second
warm-up, with three samples five seconds apart. WebKit caches make absolute
memory vary between launches; these figures are a matched local test, not a
universal memory limit or a long-running leak test.

A reversed-order repeat measured the optimized build at 137.0 MiB
and the baseline at 260.8 MiB. The optimized readings stayed
near 137 MiB while the baseline varied with retained caches. The headline
comparison above uses the lower baseline rather than the larger saving.

## Appearance and performance

The noise pattern, effective opacity, color palette, fonts, layout, shadows,
and animation code are preserved. The previous SVG opacity of 0.28 and overlay
opacity of 0.4/0.05 combine to background-image opacity 0.112/0.014. The blend
modes remain multiply in light mode and screen in dark mode.

Visual QA compared 24 pairs of screenshots: WebKit and Chromium, both themes,
1440 × 900 at 2× scale and 980 × 660 at 1× scale, Calendar/Board/task details.
Small pixel differences came from compositing rounding and antialiased edges;
there was no visible layout or typography change. The final Windows rendering
path uses its existing rules.

Animation, theme-switch and drag frame checks remained around 17–18 ms at the
95th percentile on this machine. Chromium showed a cold first-switch delay
with the broader experimental change, so the delivered change is Mac-specific.
The Mac path passed direct in-page view-response checks. The Windows/native
installer still requires its separate Windows CI/runtime verification, as
noted in the migration report.

Validation also passed: 47 UI/store/remarks/sync tests, 11 API/calendar tests,
40 API parity checks, the packaged WebKit task/drag/appearance/remarks/archive
and relaunch flow, five Rust tests, Windows cross-target lint/checks, and the
Mac application signature check. An earlier-startup preference experiment was
rejected because it did not show an additional memory benefit.

## Local deliverables

- `release/tauri-mac-arm64-optimized/ScheduGrr.app`
- `release/ScheduGrr-0.3.0-tauri-arm64-optimized.dmg`
- `release/tauri-ram-qa/` contains local screenshot, timing, and memory evidence.

The previous build is retained. Tests used isolated profiles and did not alter
personal task/calendar data. These local artifacts are not a signed public binary release.
Quit the currently running app before launching the new build.


## Follow-up renderer investigation — October 12, 2026, afternoon

No additional optimization from this investigation was retained. The original
optimized Tauri app in `/Applications/ScheduGrr.app` was restored and its
executable hash was verified against the pre-investigation backup. The CSS was
restored and the frontend rebuilt. The Dock target and task data were preserved.

The running renderer's 119 MiB physical footprint consisted of approximately
85 MiB of graphics backing memory, 24 MiB of WebKit allocator memory, and
10 MiB of other allocations (including JIT code and system data). The WebKit
allocator category includes engine/DOM/layout/JavaScript allocations; it is not
an independently measured JavaScript heap. Large reserved virtual address
ranges are not physical RAM consumption. The inspected 1920 × 953 window at 2×
scale also requires larger graphics buffers than the earlier 1440 × 900 test.

Experiments used isolated profiles and sample tasks:

- Scrolling body background: reduced renderer memory in native comparisons,
  but repeated theme switching regressed from roughly 18–19 ms to 23 ms at
  the 95th percentile. Rejected.
- Pre-rendered grain: did not eliminate that theme-switch regression. Rejected.
- Removing persistent `will-change` hints: no meaningful saving. Idle
  inspection found no active page animations and no such hints on the major
  containers. Rejected.
- A separate fixed background layer: pixel-identical in six same-page
  comparisons, and 18–19 ms theme-switch frame timings. The packaged build
  passed an 18-pair Calendar/Board/detail matrix and 12 overflowing-list/zoom
  scroll comparisons (the scrolling pairs were pixel-identical). Drag and
  view-switch frame p95 remained 18 ms. Native sample-data tests improved
  renderer memory from 155 to 121 MiB, but this did not transfer to the actual
  installed session: approximately 118 MiB immediately before the trial and
  142 MiB after it. Rejected and rolled back. The lower trial peak is not a
  sufficient reason to accept a higher steady reading.

Graphics-buffer caching and system memory pressure make these measurements
workload-dependent. This was not a proof of a leak or an exhaustive guarantee
that further improvements are impossible. No accepted further RAM saving was
established under the appearance/performance constraints.

`release/renderer-investigation-qa/` stores the timing and memory evidence.
Rejected bundles are named `.app.backup`; they are not the installed app.
The earlier accepted migration and RAM improvements remain intact.
