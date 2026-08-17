import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const COLOR_KEYS = ["accent", "sage", "gold", "sky", "plum", "ink"];
export const PRIORITIES = ["none", "low", "medium", "high"];
export const TASK_ORDER_MODES = ["priority", "manual"];
const PRIORITY_RANK = { none: 0, low: 1, medium: 2, high: 3 };

const clone = (value) => structuredClone(value);
const timestamp = () => Date.now();
const makeId = (prefix) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

export function emptyBoardFile() {
  return {
    app: "schedugrr",
    version: 1,
    initialized: false,
    revision: 0,
    lists: {},
    tasks: {},
  };
}

function sortedLists(doc) {
  return Object.values(doc.lists).sort((a, b) => a.order - b.order);
}

function idsForList(doc, listId) {
  const mode = doc.lists[listId]?.taskOrder ?? "priority";
  return Object.values(doc.tasks)
    .filter((task) => task.listId === listId)
    .sort((a, b) =>
      mode === "priority"
        ? PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.order - b.order
        : a.order - b.order,
    )
    .map((task) => task.id);
}

function idsForDay(doc, date) {
  return Object.values(doc.tasks)
    .filter((task) => task.date === date)
    .sort((a, b) => a.dayOrder - b.dayOrder)
    .map((task) => task.id);
}

function reindex(doc, ids, key) {
  ids.forEach((id, index) => {
    if (doc.tasks[id]) doc.tasks[id][key] = index;
  });
}

function insert(ids, id, index) {
  const without = ids.filter((candidate) => candidate !== id);
  const at = index == null ? without.length : Math.max(0, Math.min(Number(index), without.length));
  without.splice(at, 0, id);
  return without;
}

function assertDate(date) {
  if (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new ApiError(400, "date must be null or yyyy-MM-dd");
  }
}

function assertTime(time) {
  if (time !== null && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw new ApiError(400, "time must be null or HH:mm");
  }
}

function assertColor(color) {
  if (!COLOR_KEYS.includes(color)) {
    throw new ApiError(400, `color must be one of: ${COLOR_KEYS.join(", ")}`);
  }
}

function assertPriority(priority) {
  if (!PRIORITIES.includes(priority)) {
    throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(", ")}`);
  }
}

function assertTaskOrder(taskOrder) {
  if (!TASK_ORDER_MODES.includes(taskOrder)) {
    throw new ApiError(400, `taskOrder must be one of: ${TASK_ORDER_MODES.join(", ")}`);
  }
}

function resolveList(doc, input = {}, { required = true } = {}) {
  if (input.listId) {
    const list = doc.lists[input.listId];
    if (!list) throw new ApiError(404, `List not found: ${input.listId}`);
    return list;
  }
  if (input.listName) {
    const name = String(input.listName).trim().toLowerCase();
    const list = sortedLists(doc).find((candidate) => candidate.name.toLowerCase() === name);
    if (!list) throw new ApiError(404, `List not found: ${input.listName}`);
    return list;
  }
  if (required) throw new ApiError(400, "listId or listName is required");
  return null;
}

function ensureInbox(doc) {
  const existing = sortedLists(doc)[0];
  if (existing) return existing;
  const id = makeId("list");
  const list = { id, name: "Inbox", color: "accent", order: 0, taskOrder: "priority" };
  doc.lists[id] = list;
  return list;
}

function moveTaskToList(doc, task, listId, index) {
  if (!doc.lists[listId]) throw new ApiError(404, `List not found: ${listId}`);
  const fromList = task.listId;
  task.listId = listId;
  reindex(doc, insert(idsForList(doc, listId), task.id, index), "order");
  if (index != null) doc.lists[listId].taskOrder = "manual";
  if (fromList !== listId) reindex(doc, idsForList(doc, fromList), "order");
}

function moveTaskToDate(doc, task, date, index) {
  assertDate(date);
  const fromDate = task.date;
  if (date === null) {
    task.date = null;
    task.time = null;
    task.dayOrder = 0;
  } else {
    task.date = date;
    reindex(doc, insert(idsForDay(doc, date), task.id, index), "dayOrder");
  }
  if (fromDate && fromDate !== date) reindex(doc, idsForDay(doc, fromDate), "dayOrder");
}

export function assertBoardDocument(input) {
  if (!input || typeof input !== "object" || !input.lists || !input.tasks) {
    throw new ApiError(400, "lists and tasks records are required");
  }
  const lists = clone(input.lists);
  const tasks = clone(input.tasks);
  for (const [id, list] of Object.entries(lists)) {
    if (!list || list.id !== id || typeof list.name !== "string" || !Number.isFinite(list.order)) {
      throw new ApiError(400, `Invalid list: ${id}`);
    }
    assertColor(list.color);
    list.taskOrder ??= "priority";
    assertTaskOrder(list.taskOrder);
  }
  for (const [id, task] of Object.entries(tasks)) {
    if (!task || task.id !== id || typeof task.title !== "string" || !lists[task.listId]) {
      throw new ApiError(400, `Invalid task: ${id}`);
    }
    assertDate(task.date);
    task.time ??= null;
    assertTime(task.time);
    if (task.time && !task.date) throw new ApiError(400, `Task time requires a date: ${id}`);
    assertPriority(task.priority);
  }
  return { lists, tasks };
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export class BoardStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.document = emptyBoardFile();
    this.queue = Promise.resolve();
    this.listeners = new Set();
    this.ready = this.load();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      const { lists, tasks } = assertBoardDocument(parsed);
      this.document = {
        ...emptyBoardFile(),
        ...parsed,
        app: "schedugrr",
        initialized: parsed.initialized !== false,
        lists,
        tasks,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async read() {
    await this.ready;
    await this.queue;
    return clone(this.document);
  }

  async transact(mutator) {
    await this.ready;
    const operation = this.queue.then(async () => {
      const draft = clone(this.document);
      const value = mutator(draft);
      draft.app = "schedugrr";
      draft.version = 1;
      draft.initialized = true;
      draft.revision = this.document.revision + 1;
      await this.persist(draft);
      this.document = draft;
      for (const listener of this.listeners) {
        try {
          listener(clone(draft));
        } catch (error) {
          console.warn("ScheduGrr store listener failed", error);
        }
      }
      return { value: clone(value), document: clone(draft) };
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async persist(document) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await rename(temporary, this.filePath);
  }

  replace(input) {
    return this.transact((draft) => {
      const { lists, tasks } = assertBoardDocument(input);
      draft.lists = lists;
      draft.tasks = tasks;
      return { lists, tasks };
    });
  }

  createList(input = {}) {
    return this.transact((draft) => {
      const name = String(input.name ?? "").trim();
      if (!name) throw new ApiError(400, "name is required");
      const color = input.color ?? "ink";
      assertColor(color);
      const id = makeId("list");
      const order = sortedLists(draft).length;
      const list = { id, name, color, order, taskOrder: "priority" };
      draft.lists[id] = list;
      return list;
    });
  }

  updateList(id, input = {}) {
    return this.transact((draft) => {
      const list = draft.lists[id];
      if (!list) throw new ApiError(404, `List not found: ${id}`);
      if (input.name !== undefined) {
        const name = String(input.name).trim();
        if (!name) throw new ApiError(400, "name cannot be empty");
        list.name = name;
      }
      if (input.color !== undefined) {
        assertColor(input.color);
        list.color = input.color;
      }
      if (input.taskOrder !== undefined) {
        assertTaskOrder(input.taskOrder);
        list.taskOrder = input.taskOrder;
      }
      return list;
    });
  }

  deleteList(id) {
    return this.transact((draft) => {
      if (!draft.lists[id]) throw new ApiError(404, `List not found: ${id}`);
      delete draft.lists[id];
      for (const task of Object.values(draft.tasks)) {
        if (task.listId === id) delete draft.tasks[task.id];
      }
      sortedLists(draft).forEach((list, order) => {
        list.order = order;
      });
      return { deleted: id };
    });
  }

  createTask(input = {}) {
    return this.transact((draft) => {
      const title = String(input.title ?? "").trim();
      if (!title) throw new ApiError(400, "title is required");
      const list = input.listId || input.listName ? resolveList(draft, input) : ensureInbox(draft);
      const date = input.date ?? null;
      const time = input.time ?? null;
      const priority = input.priority ?? "none";
      assertDate(date);
      assertTime(time);
      if (time && !date) throw new ApiError(400, "time requires a scheduled date");
      assertPriority(priority);
      const id = makeId("task");
      const task = {
        id,
        title,
        notes: String(input.notes ?? ""),
        listId: list.id,
        date,
        time,
        completed: Boolean(input.completed ?? false),
        priority,
        order: idsForList(draft, list.id).length,
        dayOrder: date ? idsForDay(draft, date).length : 0,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      draft.tasks[id] = task;
      return task;
    });
  }

  updateTask(id, input = {}) {
    return this.transact((draft) => {
      const task = draft.tasks[id];
      if (!task) throw new ApiError(404, `Task not found: ${id}`);
      if (input.title !== undefined) {
        const title = String(input.title).trim();
        if (!title) throw new ApiError(400, "title cannot be empty");
        task.title = title;
      }
      if (input.notes !== undefined) task.notes = String(input.notes);
      if (input.completed !== undefined) task.completed = Boolean(input.completed);
      if (input.priority !== undefined) {
        assertPriority(input.priority);
        task.priority = input.priority;
      }
      if (input.listId !== undefined || input.listName !== undefined) {
        const list = resolveList(draft, input);
        moveTaskToList(draft, task, list.id, input.index);
      }
      if (input.date !== undefined) moveTaskToDate(draft, task, input.date, input.index);
      if (input.time !== undefined) {
        assertTime(input.time);
        if (input.time && !task.date) throw new ApiError(400, "time requires a scheduled date");
        task.time = input.time;
      }
      task.updatedAt = timestamp();
      return task;
    });
  }

  moveTask(id, input = {}) {
    return this.updateTask(id, input);
  }

  deleteTask(id) {
    return this.transact((draft) => {
      const task = draft.tasks[id];
      if (!task) throw new ApiError(404, `Task not found: ${id}`);
      const { listId, date } = task;
      delete draft.tasks[id];
      reindex(draft, idsForList(draft, listId), "order");
      if (date) reindex(draft, idsForDay(draft, date), "dayOrder");
      return { deleted: id };
    });
  }
}
