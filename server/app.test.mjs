import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { BoardStore } from "./board-store.mjs";
import { createScheduGrrServer } from "./app.mjs";

let directory;
let dataFile;
let server;
let base;
const calendar = {
  settings: { enabled: false, calendarId: null, includeUntimed: true, durationMinutes: 30 },
  async getStatus() {
    return { available: true, platform: "darwin", authorization: "fullAccess", settings: this.settings, lastSync: null };
  },
  async requestAccess() {
    return { granted: true, authorization: "fullAccess" };
  },
  async listCalendars() {
    return [{ id: "calendar-1", title: "ScheduGrr", source: "iCloud", color: "#5c7a5a", writable: true }];
  },
  async updateSettings(input) {
    this.settings = { ...this.settings, ...input };
    return this.getStatus();
  },
  async syncNow() {
    return { at: "2026-08-17T12:00:00.000Z", created: 1, updated: 0, deleted: 0, skipped: 0, errors: [] };
  },
};

const localHeaders = {
  "Content-Type": "application/json",
  Origin: "http://127.0.0.1:5173",
};

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${base}${path}`, options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const payload = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          async json() {
            return JSON.parse(payload);
          },
        });
      });
    });
    req.on("error", reject);
    req.end(options.body);
  });
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "schedugrr-api-test-"));
  dataFile = join(directory, "board.json");
  server = createScheduGrrServer(new BoardStore(dataFile), { calendar });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

test("starts empty so the browser can upload its existing local board", async () => {
  const response = await request("/api/board");
  assert.equal(response.status, 200);
  const board = await response.json();
  assert.equal(board.initialized, false);
  assert.deepEqual(board.lists, {});
});

test("creates lists and tasks using human-friendly list names", async () => {
  const listResponse = await request("/api/lists", {
    method: "POST",
    headers: localHeaders,
    body: JSON.stringify({ name: "Grant", color: "sky" }),
  });
  assert.equal(listResponse.status, 201);
  const { list } = await listResponse.json();

  const taskResponse = await request("/api/tasks", {
    method: "POST",
    headers: localHeaders,
    body: JSON.stringify({
      title: "Draft application",
      listName: "Grant",
      date: "2026-08-20",
      time: "09:30",
      priority: "high",
    }),
  });
  assert.equal(taskResponse.status, 201);
  const { task } = await taskResponse.json();
  assert.equal(task.listId, list.id);
  assert.equal(task.date, "2026-08-20");
  assert.equal(task.time, "09:30");

  const queryResponse = await request("/api/tasks?q=application&status=open");
  const query = await queryResponse.json();
  assert.equal(query.tasks.length, 1);
  assert.equal(query.tasks[0].id, task.id);
});

test("updates, schedules, and completes a task", async () => {
  const tasks = await (await request("/api/tasks")).json();
  const task = tasks.tasks[0];
  const response = await request(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: localHeaders,
    body: JSON.stringify({ completed: true, date: null, notes: "Ready for review" }),
  });
  assert.equal(response.status, 200);
  const updated = (await response.json()).task;
  assert.equal(updated.completed, true);
  assert.equal(updated.date, null);
  assert.equal(updated.time, null);
  assert.equal(updated.notes, "Ready for review");
});

test("returns grouped context and a machine-readable OpenAPI contract", async () => {
  const context = await (await request("/api/context")).json();
  assert.equal(context.app, "schedugrr");
  assert.equal(context.lists[0].name, "Grant");
  assert.equal(context.lists[0].tasks.length, 1);

  const specResponse = await request("/openapi.json");
  assert.equal(specResponse.status, 200);
  const spec = await specResponse.json();
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/api/tasks"]);
});

test("persists mutations atomically to the configured JSON file", async () => {
  const persisted = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(persisted.app, "schedugrr");
  assert.equal(persisted.initialized, true);
  assert.equal(Object.keys(persisted.tasks).length, 1);
});

test("defaults list tasks to priority order and preserves explicit manual order", async () => {
  const listResponse = await request("/api/lists", {
    method: "POST",
    headers: localHeaders,
    body: JSON.stringify({ name: "Ordering", color: "plum" }),
  });
  const { list } = await listResponse.json();
  const created = [];
  for (const [title, priority] of [["Low", "low"], ["High", "high"], ["Medium", "medium"]]) {
    const response = await request("/api/tasks", {
      method: "POST",
      headers: localHeaders,
      body: JSON.stringify({ title, priority, listId: list.id }),
    });
    created.push((await response.json()).task);
  }

  let context = await (await request("/api/context")).json();
  let ordered = context.lists.find((candidate) => candidate.id === list.id);
  assert.deepEqual(ordered.tasks.map((task) => task.title), ["High", "Medium", "Low"]);

  await request(`/api/tasks/${created[0].id}/move`, {
    method: "POST",
    headers: localHeaders,
    body: JSON.stringify({ listId: list.id, index: 0 }),
  });
  context = await (await request("/api/context")).json();
  ordered = context.lists.find((candidate) => candidate.id === list.id);
  assert.equal(ordered.taskOrder, "manual");
  assert.deepEqual(ordered.tasks.map((task) => task.title), ["Low", "High", "Medium"]);

  await request(`/api/lists/${list.id}`, {
    method: "PATCH",
    headers: localHeaders,
    body: JSON.stringify({ taskOrder: "priority" }),
  });
  context = await (await request("/api/context")).json();
  ordered = context.lists.find((candidate) => candidate.id === list.id);
  assert.deepEqual(ordered.tasks.map((task) => task.title), ["High", "Medium", "Low"]);
});

test("rejects browser mutations from non-local origins", async () => {
  const response = await request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.com" },
    body: JSON.stringify({ title: "Should not exist" }),
  });
  assert.equal(response.status, 403);
});

test("exposes native calendar status, settings, and manual sync", async () => {
  const status = await (await request("/api/calendar/status")).json();
  assert.equal(status.available, true);
  assert.equal(status.authorization, "fullAccess");

  const calendars = await (await request("/api/calendar/calendars")).json();
  assert.equal(calendars.calendars[0].source, "iCloud");

  const settingsResponse = await request("/api/calendar/settings", {
    method: "PUT",
    headers: localHeaders,
    body: JSON.stringify({ enabled: true, calendarId: "calendar-1" }),
  });
  assert.equal(settingsResponse.status, 200);
  assert.equal((await settingsResponse.json()).settings.enabled, true);

  const sync = await request("/api/calendar/sync", { method: "POST", headers: localHeaders });
  assert.equal(sync.status, 200);
  assert.equal((await sync.json()).sync.created, 1);
});
