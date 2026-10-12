import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { ColorKey, List, Priority, Task, TaskOrderMode } from "./types";
import { seedDocument } from "./seed";
import { persistStorage } from "./storage";

/**
 * The ScheduGrr store.
 *
 * Every mutation is expressed as a small, explicitly named action so the same
 * surface can be driven by the UI today and by an LLM tool layer tomorrow.
 * All actions keep the two ordering axes (`order` within a list, `dayOrder`
 * within a calendar day) densely reindexed so callers never manage positions.
 */

export interface NewTaskInput {
  title: string;
  listId: string;
  date?: string | null;
  time?: string | null;
  notes?: string;
  priority?: Priority;
}

interface StoreState {
  lists: Record<string, List>;
  tasks: Record<string, Task>;

  // ── Lists ────────────────────────────────────────────────
  addList: (name: string, color?: ColorKey) => string;
  renameList: (id: string, name: string) => void;
  setListColor: (id: string, color: ColorKey) => void;
  setListTaskOrder: (id: string, mode: TaskOrderMode) => void;
  /** Archive only completed items; unfinished items remain active. */
  archiveListTasks: (id: string) => void;
  restoreListTasks: (id: string) => void;
  removeList: (id: string) => void;
  reorderLists: (orderedIds: string[]) => void;

  // ── Tasks ────────────────────────────────────────────────
  addTask: (input: NewTaskInput) => string;
  updateTask: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  clearAllTasks: () => void;

  /** Move a task into a list at a given index (defaults to the end). */
  moveTaskToList: (taskId: string, listId: string, index?: number) => void;
  /** Schedule (or reschedule) a task onto a calendar day at a given index. */
  moveTaskToDay: (taskId: string, date: string, index?: number) => void;
  /** Remove a task from the calendar without deleting it. */
  unscheduleTask: (taskId: string) => void;

  // ── Document ─────────────────────────────────────────────
  replaceDocument: (doc: { lists: Record<string, List>; tasks: Record<string, Task> }) => void;
  resetToSeed: () => void;
}

const now = () => Date.now();

/** Return the ids of a scope, densely re-sorted, writing back sequential order. */
function reindex(
  tasks: Record<string, Task>,
  ids: string[],
  key: "order" | "dayOrder",
) {
  ids.forEach((id, i) => {
    const t = tasks[id];
    if (t) t[key] = i;
  });
}

function listTaskIds(tasks: Record<string, Task>, listId: string): string[] {
  return Object.values(tasks)
    .filter((t) => t.listId === listId)
    .sort((a, b) => a.order - b.order)
    .map((t) => t.id);
}

function dayTaskIds(tasks: Record<string, Task>, date: string): string[] {
  return Object.values(tasks)
    .filter((t) => t.date === date)
    .sort((a, b) => a.dayOrder - b.dayOrder)
    .map((t) => t.id);
}

function setListTasksArchived(tasks: Record<string, Task>, listId: string, archived: boolean) {
  return Object.fromEntries(
    Object.entries(tasks).map(([id, task]) => [
      id,
      task.listId === listId && Boolean(task.archived) !== archived && (!archived || task.completed)
        ? { ...task, archived }
        : task,
    ]),
  );
}

export const useBoard = create<StoreState>()(
  persist(
    (set) => ({
      ...seedDocument(),

      addList: (name, color = "ink") => {
        const id = nanoid(8);
        set((s) => {
          const order = Object.values(s.lists).reduce((m, l) => Math.max(m, l.order), -1) + 1;
          return {
            lists: {
              ...s.lists,
              [id]: { id, name: name.trim() || "Untitled", color, order, taskOrder: "priority" },
            },
          };
        });
        return id;
      },

      renameList: (id, name) =>
        set((s) =>
          s.lists[id]
            ? { lists: { ...s.lists, [id]: { ...s.lists[id], name: name.trim() || "Untitled" } } }
            : s,
        ),

      setListColor: (id, color) =>
        set((s) =>
          s.lists[id] ? { lists: { ...s.lists, [id]: { ...s.lists[id], color } } } : s,
        ),

      setListTaskOrder: (id, taskOrder) =>
        set((s) =>
          s.lists[id]
            ? { lists: { ...s.lists, [id]: { ...s.lists[id], taskOrder } } }
            : s,
        ),

      archiveListTasks: (id) =>
        set((s) => s.lists[id] ? { tasks: setListTasksArchived(s.tasks, id, true) } : s),

      restoreListTasks: (id) =>
        set((s) => s.lists[id] ? { tasks: setListTasksArchived(s.tasks, id, false) } : s),

      removeList: (id) =>
        set((s) => {
          const lists = { ...s.lists };
          delete lists[id];
          const tasks = { ...s.tasks };
          for (const t of Object.values(tasks)) {
            if (t.listId === id) delete tasks[t.id];
          }
          return { lists, tasks };
        }),

      reorderLists: (orderedIds) =>
        set((s) => {
          const lists = { ...s.lists };
          orderedIds.forEach((id, i) => {
            if (lists[id]) lists[id] = { ...lists[id], order: i };
          });
          return { lists };
        }),

      addTask: ({ title, listId, date = null, time = null, notes = "", priority = "none" }) => {
        const id = nanoid(8);
        set((s) => {
          if (!s.lists[listId]) return s;
          const tasks = { ...s.tasks };
          const order =
            Object.values(tasks)
              .filter((t) => t.listId === listId)
              .reduce((m, t) => Math.max(m, t.order), -1) + 1;
          const dayOrder =
            date == null
              ? 0
              : Object.values(tasks)
                  .filter((t) => t.date === date)
                  .reduce((m, t) => Math.max(m, t.dayOrder), -1) + 1;
          tasks[id] = {
            id,
            title: title.trim(),
            notes,
            listId,
            date,
            time: date ? time : null,
            completed: false,
            priority,
            order,
            dayOrder,
            createdAt: now(),
            updatedAt: now(),
          };
          return { tasks };
        });
        return id;
      },

      updateTask: (id, patch) =>
        set((s) =>
          s.tasks[id]
            ? { tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...patch, updatedAt: now() } } }
            : s,
        ),

      toggleTask: (id) =>
        set((s) =>
          s.tasks[id]
            ? {
                tasks: {
                  ...s.tasks,
                  [id]: { ...s.tasks[id], completed: !s.tasks[id].completed, updatedAt: now() },
                },
              }
            : s,
        ),

      removeTask: (id) =>
        set((s) => {
          if (!s.tasks[id]) return s;
          const tasks = { ...s.tasks };
          delete tasks[id];
          return { tasks };
        }),

      clearAllTasks: () => set({ tasks: {} }),

      moveTaskToList: (taskId, listId, index) =>
        set((s) => {
          const task = s.tasks[taskId];
          if (!task || !s.lists[listId]) return s;
          const tasks = { ...s.tasks };
          const fromList = task.listId;

          // Detach from its current list ordering.
          const target = selectTasksForList(s, listId)
            .map((candidate) => candidate.id)
            .filter((id) => id !== taskId);
          const at = index == null ? target.length : Math.max(0, Math.min(index, target.length));
          target.splice(at, 0, taskId);

          tasks[taskId] = { ...task, listId, updatedAt: now() };
          reindex(tasks, target, "order");
          if (fromList !== listId) {
            reindex(tasks, listTaskIds(tasks, fromList), "order");
          }
          if (index == null) return { tasks };
          return {
            tasks,
            lists: {
              ...s.lists,
              [listId]: { ...s.lists[listId], taskOrder: "manual" },
            },
          };
        }),

      moveTaskToDay: (taskId, date, index) =>
        set((s) => {
          const task = s.tasks[taskId];
          if (!task) return s;
          const tasks = { ...s.tasks };
          const fromDate = task.date;

          const target = dayTaskIds(tasks, date).filter((id) => id !== taskId);
          const at = index == null ? target.length : Math.max(0, Math.min(index, target.length));
          target.splice(at, 0, taskId);

          tasks[taskId] = { ...task, date, updatedAt: now() };
          reindex(tasks, target, "dayOrder");
          if (fromDate && fromDate !== date) {
            reindex(tasks, dayTaskIds(tasks, fromDate), "dayOrder");
          }
          return { tasks };
        }),

      unscheduleTask: (taskId) =>
        set((s) => {
          const task = s.tasks[taskId];
          if (!task || task.date == null) return s;
          const tasks = { ...s.tasks };
          const fromDate = task.date;
          tasks[taskId] = { ...task, date: null, time: null, dayOrder: 0, updatedAt: now() };
          reindex(tasks, dayTaskIds(tasks, fromDate), "dayOrder");
          return { tasks };
        }),

      replaceDocument: (doc) => set({ lists: doc.lists, tasks: doc.tasks }),

      resetToSeed: () => set(seedDocument()),
    }),
    {
      name: "schedugrr.v1",
      version: 3,
      storage: persistStorage,
      migrate: (persisted) => {
        const state = persisted as Pick<StoreState, "lists" | "tasks">;
        return {
          ...state,
          lists: Object.fromEntries(
            Object.entries(state.lists ?? {}).map(([id, list]) => [
              id,
              { ...list, taskOrder: list.taskOrder ?? "priority" },
            ]),
          ),
          tasks: Object.fromEntries(
            Object.entries(state.tasks ?? {}).map(([id, task]) => [
              id,
              { ...task, time: task.time ?? null },
            ]),
          ),
        } as StoreState;
      },
    },
  ),
);

/** A read-only snapshot of the store (state + actions), as returned by getState. */
export type StoreSnapshot = StoreState;

// ── Derived selectors (pure helpers over a snapshot) ───────────────────────

export function selectSortedLists(s: Pick<StoreState, "lists">): List[] {
  return Object.values(s.lists).sort((a, b) => a.order - b.order);
}

export function selectTasksForList(
  s: Pick<StoreState, "tasks"> & Partial<Pick<StoreState, "lists">>,
  listId: string,
): Task[] {
  const mode = s.lists?.[listId]?.taskOrder ?? "priority";
  const priorityRank: Record<Priority, number> = { high: 3, medium: 2, low: 1, none: 0 };
  return Object.values(s.tasks)
    .filter((t) => t.listId === listId && !t.archived)
    .sort((a, b) =>
      mode === "priority"
        ? priorityRank[b.priority] - priorityRank[a.priority] || a.order - b.order
        : a.order - b.order,
    );
}

export function selectTasksForDay(
  s: Pick<StoreState, "tasks">,
  date: string,
): Task[] {
  return Object.values(s.tasks)
    .filter((t) => t.date === date && !t.archived)
    .sort((a, b) => {
      const byTime = (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
      return byTime || a.dayOrder - b.dayOrder;
    });
}

export function selectUnscheduled(s: Pick<StoreState, "tasks">): Task[] {
  return Object.values(s.tasks)
    .filter((t) => t.date == null && !t.completed && !t.archived)
    .sort((a, b) => a.order - b.order);
}
