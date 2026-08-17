# ScheduGrr

[![CI](https://github.com/amilnes1/schedugrr/actions/workflows/ci.yml/badge.svg)](https://github.com/amilnes1/schedugrr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-c55a3d.svg)](./LICENSE)

A tactile, local-first task planner with a little growl. Keep simple to-do
lists, then drag tasks onto a calendar—or between days—to plan by hand.

ScheduGrr is a desktop-first, local application. It is designed to run on the
owner's machine rather than as a hosted multi-user service.

An Electron shell now packages the tested React and Node application as a
native desktop install. The bundled renderer remains sandboxed, while the
local API and filesystem persistence stay in the main process.

ScheduGrr is built around two linked views:

- **Board** — today's timed schedule stays visible on the left while your lists
  remain as columns. Tasks default to high-to-low priority order; drag them
  into any custom order and ScheduGrr remembers it. Click a list title to
  rename it.
- **Calendar** — a month grid you drop tasks onto. An **Unscheduled** tray holds
  everything that doesn't have a date yet; drag from the tray onto any day to
  schedule it, or drag a task back to unschedule it.

Scheduling and list membership are **independent axes**: putting a task on a date
never changes which list it belongs to. That's what makes moving things around
feel effortless.

## Preview

### Board

Today's timed schedule stays beside priority-aware lists, with manual ordering
preserved whenever you rearrange tasks.

![ScheduGrr Board view with today's schedule and four task lists](./docs/images/board.png)

### Calendar

Timed and date-only tasks share a month view, while the Unscheduled tray keeps
the backlog close enough to drag onto any day.

![ScheduGrr Calendar view with scheduled tasks and the Unscheduled tray](./docs/images/calendar.png)

### Remarks

Snark is the default, but completion feedback can be encouraging or silent.
The active voice can be previewed directly from settings.

![ScheduGrr Remarks settings with a playful completion message](./docs/images/remarks.png)

ScheduGrr is local-first and has no account or cloud dependency. The browser
uses `localStorage` on its own. When the included local server is running, it
also keeps the same board in `data/schedugrr.json` so scripts and LLM tools can
read or edit it through a loopback-only API. Use **⋯ → Export as JSON** for a
portable backup at any time.

The compact **⋯ → Appearance** panel controls task typeface, text size, weight,
and the system text-selection highlight. Task text defaults to a slightly
weightier medium setting for easier scanning.

Under **⋯ → Remarks**, choose how ScheduGrr reacts when work gets checked off:
**Snark** serves affectionate, passive-aggressive paper chits by default;
**Cheer** is genuinely encouraging; and **Hush** keeps completion wordless.
The settings panel can preview either active voice with **Say something**.

In the macOS desktop app, **⋯ → Calendar sync** can keep scheduled tasks in a
writable calendar already configured on the Mac. The integration uses Apple's
EventKit framework directly: ScheduGrr never receives a Google, Outlook, or
iCloud password. Timed tasks become events with a configurable duration;
date-only tasks can optionally become all-day events. Sync is deliberately
one-way in this release, from ScheduGrr to Calendar, so there is one clear
source of truth.

## Design

"Paper & ink" — warm paper surfaces, deep warm ink, a single vermilion accent,
and a Fraunces / Hanken Grotesk / JetBrains Mono type system. Light and dark
themes included. Motion is used sparingly for the moments that matter: the
drag overlay, the view switch, and the sliding detail drawer.

## Getting started

```bash
npm install
npm run dev        # app: http://127.0.0.1:5173 · API: http://127.0.0.1:8787
```

The first connected browser seeds the API from its local board, preserving any
work already in `localStorage`. If the API is not running, the UI continues in
browser-local mode. The **LLM friendly** status in the top bar explains that
the shared local file can be read and edited by LLM tools.

Production-style local run:

```bash
npm run build
npm start          # serves the built app and API at http://127.0.0.1:8787
```

Native desktop run and packaging:

```bash
npm run desktop         # build and launch Electron from source
npm run desktop:pack    # unpacked platform-native application
npm run desktop:dist    # installer/archive for the current platform
npm run desktop:dist:win # x64 Windows NSIS installer + ZIP
```

On macOS, distribution artifacts appear under `release/` as a DMG and ZIP.
The app stores its board in `~/Library/Application Support/ScheduGrr/schedugrr.json`
rather than inside the application bundle. See [Desktop distribution](./docs/DISTRIBUTION.md)
for signing, notarization, and release details.

On Windows, the Board, Calendar, timed tasks, appearance controls, JSON
import/export, and loopback API use the same code and local-first data model.
The Windows installer stores data under the current user's application-data
directory. Native OS-calendar sync remains macOS-only in 0.3; see
[Windows support](./docs/WINDOWS.md) for the packaging path and calendar
roadmap.

Existing local data from OpenAgenda or OpenBoard is copied forward
automatically on first launch, including appearance preferences from the
OpenAgenda desktop profile. Original files remain in place as a recovery path.

Other scripts:

```bash
npm run build      # typecheck + production build
npm run test       # UI/store tests + local API integration tests
npm run test:desktop # packaged Electron UI, API, and relaunch QA
npm run typecheck  # types only
npm run dev:web    # frontend only; localStorage mode
```

## Architecture

- **React 19 + TypeScript + Vite**
- **Electron** for the installable desktop shell, native menus, and app lifecycle
- **Zustand** for state, persisted to `localStorage` (with an in-memory
  fallback so it never throws in private-mode or SSR)
- A dependency-free **Node.js local API** with atomic JSON-file persistence
- A small native **EventKit bridge** for opt-in macOS Calendar synchronization
- **@dnd-kit** for drag and drop
- **Tailwind CSS v4** for layout, with a bespoke CSS-variable theme for the
  paper-and-ink look
- **Framer Motion** for micro-interactions
- **date-fns** for the calendar math

```
src/
  lib/
    store.ts     # the board store — every mutation is a named action
    types.ts     # the domain model (List, Task)
    seed.ts      # first-run sample content
    date.ts      # calendar helpers (month grid, date keys)
    io.ts        # JSON export / import
    remarks.ts   # completion voices, streaks, and nonrepeating message pools
  components/
    board/       # Board view + columns
    calendar/    # Calendar view, day cells, unscheduled tray
    TaskDetail.tsx  # the editing drawer
    CompletionRemark.tsx # accessible, task-anchored paper feedback
server/
  app.mjs           # loopback HTTP API + production static server
  board-store.mjs   # validated domain operations + atomic file writes
openapi.json        # machine-readable LLM/tool contract
desktop/
  main.mjs             # secure native window + bundled loopback API
  calendar-sync.mjs    # one-way task-to-calendar coordination + mappings
native/macos/
  calendar_bridge.mm   # N-API bridge to Apple EventKit
build/                  # application icon + macOS signing entitlements
```

## LLM and agent access

With `npm run dev` or `npm start` running, an LLM or coding agent can inspect
the whole board in one request:

```bash
curl http://127.0.0.1:8787/api/context
```

Create a task using a human list name (no id lookup required):

```bash
curl -X POST http://127.0.0.1:8787/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Draft the demo script","listName":"Work","date":"2026-08-20","time":"09:30","priority":"high"}'
```

Complete or reschedule a task by id:

```bash
curl -X PATCH http://127.0.0.1:8787/api/tasks/TASK_ID \
  -H 'Content-Type: application/json' \
  -d '{"completed":true,"date":null}'
```

Task times are optional local `HH:mm` values. Timed tasks appear chronologically
before untimed tasks in each day's schedule.

Lists use `taskOrder: "priority"` by default. A drag to an explicit list position
switches that list to `"manual"`, preserving the user's order. Set the list back
to `"priority"` through the list menu or API whenever desired.

The complete OpenAPI 3.1 document is available at
[`/openapi.json`](http://127.0.0.1:8787/openapi.json). It describes task search,
list CRUD, scheduling, moving, completion, deletion, and full-board import.
External edits appear in an open browser within about 1.5 seconds. If an LLM
or script completes a task while the UI is open, the selected Remark voice
responds there too; initial synchronization does not replay old completions.

The API binds to `127.0.0.1` by default, accepts browser writes only from local
origins, and stores data outside Git. Override `SCHEDUGRR_HOST`,
`SCHEDUGRR_PORT`, or `SCHEDUGRR_DATA_FILE` for advanced local setups. The
legacy `OPENAGENDA_*` and `OPENBOARD_*` names remain accepted for compatibility.

The client-side data model is also small and normalized, and every change flows
through an explicitly named store action:

```ts
import { useBoard } from "@/lib/store";
const board = useBoard.getState();

// Lists
board.addList(name, color?)                 // → id
board.renameList(id, name)
board.setListColor(id, color)
board.setListTaskOrder(id, "priority" | "manual")
board.removeList(id)                        // also removes its tasks
board.reorderLists(orderedIds)

// Tasks
board.addTask({ title, listId, date?, time?, notes?, priority? })  // → id
board.updateTask(id, patch)
board.toggleTask(id)
board.removeTask(id)

// The two axes
board.moveTaskToList(id, listId, index?)    // list membership + order
board.moveTaskToDay(id, "yyyy-MM-dd", index?)  // schedule / reschedule
board.unscheduleTask(id)                     // pull off the calendar

// Document
board.replaceDocument({ lists, tasks })      // e.g. from imported JSON
board.resetToSeed()
```

Positions are always kept densely reindexed by the store. Untouched lists sort
high-to-low by priority; an explicit indexed move becomes the saved manual order.

## Open-source shape

- MIT licensed and intentionally provider-neutral
- No authentication, analytics, hosted database, or secret keys
- Personal task data is ignored by Git (`data/*.json`)
- Sandboxed desktop renderer with Node integration disabled and a restrictive CSP
- API and UI tests run without external services
- Contributions are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md)
- Windows packaging and QA are documented in [docs/WINDOWS.md](./docs/WINDOWS.md)
- Authorship and AI-assistance details are recorded in [AUTHORS.md](./AUTHORS.md)
- Citation metadata is available in [CITATION.cff](./CITATION.cff)
- The public release plan is tracked in [ROADMAP.md](./ROADMAP.md)

## License

[MIT](./LICENSE)
