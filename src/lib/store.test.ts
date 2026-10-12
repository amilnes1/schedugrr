import { beforeEach, describe, expect, it } from "vitest";
import { useBoard, selectTasksForList, selectTasksForDay, selectUnscheduled } from "./store";
import type { List, Task } from "./types";

function list(id: string, order: number): List {
  return { id, name: id, color: "ink", order, taskOrder: "priority" };
}

function task(id: string, listId: string, order: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: "",
    listId,
    date: null,
    time: null,
    completed: false,
    priority: "none",
    order,
    dayOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

/** Reset to a small, deterministic document before each test. */
beforeEach(() => {
  useBoard.getState().replaceDocument({
    lists: { a: list("a", 0), b: list("b", 1) },
    tasks: {
      t1: task("t1", "a", 0),
      t2: task("t2", "a", 1),
      t3: task("t3", "a", 2),
      t4: task("t4", "b", 0),
    },
  });
});

const state = () => useBoard.getState();

describe("tasks", () => {
  it("adds a task to the end of its list", () => {
    const id = state().addTask({ title: "new", listId: "a" });
    const tasks = selectTasksForList(state(), "a");
    expect(tasks.at(-1)!.id).toBe(id);
    expect(tasks.at(-1)!.order).toBe(3);
  });

  it("toggles completion", () => {
    state().toggleTask("t1");
    expect(state().tasks.t1.completed).toBe(true);
    state().toggleTask("t1");
    expect(state().tasks.t1.completed).toBe(false);
  });

  it("removes a task", () => {
    state().removeTask("t2");
    expect(state().tasks.t2).toBeUndefined();
    expect(selectTasksForList(state(), "a").map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("clears every task while preserving lists", () => {
    state().clearAllTasks();
    expect(state().tasks).toEqual({});
    expect(Object.keys(state().lists)).toEqual(["a", "b"]);
  });
});

describe("moveTaskToList", () => {
  it("reorders within a list", () => {
    state().moveTaskToList("t3", "a", 0);
    expect(selectTasksForList(state(), "a").map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
    expect(state().lists.a.taskOrder).toBe("manual");
  });

  it("moves across lists and densely reindexes both", () => {
    state().moveTaskToList("t1", "b", 0);
    expect(state().tasks.t1.listId).toBe("b");
    expect(selectTasksForList(state(), "b").map((t) => t.id)).toEqual(["t1", "t4"]);
    const a = selectTasksForList(state(), "a");
    expect(a.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(a.map((t) => t.order)).toEqual([0, 1]);
  });

  it("appends when no index is given", () => {
    state().moveTaskToList("t1", "b");
    expect(selectTasksForList(state(), "b").map((t) => t.id)).toEqual(["t4", "t1"]);
  });
});

describe("priority ordering", () => {
  it("sorts untouched lists high to low by default", () => {
    state().updateTask("t1", { priority: "low" });
    state().updateTask("t2", { priority: "high" });
    state().updateTask("t3", { priority: "medium" });
    expect(selectTasksForList(state(), "a").map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
  });

  it("preserves a user's manual reorganization even when priorities change", () => {
    state().updateTask("t1", { priority: "high" });
    state().moveTaskToList("t3", "a", 0);
    state().updateTask("t2", { priority: "high" });
    expect(selectTasksForList(state(), "a").map((t) => t.id)).toEqual(["t3", "t1", "t2"]);
  });

  it("can restore priority ordering after a manual reorganization", () => {
    state().updateTask("t1", { priority: "low" });
    state().updateTask("t2", { priority: "high" });
    state().moveTaskToList("t1", "a", 0);
    state().setListTaskOrder("a", "priority");
    expect(selectTasksForList(state(), "a").map((t) => t.id)).toEqual(["t2", "t1", "t3"]);
  });
});

describe("scheduling", () => {
  it("moves a task onto a day and assigns sequential dayOrder", () => {
    state().moveTaskToDay("t1", "2026-08-20");
    state().moveTaskToDay("t2", "2026-08-20");
    const day = selectTasksForDay(state(), "2026-08-20");
    expect(day.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(day.map((t) => t.dayOrder)).toEqual([0, 1]);
  });

  it("reschedules between days and reindexes the origin", () => {
    state().moveTaskToDay("t1", "2026-08-20");
    state().moveTaskToDay("t2", "2026-08-20");
    state().moveTaskToDay("t1", "2026-08-21");
    expect(selectTasksForDay(state(), "2026-08-20").map((t) => t.id)).toEqual(["t2"]);
    expect(state().tasks.t2.dayOrder).toBe(0);
    expect(state().tasks.t1.date).toBe("2026-08-21");
  });

  it("does not change a task's list when scheduling", () => {
    state().moveTaskToDay("t4", "2026-08-20");
    expect(state().tasks.t4.listId).toBe("b");
  });

  it("unschedules a task without deleting it", () => {
    state().moveTaskToDay("t1", "2026-08-20");
    state().updateTask("t1", { time: "09:30" });
    state().unscheduleTask("t1");
    expect(state().tasks.t1.date).toBeNull();
    expect(state().tasks.t1.time).toBeNull();
    expect(selectUnscheduled(state()).some((t) => t.id === "t1")).toBe(true);
  });

  it("sorts timed tasks chronologically before untimed tasks", () => {
    state().moveTaskToDay("t1", "2026-08-20");
    state().moveTaskToDay("t2", "2026-08-20");
    state().moveTaskToDay("t3", "2026-08-20");
    state().updateTask("t1", { time: "14:00" });
    state().updateTask("t2", { time: "09:30" });
    expect(selectTasksForDay(state(), "2026-08-20").map((t) => t.id)).toEqual(["t2", "t1", "t3"]);
  });

  it("omits completed tasks from the unscheduled tray", () => {
    state().toggleTask("t1");
    expect(selectUnscheduled(state()).some((t) => t.id === "t1")).toBe(false);
  });
});

describe("lists", () => {
  it("deletes a list together with its tasks", () => {
    state().removeList("a");
    expect(state().lists.a).toBeUndefined();
    expect(state().tasks.t1).toBeUndefined();
    expect(state().tasks.t4).toBeDefined();
  });

  it("reorders lists", () => {
    state().reorderLists(["b", "a"]);
    expect(state().lists.b.order).toBe(0);
    expect(state().lists.a.order).toBe(1);
  });

  it("adds a list at the end", () => {
    const id = state().addList("c", "sage");
    expect(state().lists[id].order).toBe(2);
    expect(state().lists[id].color).toBe("sage");
    expect(state().lists[id].taskOrder).toBe("priority");
  });
});
