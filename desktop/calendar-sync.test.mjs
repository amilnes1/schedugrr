import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { BoardStore } from "../server/board-store.mjs";
import { CalendarSyncManager } from "./calendar-sync.mjs";

const directories = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "schedugrr-calendar-test-"));
  directories.push(directory);
  const store = new BoardStore(join(directory, "board.json"));
  await store.ready;
  await store.createList({ name: "Work", color: "sky" });
  const list = Object.values((await store.read()).lists)[0];
  await store.createTask({ title: "Timed task", listId: list.id, date: "2026-08-20", time: "09:30" });
  await store.createTask({ title: "All-day task", listId: list.id, date: "2026-08-21" });
  const calls = [];
  const bridge = {
    authorizationStatus: () => "fullAccess",
    requestFullAccess: async () => ({ granted: true, authorization: "fullAccess" }),
    listCalendars: async () => [{ id: "cal-1", title: "ScheduGrr", source: "iCloud", color: "#5c7a5a", writable: true }],
    syncTasks: async (input) => {
      calls.push(input);
      return {
        mappings: Object.fromEntries(input.tasks.filter((task) => task.date).map((task) => [task.id, `event-${task.id}`])),
        created: 2,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: [],
      };
    },
  };
  const manager = new CalendarSyncManager({
    bridge,
    store,
    settingsPath: join(directory, "calendar-settings.json"),
    mappingsPath: join(directory, "calendar-mappings.json"),
    debounceMs: 10,
  });
  await manager.ready;
  return { directory, store, bridge, calls, manager };
}

test("requires a selected calendar before enabling sync", async () => {
  const { manager } = await fixture();
  await assert.rejects(() => manager.updateSettings({ enabled: true }), /Choose a calendar/);
  manager.close();
});

test("syncs normalized tasks and persists settings and event mappings", async () => {
  const { directory, calls, manager } = await fixture();
  const status = await manager.updateSettings({ enabled: true, calendarId: "cal-1", includeUntimed: true });
  assert.equal(status.settings.enabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tasks[0].listName, "Work");
  assert.equal(calls[0].includeUntimed, true);

  const settings = JSON.parse(await readFile(join(directory, "calendar-settings.json"), "utf8"));
  const mappings = JSON.parse(await readFile(join(directory, "calendar-mappings.json"), "utf8"));
  assert.equal(settings.calendarId, "cal-1");
  assert.equal(Object.keys(mappings).length, 2);
  manager.close();
});

test("debounces automatic sync after board edits", async () => {
  const { store, calls, manager } = await fixture();
  await manager.updateSettings({ enabled: true, calendarId: "cal-1" });
  calls.length = 0;
  const task = Object.values((await store.read()).tasks)[0];
  await store.updateTask(task.id, { title: "Renamed task" });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tasks.find((candidate) => candidate.id === task.id).title, "Renamed task");
  manager.close();
});
