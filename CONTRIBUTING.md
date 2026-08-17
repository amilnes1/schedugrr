# Contributing to OpenAgenda

Thanks for helping make OpenAgenda better. The project aims to stay small,
local-first, approachable, and equally usable by people and software tools.

## Development

```bash
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
npm run desktop:pack  # when changing the desktop shell or packaging
```

Please include tests for behavior changes. UI work should remain keyboard
usable, respect reduced-motion preferences, and preserve the desktop-first
experience. API changes should update `openapi.json` in the same pull request.
Desktop changes should be smoke-tested from the packaged application, not only
from Vite.

## Data and security

Never commit `data/openagenda.json`, legacy `data/openboard.json`, calendar
mapping files, or exported boards; they can contain private
task content. Do not add telemetry, hosted services, or required accounts
without an explicit project discussion.

Calendar changes must preserve one-way sync semantics unless a proposal also
defines conflict resolution, recurrence behavior, and deletion recovery. Native
macOS changes should be tested with Calendar access denied as well as granted.
