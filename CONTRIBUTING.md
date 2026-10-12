# Contributing to ScheduGrr

Thanks for helping make ScheduGrr better. The project aims to stay small,
local-first, approachable, and equally usable by people and software tools.

## Development

```bash
npm install
npm run dev
```

Desktop development also requires stable Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
npm run test:native  # Rust backend tests
npm run desktop:pack  # when changing the desktop shell or packaging
npm run test:tauri:api
```

Please include tests for behavior changes. UI work should remain keyboard
usable, respect reduced-motion preferences, and preserve the desktop-first
experience. API changes should update `openapi.json` in the same pull request.
Desktop changes should be smoke-tested from the packaged application, not only
from Vite.

## Data and security

Never commit `data/schedugrr.json`, legacy `data/openagenda.json` or
`data/openboard.json`, calendar
mapping files, or exported boards; they can contain private
task content. Do not add telemetry, hosted services, or required accounts
without an explicit project discussion.

Calendar changes must preserve one-way sync semantics unless a proposal also
defines conflict resolution, recurrence behavior, and deletion recovery. Native
macOS changes should be tested with Calendar access denied as well as granted.
